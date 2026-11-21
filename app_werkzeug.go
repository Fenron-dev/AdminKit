package main

// Werkzeugkasten (#88–#92): Go-Seite der Plattform-Schicht (platform.adminkit.js).

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"adminkit/internal/hashing"
	"adminkit/internal/logging"
	"adminkit/internal/werkzeug"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type wzState struct {
	once  sync.Once
	state *werkzeug.State
	err   error

	mu         sync.Mutex
	hashCancel context.CancelFunc
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

// ── Prüfsumme (#89) ─────────────────────────────────────────────────────────

// PickFileForHash öffnet einen Dateidialog ("" = abgebrochen).
func (a *App) PickFileForHash() (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "Datei für die Prüfsumme wählen"})
}

// HashFile berechnet SHA-256, SHA-1, SHA-512 und MD5 als Stream.
// Fortschritt per Event "hash:progress" {done,total}; Abbruch mit CancelHash.
func (a *App) HashFile(path string) (map[string]string, error) {
	ctx, cancel := context.WithCancel(a.ctx)
	a.wz.mu.Lock()
	if a.wz.hashCancel != nil {
		a.wz.hashCancel()
	}
	a.wz.hashCancel = cancel
	a.wz.mu.Unlock()
	defer cancel()
	var last time.Time
	res, err := hashing.File(ctx, path, nil, func(done, total int64) {
		if time.Since(last) > 200*time.Millisecond || done == total {
			last = time.Now()
			runtime.EventsEmit(a.ctx, "hash:progress", map[string]int64{"done": done, "total": total})
		}
	})
	if err != nil {
		return nil, err
	}
	logging.Infof("Werkzeug", "Prüfsumme berechnet: %s", filepath.Base(path))
	return res, nil
}

// CancelHash bricht eine laufende Prüfsummenberechnung ab.
func (a *App) CancelHash() {
	a.wz.mu.Lock()
	defer a.wz.mu.Unlock()
	if a.wz.hashCancel != nil {
		a.wz.hashCancel()
		a.wz.hashCancel = nil
	}
}

// ── Dokumente & Arbeitsprotokoll (#89) ─────────────────────────────────────

// ExportDocument erzeugt ein Kundendokument (Ratgeber, WLAN-Karte …) mit
// Branding als HTML, legt es in <Session>/exports ab (ohne Session im Vault
// unter exports/dokumente), öffnet es im Standardbrowser (dort drucken oder
// als PDF speichern) und vermerkt es optional im Arbeitsprotokoll.
func (a *App) ExportDocument(kind, title, bodyHTML string, card bool, workTitle, workDetail string) (string, error) {
	if a.vault == nil {
		return "", fmt.Errorf("keine Vault initialisiert")
	}
	if len(bodyHTML) > 4<<20 {
		return "", fmt.Errorf("Dokument zu groß")
	}
	dir := a.vault.DataPath("exports", "dokumente")
	if a.lastSessionPath != "" {
		dir = filepath.Join(a.lastSessionPath, "exports")
	}
	o := werkzeug.DocOptions{Title: title, BodyHTML: bodyHTML, Card: card, Customer: a.lastCustomer, LogoURI: a.readLogoBase64()}
	if a.cfg != nil {
		o.Company, o.Technician = a.cfg.Branding.CompanyName, a.cfg.Branding.TechnicianName
	}
	path, err := werkzeug.WriteDocument(dir, kind, o, time.Now())
	if err != nil {
		return "", err
	}
	logging.Infof("Werkzeug", "Dokument erzeugt: %s", path)
	if workTitle != "" {
		if err := werkzeug.AppendWork(a.lastSessionPath, werkzeug.WorkItem{Time: time.Now(), Title: workTitle, Detail: workDetail, File: filepath.Base(path)}); err != nil {
			logging.Warnf("Werkzeug", "Arbeitsprotokoll: %v", err)
		}
	}
	if err := openFilePlatform(path); err != nil {
		logging.Warnf("Werkzeug", "Dokument konnte nicht geöffnet werden: %v", err)
	}
	return path, nil
}

// RecordWork vermerkt eine Arbeit im Session-Bericht („Durchgeführte Arbeiten“).
func (a *App) RecordWork(title, detail string) error {
	if a.lastSessionPath == "" {
		return fmt.Errorf("keine aktive Session – bitte zuerst eine Session anlegen")
	}
	return werkzeug.AppendWork(a.lastSessionPath, werkzeug.WorkItem{Time: time.Now(), Title: title, Detail: detail})
}

// SessionTiming liefert Beginn und bisherige Dauer der aktuellen Session.
type SessionTiming struct {
	Active   bool      `json:"active"`
	Start    time.Time `json:"start"`
	Minutes  int       `json:"minutes"`
	Customer string    `json:"customer"`
}

// GetSessionTiming liefert die Einsatzzeit der aktuellen Session (für AE).
func (a *App) GetSessionTiming() SessionTiming {
	if a.lastSessionPath == "" || a.sessionStart.IsZero() {
		return SessionTiming{}
	}
	return SessionTiming{Active: true, Start: a.sessionStart, Minutes: int(time.Since(a.sessionStart).Minutes()), Customer: a.lastCustomer}
}

// ── Dateien (#89) ───────────────────────────────────────────────────────────

// OpenTextFileDialog lässt eine Textdatei wählen (z. B. .eml) und liefert Name und Inhalt.
func (a *App) OpenTextFileDialog(title, pattern string) (map[string]string, error) {
	opts := runtime.OpenDialogOptions{Title: title}
	if pattern != "" {
		opts.Filters = []runtime.FileFilter{{DisplayName: pattern, Pattern: pattern}, {DisplayName: "Alle Dateien", Pattern: "*"}}
	}
	p, err := runtime.OpenFileDialog(a.ctx, opts)
	if err != nil || p == "" {
		return nil, err
	}
	st, err := os.Stat(p)
	if err != nil {
		return nil, err
	}
	if st.Size() > 10<<20 {
		return nil, fmt.Errorf("Datei größer als 10 MB")
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return nil, err
	}
	return map[string]string{"name": filepath.Base(p), "content": string(b)}, nil
}

// SaveDataURL speichert ein data:-URI (z. B. PNG der WLAN-Karte) über einen Speichern-Dialog.
func (a *App) SaveDataURL(defaultName, dataURL string) (string, error) {
	i := strings.Index(dataURL, ";base64,")
	if !strings.HasPrefix(dataURL, "data:") || i < 0 {
		return "", fmt.Errorf("ungültige Daten")
	}
	data, err := base64.StdEncoding.DecodeString(dataURL[i+8:])
	if err != nil {
		return "", err
	}
	p, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: "Speichern", DefaultFilename: defaultName})
	if err != nil || p == "" {
		return "", err
	}
	return p, os.WriteFile(p, data, 0644)
}
