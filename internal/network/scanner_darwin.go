//go:build darwin

package network

import (
	"fmt"
	"net"
	"os/exec"
	"strings"
	"time"
)

// Scan führt einen vollständigen Netzwerk-Scan auf macOS durch.
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

func scanAdapters() ([]Adapter, []ScanError) {
	var adapters []Adapter
	var errs []ScanError

	ifaces, err := net.Interfaces()
	if err != nil {
		errs = append(errs, ScanError{"network.adapters", err.Error()})
		return adapters, errs
	}

	// DNS-Server aus scutil holen (einmalig, dann per Interface zuordnen)
	dnsServers := fetchDNSServers(&errs)

	// Verbundenes WLAN
	connectedSSID := fetchConnectedSSID()

	// Gateway pro Interface via route-Tabelle
	gatewayMap := fetchGatewayMap()

	for _, iface := range ifaces {
		// Loopback und inaktive Interfaces überspringen
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		addrs, _ := iface.Addrs()
		var ipv4s, ipv6s, subnets []string

		for _, addr := range addrs {
			cidr := addr.String()
			ip, ipNet, parseErr := net.ParseCIDR(cidr)
			if parseErr != nil {
				continue
			}
			if ip.To4() != nil {
				ipv4s = append(ipv4s, ip.String())
				subnets = append(subnets, net.IP(ipNet.Mask).String())
			} else if !ip.IsLinkLocalUnicast() {
				ipv6s = append(ipv6s, ip.String())
			}
		}

		isUp := iface.Flags&net.FlagUp != 0
		adapterType := classifyInterface(iface.Name)

		adapter := Adapter{
			Name:        iface.Name,
			Description: describeInterface(iface.Name),
			Type:        adapterType,
			MACAddress:  strings.ToUpper(iface.HardwareAddr.String()),
			IsEnabled:   isUp,
			IsConnected: isUp && len(ipv4s) > 0,
			IPv4:        ipv4s,
			IPv6:        ipv6s,
			SubnetMasks: subnets,
			Gateway:     gatewayMap[iface.Name],
			DNSServers:  dnsServers,
		}

		// WiFi-Verbindungsgeschwindigkeit
		if adapterType == AdapterWiFi {
			_, speed := fetchWiFiDetails(iface.Name)
			if speed != "" {
				adapter.Speed = speed
			}
		}
		_ = connectedSSID // genutzt im WiFi-Profile-Scan

		adapters = append(adapters, adapter)
	}

	return adapters, errs
}

// fetchDNSServers liest die aktiven DNS-Server via scutil aus.
func fetchDNSServers(errs *[]ScanError) []string {
	out, err := exec.Command("scutil", "--dns").Output()
	if err != nil {
		*errs = append(*errs, ScanError{"network.dns", err.Error()})
		return nil
	}
	seen := make(map[string]bool)
	var servers []string
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "nameserver[") && strings.Contains(line, ":") {
			parts := strings.SplitN(line, ":", 2)
			ip := strings.TrimSpace(parts[1])
			if ip != "" && !seen[ip] {
				seen[ip] = true
				servers = append(servers, ip)
			}
		}
	}
	return servers
}

// fetchConnectedSSID gibt das aktuell verbundene WLAN-Netzwerk zurück.
func fetchConnectedSSID() string {
	out, err := exec.Command("networksetup", "-getairportnetwork", "en0").Output()
	if err != nil {
		return ""
	}
	// "Current Wi-Fi Network: MeinWLAN"
	parts := strings.SplitN(string(out), ":", 2)
	if len(parts) == 2 {
		return strings.TrimSpace(parts[1])
	}
	return ""
}

// fetchGatewayMap liest das Standard-Gateway pro Interface aus der Routing-Tabelle.
func fetchGatewayMap() map[string]string {
	gateways := make(map[string]string)
	out, err := exec.Command("netstat", "-rn", "-f", "inet").Output()
	if err != nil {
		return gateways
	}
	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 4 && fields[0] == "default" {
			iface := fields[3]
			if _, exists := gateways[iface]; !exists {
				gateways[iface] = fields[1]
			}
		}
	}
	return gateways
}

// fetchWiFiDetails gibt Signal-Info und Verbindungsgeschwindigkeit zurück.
func fetchWiFiDetails(iface string) (string, string) {
	out, err := exec.Command("/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport",
		"-I").Output()
	if err != nil {
		return "", ""
	}
	var signal, speed string
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "agrCtlRSSI:") {
			signal = strings.TrimSpace(strings.SplitN(line, ":", 2)[1]) + " dBm"
		}
		if strings.HasPrefix(line, "lastTxRate:") {
			txRate := strings.TrimSpace(strings.SplitN(line, ":", 2)[1])
			speed = txRate + " Mbps"
		}
	}
	return signal, speed
}

// ─── Netzlaufwerke ───────────────────────────────────────────────────────────

