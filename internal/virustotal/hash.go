package virustotal

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"strings"
)

// SHA256File berechnet den SHA256-Hash einer Datei ohne sie in den Speicher zu laden.
// Gibt "" zurück wenn die Datei nicht lesbar ist.
func SHA256File(path string) (string, error) {
	clean := cleanPath(path)
	f, err := os.Open(clean)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// cleanPath extrahiert den ausführbaren Dateipfad aus Strings wie:
//   "C:\Program Files\app.exe" --start --flag
//   "C:\Program Files\app.exe"
//   C:\app.exe
func cleanPath(raw string) string {
	raw = strings.TrimSpace(raw)
	// Anführungszeichen-Variante: "pfad" arg
	if strings.HasPrefix(raw, `"`) {
		end := strings.Index(raw[1:], `"`)
		if end >= 0 {
			return raw[1 : end+1]
		}
	}
	// Kein Quote: Pfad endet beim ersten Leerzeichen nach .exe/.dll
	lower := strings.ToLower(raw)
	for _, ext := range []string{".exe", ".dll", ".sys", ".com"} {
		idx := strings.Index(lower, ext)
		if idx >= 0 {
			return raw[:idx+len(ext)]
		}
	}
	// Fallback: alles bis zum ersten Leerzeichen
	if i := strings.Index(raw, " "); i > 0 {
		return raw[:i]
	}
	return raw
}
