//go:build windows

package network

import (
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/yusufpapurcu/wmi"
)

// Scan führt einen vollständigen Netzwerk-Scan auf Windows durch.
// includeWiFiPasswords steuert, ob WiFi-Passwörter ausgelesen werden.
// Passwörter werden niemals in Log-Dateien geschrieben.
func Scan(includeWiFiPasswords bool) (*ScanResult, error) {
	result := &ScanResult{Timestamp: time.Now()}

	adapters, errs := scanAdapters()
	result.Adapters = adapters
	result.Errors = append(result.Errors, errs...)

	shares, errs := scanShares()
	result.Shares = shares
	result.Errors = append(result.Errors, errs...)

	wifi, errs := scanWiFi(includeWiFiPasswords)
	result.WiFi = wifi
	result.Errors = append(result.Errors, errs...)

	return result, nil
}

// ─── Netzwerkadapter ─────────────────────────────────────────────────────────

type wmiNetAdapter struct {
	Name                string
	Description         string
	NetConnectionID     string
	MACAddress          string
	NetConnectionStatus uint16
	Speed               uint64
}

type wmiNetConfig struct {
	Description      string
	MACAddress       string
	IPAddress        []string
	IPSubnet         []string
	DefaultIPGateway []string
	DNSServerSearchOrder []string
	IPEnabled        bool
}

func scanAdapters() ([]Adapter, []ScanError) {
	var adapters []Adapter
	var errs []ScanError

	// Adapter-Liste mit Status
	var wmiAdapters []wmiNetAdapter
	if err := wmi.Query(`SELECT Name, Description, NetConnectionID, MACAddress, NetConnectionStatus, Speed
		FROM Win32_NetworkAdapter WHERE PhysicalAdapter=True OR NetConnectionID IS NOT NULL`, &wmiAdapters); err != nil {
		errs = append(errs, ScanError{"network.adapters", err.Error()})
		return adapters, errs
	}

	// IP-Konfigurationen
	var configs []wmiNetConfig
	if err := wmi.Query(`SELECT Description, MACAddress, IPAddress, IPSubnet, DefaultIPGateway, DNSServerSearchOrder, IPEnabled
		FROM Win32_NetworkAdapterConfiguration`, &configs); err != nil {
		errs = append(errs, ScanError{"network.config", err.Error()})
	}
	configByMAC := make(map[string]wmiNetConfig)
	for _, c := range configs {
		if c.MACAddress != "" {
			configByMAC[strings.ToUpper(c.MACAddress)] = c
		}
	}

	for _, a := range wmiAdapters {
		adapter := Adapter{
			Name:        strings.TrimSpace(a.NetConnectionID),
			Description: strings.TrimSpace(a.Description),
			MACAddress:  strings.ToUpper(strings.TrimSpace(a.MACAddress)),
			IsEnabled:   a.NetConnectionStatus != 0 && a.NetConnectionStatus != 7, // 7=Media disconnected
			IsConnected: a.NetConnectionStatus == 2,                               // 2=Connected
			Type:        classifyAdapter(a.Description, a.Name),
		}
		if a.Speed > 0 {
			adapter.Speed = formatSpeed(a.Speed)
		}
		// IP-Konfiguration zuordnen
		if cfg, ok := configByMAC[adapter.MACAddress]; ok {
			for i, ip := range cfg.IPAddress {
				if strings.Contains(ip, ".") {
					adapter.IPv4 = append(adapter.IPv4, ip)
					if i < len(cfg.IPSubnet) {
						adapter.SubnetMasks = append(adapter.SubnetMasks, cfg.IPSubnet[i])
					}
				} else if strings.Contains(ip, ":") && !strings.HasPrefix(ip, "fe80") {
					// Globale IPv6-Adressen (kein Link-Local)
					adapter.IPv6 = append(adapter.IPv6, ip)
				}
			}
			if len(cfg.DefaultIPGateway) > 0 {
				adapter.Gateway = cfg.DefaultIPGateway[0]
			}
			adapter.DNSServers = cfg.DNSServerSearchOrder
		}

		adapters = append(adapters, adapter)
	}

	return adapters, errs
}

// ─── Netzlaufwerke ───────────────────────────────────────────────────────────

type wmiShare struct {
	Name       string
	ProviderName string
	Status     string
}

func scanShares() ([]NetworkShare, []ScanError) {
	var shares []NetworkShare
	var errs []ScanError

	var wmiShares []wmiShare
	if err := wmi.Query(`SELECT Name, ProviderName, Status FROM Win32_MappedLogicalDisk`, &wmiShares); err != nil {
		// Fallback: net use
		return scanSharesFallback(&errs), errs
	}

	for _, s := range wmiShares {
		shares = append(shares, NetworkShare{
			DriveLetter: strings.TrimSuffix(strings.TrimSpace(s.Name), ":"),
			UNCPath:     strings.TrimSpace(s.ProviderName),
			Status:      "Connected",
		})
	}

	return shares, errs
}

