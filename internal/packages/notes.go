package packages

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

//go:embed notes_default.yaml
var defaultNotesYAML []byte

// NoteMatch ordnet eine Notiz Paket-IDs zu.
type NoteMatch struct {
	Winget   string `yaml:"winget,omitempty"    json:"winget,omitempty"`
	Brew     string `yaml:"brew,omitempty"      json:"brew,omitempty"`
	BrewCask string `yaml:"brew_cask,omitempty" json:"brew_cask,omitempty"`
}

// NoteEntry ist eine Einordnung aus notes.yaml.
type NoteEntry struct {
	Match      NoteMatch `yaml:"match"                 json:"match"`
	Level      string    `yaml:"level,omitempty"       json:"level,omitempty"`
	Text       string    `yaml:"text"                  json:"text"`
	SuggestPin bool      `yaml:"suggest_pin,omitempty" json:"suggest_pin,omitempty"`
}

type notesFile struct {
	Version int         `yaml:"version"`
	Notes   []NoteEntry `yaml:"notes"`
}

// Note ist die Einordnung für ein konkretes Paket.
type Note struct {
	Text       string `json:"text"`
	Level      string `json:"level"`
	SuggestPin bool   `json:"suggest_pin"`
	// Own: stammt aus vault/packages/notes.yaml (vom Team gepflegt).
	Own bool `json:"own"`
	// Default: mitgelieferte Vorgabe, falls sie von der eigenen Notiz abweicht.
	Default string `json:"default,omitempty"`
}

// Notes hält Standard- und Team-Einordnungen.
type Notes struct {
	mu       sync.RWMutex
	defaults map[string]NoteEntry
	own      map[string]NoteEntry
}

func noteKey(source Source, id string) string {
	switch source {
	case SourceBrew:
		return "brew:" + id
	case SourceBrewCask:
		return "cask:" + id
	}
	return "winget:" + strings.ToLower(id)
}

func indexNotes(entries []NoteEntry) map[string]NoteEntry {
	m := map[string]NoteEntry{}
	for _, e := range entries {
		if e.Level == "" {
			e.Level = "info"
		}
		e.Text = strings.TrimSpace(e.Text)
		if e.Match.Winget != "" {
			m[noteKey(SourceWinget, e.Match.Winget)] = e
		}
		if e.Match.Brew != "" {
			m[noteKey(SourceBrew, e.Match.Brew)] = e
		}
		if e.Match.BrewCask != "" {
			m[noteKey(SourceBrewCask, e.Match.BrewCask)] = e
		}
	}
	return m
}

func parseNotes(data []byte) ([]NoteEntry, error) {
	var f notesFile
	if err := yaml.Unmarshal(data, &f); err != nil {
		return nil, err
	}
	return f.Notes, nil
}

// LoadNotes lädt die eingebauten Notizen und – falls vorhanden – vault/packages/notes.yaml.
func LoadNotes(vaultRoot string) (*Notes, error) {
	def, err := parseNotes(defaultNotesYAML)
	if err != nil {
		return nil, fmt.Errorf("notes_default.yaml: %w", err)
	}
	n := &Notes{defaults: indexNotes(def), own: map[string]NoteEntry{}}
	if vaultRoot == "" {
		return n, nil
	}
	data, err := os.ReadFile(filepath.Join(vaultRoot, "packages", "notes.yaml"))
	if err != nil {
		if os.IsNotExist(err) {
			return n, nil
		}
		return n, err
	}
	own, err := parseNotes(data)
	if err != nil {
		return n, fmt.Errorf("vault/packages/notes.yaml: %w", err)
	}
	n.own = indexNotes(own)
	return n, nil
}

// For liefert die Einordnung für ein Paket (nil, wenn keine vorhanden).
func (n *Notes) For(source Source, id string) *Note {
	if n == nil {
		return nil
	}
	n.mu.RLock()
	defer n.mu.RUnlock()
	k := noteKey(source, id)
	def, hasDef := n.defaults[k]
	if own, ok := n.own[k]; ok {
		note := &Note{Text: own.Text, Level: own.Level, SuggestPin: own.SuggestPin, Own: true}
		if hasDef && def.Text != own.Text {
			note.Default = def.Text
		}
		return note
	}
	if hasDef {
		return &Note{Text: def.Text, Level: def.Level, SuggestPin: def.SuggestPin}
	}
	return nil
}

// DefaultText liefert nur die mitgelieferte Vorgabe (für „Vorgabe wiederherstellen“).
func (n *Notes) DefaultText(source Source, id string) string {
	if n == nil {
		return ""
	}
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.defaults[noteKey(source, id)].Text
}
