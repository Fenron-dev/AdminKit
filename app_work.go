package main

// „Durchgeführte Arbeiten“ für den Session-Bericht – sammelt alles, was in der
// aktuellen Session am Gerät gemacht oder dem Kunden übergeben wurde.

import (
	"adminkit/internal/export"
	"adminkit/internal/logging"
	"adminkit/internal/packages"
	"adminkit/internal/werkzeug"
)

// collectWorkDone liest die Arbeitsprotokolle der aktuellen Session.
func (a *App) collectWorkDone() []export.WorkSection {
	if a.lastSessionPath == "" {
		return nil
	}
	var out []export.WorkSection
	if rows, err := packages.ReadChanges(a.lastSessionPath); err != nil {
		logging.Warnf("Export", "changes.md nicht lesbar: %v", err)
	} else if len(rows) > 0 {
		out = append(out, export.WorkSection{
			Title:   "Software",
			Headers: []string{"Zeit", "Aktion", "Paket", "Vorher", "Nachher", "Ergebnis"},
			Rows:    rows,
		})
	}
	if items, err := werkzeug.ReadWork(a.lastSessionPath); err != nil {
		logging.Warnf("Export", "arbeiten.json nicht lesbar: %v", err)
	} else if len(items) > 0 {
		ws := export.WorkSection{Title: "Werkzeugkasten", Headers: []string{"Zeit", "Arbeit", "Details"}}
		for _, it := range items {
			ws.Rows = append(ws.Rows, []string{it.Time.Format("15:04"), it.Title, it.Detail})
		}
		out = append(out, ws)
	}
	return out
}
