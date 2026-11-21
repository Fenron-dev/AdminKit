// Package werkzeug enthält die Go-Seite des Werkzeugkastens: Zustand der
// Werkzeuge, Links, Wiki und Dokumente – alles im Vault, nie im WebView-Speicher
// des Kunden-PCs (Minimal-Fußabdruck).
package werkzeug

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sync"
)

var reStateKey = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,64}$`)

// maxStateValue begrenzt einen einzelnen Eintrag (Werkzeug-Einstellungen sind klein).
const maxStateValue = 256 << 10

// State speichert Werkzeug-Einstellungen in vault/werkzeug/state.json.
// Kundendaten gehören nicht hierher – nur Optionen wie Passwortlänge oder Einheit.
type State struct {
	mu   sync.Mutex
	path string
	data map[string]json.RawMessage
}

// OpenState lädt (oder erstellt beim ersten Speichern) die Zustandsdatei.
func OpenState(vaultRoot string) (*State, error) {
	s := &State{path: filepath.Join(vaultRoot, "werkzeug", "state.json"), data: map[string]json.RawMessage{}}
	b, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return s, nil
		}
		return s, err
	}
	if err := json.Unmarshal(b, &s.data); err != nil {
		// Kaputte Datei nicht überschreiben, sondern beiseitelegen
		_ = os.Rename(s.path, s.path+".defekt")
		s.data = map[string]json.RawMessage{}
	}
	return s, nil
}

// All liefert alle gespeicherten Einträge.
func (s *State) All() map[string]json.RawMessage {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make(map[string]json.RawMessage, len(s.data))
	for k, v := range s.data {
		out[k] = v
	}
	return out
}

// Set speichert einen Eintrag (value muss gültiges JSON sein; "null" löscht).
func (s *State) Set(key, value string) error {
	if !reStateKey.MatchString(key) {
		return fmt.Errorf("ungültiger Schlüssel %q", key)
	}
	if len(value) > maxStateValue {
		return fmt.Errorf("Wert zu groß")
	}
	if !json.Valid([]byte(value)) {
		return fmt.Errorf("Wert ist kein gültiges JSON")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if value == "null" {
		delete(s.data, key)
	} else {
		s.data[key] = json.RawMessage(value)
	}
	b, err := json.Marshal(s.data)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0755); err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}
