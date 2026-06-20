//go:build linux

package usbhistory

// Scan gibt auf Linux ein leeres Ergebnis zurück.
func Scan() (*ScanResult, error) {
	return &ScanResult{}, nil
}
