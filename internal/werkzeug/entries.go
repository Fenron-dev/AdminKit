package werkzeug

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sync"
)

// Eigene Einträge (#105): Jede Sammlung (eigene Werkzeuge, später Befehle,
// Mailkonten, Router …) liegt als JSON-Datei in vault/werkzeug/eintraege/<art>.json.
// Aufbau und Prüfung der Einträge übernimmt das Frontend (entries.js); hier
// wird nur sicher gelesen und atomar geschrieben.

var reEntryKind = regexp.MustCompile(`^[a-z0-9-]{1,32}$`)

// maxEntriesSize begrenzt eine Sammlung (Text-Einträge, keine Medien).
const maxEntriesSize = 4 << 20

var entriesMu sync.Mutex

func entriesPath(vaultRoot, kind string) (string, error) {
	if !reEntryKind.MatchString(kind) {
		return "", fmt.Errorf("ungültige Sammlung %q", kind)
	}
	return filepath.Join(vaultRoot, "werkzeug", "eintraege", kind+".json"), nil
}

// LoadEntries liefert den Inhalt einer Sammlung als JSON ("{}" wenn noch leer).
// Eine kaputte Datei wird nicht überschrieben, sondern als Fehler gemeldet.
func LoadEntries(vaultRoot, kind string) (string, error) {
	p, err := entriesPath(vaultRoot, kind)
	if err != nil {
		return "", err
	}
	entriesMu.Lock()
	defer entriesMu.Unlock()
	b, err := os.ReadFile(p)
	if os.IsNotExist(err) {
		return "{}", nil
	}
	if err != nil {
		return "", err
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(b, &obj); err != nil {
		return "", fmt.Errorf("%s.json ist beschädigt: %w", kind, err)
	}
	return string(b), nil
}

// SaveEntries speichert eine Sammlung (muss ein JSON-Objekt sein).
func SaveEntries(vaultRoot, kind, data string) error {
	p, err := entriesPath(vaultRoot, kind)
	if err != nil {
		return err
	}
	if len(data) > maxEntriesSize {
		return fmt.Errorf("Sammlung zu groß (max. %d MB)", maxEntriesSize>>20)
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal([]byte(data), &obj); err != nil {
		return fmt.Errorf("kein gültiges JSON-Objekt: %w", err)
	}
	pretty, err := json.MarshalIndent(obj, "", "  ")
	if err != nil {
		return err
	}
	entriesMu.Lock()
	defer entriesMu.Unlock()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, pretty, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}
