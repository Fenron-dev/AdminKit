//go:build linux

package network

// scanConnections ist auf Linux noch nicht implementiert.
func scanConnections() ([]NetworkConnection, error) {
	return nil, nil
}
