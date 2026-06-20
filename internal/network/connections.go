package network

// NetworkConnection beschreibt eine aktive oder lauschende TCP/UDP-Verbindung.
type NetworkConnection struct {
	Protocol    string `json:"protocol"`    // "tcp", "udp", "tcp6", "udp6"
	LocalAddr   string `json:"local_addr"`
	LocalPort   int    `json:"local_port"`
	RemoteAddr  string `json:"remote_addr"` // leer bei LISTEN
	RemotePort  int    `json:"remote_port"` // 0 bei LISTEN
	State       string `json:"state"`       // "ESTABLISHED", "LISTEN", "TIME_WAIT", etc.
	PID         int    `json:"pid"`
	ProcessName string `json:"process_name"`
}

// ScanConnections gibt alle aktuellen Netzwerkverbindungen zurück.
// Die Implementierung ist plattformspezifisch (darwin/windows).
func ScanConnections() ([]NetworkConnection, error) {
	return scanConnections()
}