func scanSharesFallback(errs *[]ScanError) []NetworkShare {
	var shares []NetworkShare
	out, err := exec.Command("net", "use").Output()
	if err != nil {
		*errs = append(*errs, ScanError{"network.shares", fmt.Sprintf("net use fehlgeschlagen: %v", err)})
		return shares
	}

	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		// Zeilen wie "OK         Y:        \\server\share    Microsoft Windows Network"
		if !strings.HasPrefix(line, "OK") && !strings.HasPrefix(line, "Disconnected") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		status := "Connected"
		if fields[0] == "Disconnected" {
			status = "Disconnected"
		}
		drive := strings.TrimSuffix(fields[1], ":")
		unc := fields[2]
		shares = append(shares, NetworkShare{
			DriveLetter: drive,
			UNCPath:     unc,
			Status:      status,
		})
	}
	return shares
}

// ─── WiFi-Profile ─────────────────────────────────────────────────────────────

func scanWiFi(includePasswords bool) ([]WiFiProfile, []ScanError) {
	var profiles []WiFiProfile
	var errs []ScanError

	// Aktuell verbundenes SSID ermitteln
	connectedSSID := ""
	connOut, err := exec.Command("netsh", "wlan", "show", "interfaces").Output()
	if err == nil {
		for _, line := range strings.Split(string(connOut), "\n") {
			if strings.Contains(line, "SSID") && !strings.Contains(line, "BSSID") {
				parts := strings.SplitN(line, ":", 2)
				if len(parts) == 2 {
					connectedSSID = strings.TrimSpace(parts[1])
					break
				}
			}
		}
	}

	// Alle gespeicherten Profile auflisten
	out, err := exec.Command("netsh", "wlan", "show", "profiles").Output()
	if err != nil {
		errs = append(errs, ScanError{"network.wifi", fmt.Sprintf("netsh wlan fehlgeschlagen: %v", err)})
		return profiles, errs
	}

	for _, line := range strings.Split(string(out), "\n") {
		// "    All User Profile     : MeinWLAN"
		if !strings.Contains(line, ": ") {
			continue
		}
		if !strings.Contains(strings.ToLower(line), "profile") {
			continue
		}
		parts := strings.SplitN(line, ": ", 2)
		if len(parts) != 2 {
			continue
		}
		ssid := strings.TrimSpace(parts[1])
		if ssid == "" {
			continue
		}

		profile := WiFiProfile{
			SSID:        ssid,
			IsConnected: ssid == connectedSSID,
		}

		// Detailinfos und optional Passwort holen
		detailArgs := []string{"wlan", "show", "profile", "name=" + ssid}
		if includePasswords {
			detailArgs = append(detailArgs, "key=clear")
		}
		detOut, err2 := exec.Command("netsh", detailArgs...).Output()
		if err2 == nil {
			parseWiFiDetail(string(detOut), &profile)
		}

		profiles = append(profiles, profile)
	}

	return profiles, errs
}

// parseWiFiDetail wertet die netsh-Detailausgabe eines WiFi-Profils aus.
// Passwörter werden extrahiert aber NIEMALS geloggt.
func parseWiFiDetail(output string, profile *WiFiProfile) {
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if strings.Contains(line, "Authentication") && strings.Contains(line, ":") {
			parts := strings.SplitN(line, ":", 2)
			profile.Security = classifyWiFiSecurity(strings.TrimSpace(parts[1]))
		}
		if strings.Contains(line, "Key Content") && strings.Contains(line, ":") {
			parts := strings.SplitN(line, ":", 2)
			pw := strings.TrimSpace(parts[1])
			if pw != "" {
				profile.HasPassword = true
				profile.Password = pw // sensitiv — wird im Frontend maskiert
			}
		}
		if strings.Contains(line, "Security key") && strings.Contains(line, ":") {
			parts := strings.SplitN(line, ":", 2)
			if strings.TrimSpace(parts[1]) != "Absent" {
				profile.HasPassword = true
			}
		}
	}
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

func classifyAdapter(desc, name string) AdapterType {
	d := strings.ToLower(desc + " " + name)
	switch {
	case strings.Contains(d, "wi-fi") || strings.Contains(d, "wireless") || strings.Contains(d, "wlan"):
		return AdapterWiFi
	case strings.Contains(d, "vpn") || strings.Contains(d, "tunnel"):
		return AdapterVPN
	case strings.Contains(d, "loopback") || strings.Contains(d, "pseudo"):
		return AdapterLoopback
	case strings.Contains(d, "bluetooth"):
		return AdapterBluetooth
	default:
		return AdapterEthernet
	}
}

func classifyWiFiSecurity(auth string) WiFiSecurity {
	lower := strings.ToLower(auth)
	switch {
	case strings.Contains(lower, "wpa3"):
		return WiFiWPA3
	case strings.Contains(lower, "wpa2"):
		return WiFiWPA2
	case strings.Contains(lower, "wpa"):
		return WiFiWPA
	case strings.Contains(lower, "wep"):
		return WiFiWEP
	case strings.Contains(lower, "open") || strings.Contains(lower, "none"):
		return WiFiOpen
	default:
		return WiFiWPA2
	}
}

func formatSpeed(bps uint64) string {
	switch {
	case bps >= 10_000_000_000:
		return fmt.Sprintf("%.0f Gbps", float64(bps)/1_000_000_000)
	case bps >= 1_000_000_000:
		return "1 Gbps"
	case bps >= 100_000_000:
		return "100 Mbps"
	case bps >= 54_000_000:
		return "54 Mbps (Wi-Fi)"
	default:
		return fmt.Sprintf("%d Mbps", bps/1_000_000)
	}
}
