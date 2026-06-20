//go:build !darwin && !windows

package browserext

// Scan gibt auf Linux ein leeres Ergebnis zurück (nicht implementiert).
func Scan() ScanResult {
	return ScanResult{
		Errors: []ScanError{{"browserext", "Browser-Extension-Scan auf Linux nicht unterstützt"}},
	}
}
