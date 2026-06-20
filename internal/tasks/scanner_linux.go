//go:build linux

package tasks

// Scan ist auf Linux noch nicht implementiert.
func Scan() (*ScanResult, error) {
	return &ScanResult{}, nil
}
