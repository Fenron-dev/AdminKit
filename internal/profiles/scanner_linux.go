//go:build linux

package profiles

// Scan gibt auf Linux ein leeres Ergebnis zurück.
func Scan() (*ScanResult, error) {
	return &ScanResult{}, nil
}
