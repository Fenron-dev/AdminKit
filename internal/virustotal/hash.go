package virustotal

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// SHA256File berechnet den SHA256-Hash einer Datei ohne sie in den Speicher zu laden.
// Gibt "" zurück wenn die Datei nicht lesbar ist.
func SHA256File(path string) (string, error) {
	clean, err := resolvePath(path)
	if err != nil {
		return "", err
	}
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

// resolvePath: Existiert der Pfad unverändert, wird er genommen (Dateinamen
// mit Leerzeichen oder „#“, #96). Nur sonst wird er als Befehlszeile gedeutet.
// Mac-App-Pakete (.app sind Ordner) werden auf ihr Programm aufgelöst.
func resolvePath(raw string) (string, error) {
	p := strings.TrimSpace(raw)
	if _, err := os.Stat(p); err != nil {
		p = cleanPath(raw)
	}
	fi, err := os.Stat(p)
	if err != nil || !fi.IsDir() {
		return p, nil // Fehler meldet os.Open mit dem richtigen Pfad
	}
	if strings.HasSuffix(strings.ToLower(strings.TrimRight(p, "/")), ".app") {
		if exe := appBundleExecutable(p); exe != "" {
			return exe, nil
		}
	}
	return "", fmt.Errorf("%s ist ein Ordner – bitte eine einzelne Datei wählen (z. B. .dmg, .pkg, .exe)", filepath.Base(p))
}

// appBundleExecutable liefert das Hauptprogramm eines .app-Pakets
// (Contents/MacOS/<Name>, sonst die einzige Datei dort).
func appBundleExecutable(app string) string {
	dir := filepath.Join(app, "Contents", "MacOS")
	name := strings.TrimSuffix(filepath.Base(strings.TrimRight(app, "/")), filepath.Ext(strings.TrimRight(app, "/")))
	if fi, err := os.Stat(filepath.Join(dir, name)); err == nil && !fi.IsDir() {
		return filepath.Join(dir, name)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return ""
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() {
			files = append(files, filepath.Join(dir, e.Name()))
		}
	}
	if len(files) == 1 {
		return files[0]
	}
	return ""
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
