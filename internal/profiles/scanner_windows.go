//go:build windows

package profiles

// Scan gibt auf Windows ein leeres Ergebnis zurück.
// Konfigurationsprofile sind ein macOS-spezifisches Konzept (MDM/SCEP).
func Scan() (*ScanResult, error) {
	return &ScanResult{}, nil
}