func scanShares() ([]NetworkShare, []ScanError) {
	var shares []NetworkShare
	var errs []ScanError

	// Gemountete Netzwerk-Volumes via mount
	out, err := exec.Command("mount").Output()
	if err != nil {
		errs = append(errs, ScanError{"network.shares", err.Error()})
		return shares, errs
	}

	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		// Netzwerk-Shares: "//user@server/share on /Volumes/share (smbfs, ...)"
		// oder "server:/export on /Volumes/nfs (nfs, ...)"
		if !strings.Contains(line, "smbfs") &&
			!strings.Contains(line, "nfs") &&
			!strings.Contains(line, "afpfs") &&
			!strings.Contains(line, "webdav") {
			continue
		}
		parts := strings.SplitN(line, " on ", 2)
		if len(parts) != 2 {
			continue
		}
		unc := strings.TrimSpace(parts[0])
		mountPart := strings.SplitN(parts[1], " (", 2)
		mountPath := strings.TrimSpace(mountPart[0])

		shares = append(shares, NetworkShare{
			DriveLetter: mountPath,
			UNCPath:     unc,
			Status:      "Connected",
		})
	}

	return shares, errs
}

// ─── WiFi-Profile ─────────────────────────────────────────────────────────────

func scanWiFi(includePasswords bool) ([]WiFiProfile, []ScanError) {
	var profiles []WiFiProfile
	var errs []ScanError

	connectedSSID := fetchConnectedSSID()

	// Bevorzugte WLAN-Netzwerke
	out, err := exec.Command("networksetup", "-listpreferredwirelessnetworks", "en0").Output()
	if err != nil {
		errs = append(errs, ScanError{"network.wifi", fmt.Sprintf("networksetup fehlgeschlagen: %v", err)})
		return profiles, errs
	}

	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		// Erste Zeile ist Header "Preferred networks on en0:"
		if line == "" || strings.Contains(line, "Preferred networks") {
			continue
		}

		ssid := line
		profile := WiFiProfile{
			SSID:        ssid,
			Security:    WiFiWPA2, // Standard-Annahme; macOS gibt Security nicht via CLI aus
			IsConnected: ssid == connectedSSID,
		}

		// Passwort aus Keychain (erfordert Benutzer-Zustimmung pro SSID)
		if includePasswords {
			pw, pwErr := fetchWiFiPassword(ssid)
			if pwErr == nil && pw != "" {
				profile.Password = pw // NIEMALS loggen
				profile.HasPassword = true
			} else {
				// Passwort existiert, aber kein Zugriff – aus Sicherheitstyp ableiten
				profile.HasPassword = profile.Security != WiFiOpen
			}
		} else {
			// Keine Keychain-Abfrage: HasPassword aus Sicherheitstyp ableiten
			// → verhindert bis zu N Systemdialoge beim Vollständigen Scan
			profile.HasPassword = profile.Security != WiFiOpen
		}

		profiles = append(profiles, profile)
	}

	return profiles, errs
}

// fetchWiFiPassword holt das WiFi-Passwort aus dem macOS-Keychain.
// Erfordert Benutzer-Zustimmung via Systemdialog beim ersten Aufruf.
// NIEMALS das Ergebnis loggen.
func fetchWiFiPassword(ssid string) (string, error) {
	out, err := exec.Command("security", "find-generic-password",
		"-D", "AirPort network password",
		"-a", ssid,
		"-w",
	).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}


// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

func classifyInterface(name string) AdapterType {
	switch {
	case strings.HasPrefix(name, "en"):
		// en0 = WiFi oder Ethernet — via airport prüfen
		out, err := exec.Command("networksetup", "-listallhardwareports").Output()
		if err == nil {
			lines := strings.Split(string(out), "\n")
			for i, line := range lines {
				if strings.Contains(line, "Device: "+name) && i > 0 {
					if strings.Contains(strings.ToLower(lines[i-1]), "wi-fi") ||
						strings.Contains(strings.ToLower(lines[i-1]), "airport") {
						return AdapterWiFi
					}
				}
			}
		}
		return AdapterEthernet
	case strings.HasPrefix(name, "utun"), strings.HasPrefix(name, "ipsec"), strings.HasPrefix(name, "tun"):
		return AdapterVPN
	case strings.HasPrefix(name, "lo"):
		return AdapterLoopback
	case strings.HasPrefix(name, "anpi"), strings.Contains(name, "bluetooth"):
		return AdapterBluetooth
	default:
		return AdapterOther
	}
}

func describeInterface(name string) string {
	out, err := exec.Command("networksetup", "-listallhardwareports").Output()
	if err != nil {
		return name
	}
	lines := strings.Split(string(out), "\n")
	for i, line := range lines {
		if strings.Contains(line, "Device: "+name) && i > 0 {
			// Zeile davor enthält "Hardware Port: ..."
			if strings.Contains(lines[i-1], "Hardware Port:") {
				parts := strings.SplitN(lines[i-1], ":", 2)
				if len(parts) == 2 {
					return strings.TrimSpace(parts[1])
				}
			}
		}
	}
	return name
}
