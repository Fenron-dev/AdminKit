// Package network sammelt Netzwerk-Informationen: Adapter, IP-Konfiguration,
// Netzlaufwerke und WiFi-Profile. WiFi-Passwörter werden separat behandelt
// und nur auf explizite Anfrage zurückgegeben (niemals geloggt).
package network

import "time"

// ScanResult ist das vollständige Ergebnis eines Netzwerk-Scans.
type ScanResult struct {
	Timestamp     time.Time      `json:"timestamp"`
	Adapters      []Adapter      `json:"adapters"`
	Shares        []NetworkShare `json:"shares"`
	WiFi          []WiFiProfile  `json:"wifi"`
	SearchDomains []string       `json:"search_domains,omitempty"`
	Errors        []ScanError    `json:"errors,omitempty"`
}

// ─── Netzwerkadapter ─────────────────────────────────────────────────────────

// AdapterType klassifiziert den Netzwerkadapter.
type AdapterType string

const (
	AdapterEthernet  AdapterType = "Ethernet"
	AdapterWiFi      AdapterType = "WiFi"
	AdapterVPN       AdapterType = "VPN"
	AdapterLoopback  AdapterType = "Loopback"
	AdapterBluetooth AdapterType = "Bluetooth"
	AdapterOther     AdapterType = "Other"
)

type Adapter struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Type        AdapterType `json:"type"`
	MACAddress  string      `json:"mac_address"`
	IsEnabled   bool        `json:"is_enabled"`
	IsConnected bool        `json:"is_connected"`
	IPv4        []string    `json:"ipv4"`
	IPv6        []string    `json:"ipv6"`
	SubnetMasks []string    `json:"subnet_masks"`
	Gateway     string      `json:"gateway"`
	DNSServers  []string    `json:"dns_servers"`
	Speed       string      `json:"speed"` // z.B. "1 Gbps", "Wi-Fi 6"
}

// ─── Netzlaufwerke ───────────────────────────────────────────────────────────

type NetworkShare struct {
	DriveLetter string `json:"drive_letter"` // z.B. "Y", "Z" (Windows) oder Mount-Pfad (macOS)
	UNCPath     string `json:"unc_path"`      // z.B. \\server\share oder //nas/data
	Description string `json:"description"`
	Status      string `json:"status"` // "Connected", "Disconnected"
}

// ─── WiFi-Profile ─────────────────────────────────────────────────────────────

// WiFiSecurity beschreibt das Sicherheitsprotokoll eines WiFi-Netzwerks.
type WiFiSecurity string

const (
	WiFiOpen WiFiSecurity = "Open"
	WiFiWEP  WiFiSecurity = "WEP"
	WiFiWPA  WiFiSecurity = "WPA"
	WiFiWPA2 WiFiSecurity = "WPA2"
	WiFiWPA3 WiFiSecurity = "WPA3"
)

// WiFiProfile beschreibt ein gespeichertes WLAN-Profil.
// Das Password-Feld ist leer wenn kein Admin-Zugriff besteht oder
// include_wifi_passwords in der Konfiguration deaktiviert ist.
type WiFiProfile struct {
	SSID        string       `json:"ssid"`
	Security    WiFiSecurity `json:"security"`
	Password    string       `json:"password,omitempty"` // NIEMALS loggen!
	HasPassword bool         `json:"has_password"`        // true = Passwort existiert (auch wenn leer)
	IsConnected bool         `json:"is_connected"`
	SignalDBm   int          `json:"signal_dbm"` // 0 wenn nicht verbunden
}

// ─── Fehler-Tracking ─────────────────────────────────────────────────────────

type ScanError struct {
	Module  string `json:"module"`
	Message string `json:"message"`
}
