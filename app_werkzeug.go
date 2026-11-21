package main

// Werkzeugkasten (#88–#92): Go-Seite der Plattform-Schicht (platform.adminkit.js).

import (
	"encoding/json"
	"fmt"
	"sync"

	"adminkit/internal/logging"
	"adminkit/internal/werkzeug"
)

type wzState struct {
	once  sync.Once
	state *werkzeug.State
	err   error
}

func (a *App) toolState() (*werkzeug.State, error) {
	if a.vault == nil {
		return nil, fmt.Errorf("keine Vault initialisiert")
	}
	a.wz.once.Do(func() {
		a.wz.state, a.wz.err = werkzeug.OpenState(a.vault.RootPath)
		if a.wz.err != nil {
			logging.Warnf("Werkzeug", "state.json: %v", a.wz.err)
		}
	})
	return a.wz.state, nil
}

// GetToolStates liefert alle gespeicherten Werkzeug-Einstellungen (key → JSON).
func (a *App) GetToolStates() (map[string]json.RawMessage, error) {
	s, err := a.toolState()
	if err != nil {
		return nil, err
	}
	return s.All(), nil
}

// SaveToolState speichert eine Werkzeug-Einstellung (value = JSON, "null" löscht).
func (a *App) SaveToolState(key, value string) error {
	s, err := a.toolState()
	if err != nil {
		return err
	}
	return s.Set(key, value)
}

// ── Links (#91) ─────────────────────────────────────────────────────────────

// GetLinks lädt vault/links/links.yaml und ergänzt neue mitgelieferte Links.
func (a *App) GetLinks() (*werkzeug.Links, error) {
	if a.vault == nil {
		return nil, fmt.Errorf("keine Vault initialisiert")
	}
	l, changed, err := werkzeug.LoadLinks(a.vault.RootPath)
	if err != nil {
		return nil, err
	}
	if changed {
		logging.Infof("Werkzeug", "Links abgeglichen (%d Links, Revision %d)", len(l.Links), l.Revision)
	}
	return l, nil
}

// SaveLinks speichert Bereiche und Links. Gelöschte mitgelieferte Links werden
// unter „entfernt“ vermerkt, damit sie beim nächsten Abgleich nicht zurückkommen.
func (a *App) SaveLinks(l *werkzeug.Links) error {
	if a.vault == nil {
		return fmt.Errorf("keine Vault initialisiert")
	}
	old, _, err := werkzeug.LoadLinks(a.vault.RootPath)
	if err == nil {
		now := map[string]bool{}
		for _, x := range l.Links {
			now[x.ID] = true
		}
		seed := werkzeug.DefaultLinkIDs()
		removed := map[string]bool{}
		for _, id := range l.Entfernt {
			removed[id] = true
		}
		for _, x := range old.Links {
			if !now[x.ID] && seed[x.ID] && !removed[x.ID] {
				l.Entfernt = append(l.Entfernt, x.ID)
			}
		}
	}
	if err := werkzeug.SaveLinks(a.vault.RootPath, l); err != nil {
		return err
	}
	logging.Infof("Werkzeug", "Links gespeichert (%d)", len(l.Links))
	return nil
}
