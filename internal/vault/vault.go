// Package vault verwaltet die Vault-Struktur nach Obsidian.md-Vorbild.
// Alle Daten liegen in relativen Pfaden — die Vault funktioniert von
// jedem Speicherort (USB-Stick, Netzwerkpfad, lokale Festplatte).
package vault

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Vault repräsentiert eine AdminKit-Vault-Instanz.
type Vault struct {
	RootPath string
}

// New öffnet oder erstellt eine Vault am angegebenen Pfad.
func New(rootPath string) (*Vault, error) {
	abs, err := filepath.Abs(rootPath)
	if err != nil {
		return nil, fmt.Errorf("vault-pfad ungültig: %w", err)
	}
	v := &Vault{RootPath: abs}
	if err := v.initialize(); err != nil {
		return nil, err
	}
	return v, nil
}

// initialize erstellt die Vault-Verzeichnisstruktur beim ersten Start.
func (v *Vault) initialize() error {
	dirs := []string{
		"data",
		"exports/reports",
		"exports/backups",
		"logs",
		"clients",
	}
	for _, d := range dirs {
		if err := os.MkdirAll(filepath.Join(v.RootPath, d), 0755); err != nil {
			return fmt.Errorf("verzeichnis '%s' konnte nicht erstellt werden: %w", d, err)
		}
	}
	return nil
}

// NewSession erstellt einen neuen Session-Ordner nach dem Schema YYYYMMDD_Kundenname.
func (v *Vault) NewSession(customerName string) (string, error) {
	date := time.Now().Format("20060102")
	sessionName := fmt.Sprintf("%s_%s", date, sanitizeName(customerName))
	sessionPath := filepath.Join(v.RootPath, "data", sessionName)

	subdirs := []string{
		"system",
		"network",
		"software",
		"printers",
		"security",
	}

	for _, d := range subdirs {
		if err := os.MkdirAll(filepath.Join(sessionPath, d), 0755); err != nil {
			return "", fmt.Errorf("session-unterverzeichnis '%s' konnte nicht erstellt werden: %w", d, err)
		}
	}

	return sessionPath, nil
}

// DataPath gibt den absoluten Pfad zu einer Datei innerhalb der Vault zurück.
func (v *Vault) DataPath(parts ...string) string {
	return filepath.Join(append([]string{v.RootPath}, parts...)...)
}

// ExistsConfig prüft, ob eine config.yaml im Vault vorhanden ist.
func (v *Vault) ExistsConfig() bool {
	_, err := os.Stat(filepath.Join(v.RootPath, "config.yaml"))
	return err == nil
}

// sanitizeName ersetzt Sonderzeichen in Kundennamen für sichere Dateinamen.
func sanitizeName(name string) string {
	result := make([]byte, 0, len(name))
	for _, c := range []byte(name) {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '-':
			result = append(result, c)
		case c == ' ', c == '_':
			result = append(result, '_')
		default:
			// Sonderzeichen überspringen
		}
	}
	if len(result) == 0 {
		return "Session"
	}
	return string(result)
}
