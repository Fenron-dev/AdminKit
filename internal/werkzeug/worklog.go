package werkzeug

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// WorkItem ist eine in der Session erledigte Arbeit aus dem Werkzeugkasten
// (Ratgeber übergeben, Einsatzdauer, Mail-Check …) – erscheint im Bericht.
type WorkItem struct {
	Time   time.Time `json:"time"`
	Title  string    `json:"title"`
	Detail string    `json:"detail"`
	File   string    `json:"file,omitempty"`
}

func worklogPath(sessionPath string) string {
	return filepath.Join(sessionPath, "werkzeug", "arbeiten.json")
}

// AppendWork hängt einen Eintrag an das Arbeitsprotokoll der Session.
func AppendWork(sessionPath string, w WorkItem) error {
	if sessionPath == "" {
		return nil
	}
	items, _ := ReadWork(sessionPath)
	w.Title = strings.TrimSpace(w.Title)
	w.Detail = strings.TrimSpace(w.Detail)
	if len(w.Title) > 200 {
		w.Title = w.Title[:200]
	}
	if len(w.Detail) > 2000 {
		w.Detail = w.Detail[:2000]
	}
	items = append(items, w)
	b, err := json.MarshalIndent(items, "", "  ")
	if err != nil {
		return err
	}
	p := worklogPath(sessionPath)
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}
	return os.WriteFile(p, b, 0644)
}

// ReadWork liest das Arbeitsprotokoll (leer, wenn nicht vorhanden).
func ReadWork(sessionPath string) ([]WorkItem, error) {
	b, err := os.ReadFile(worklogPath(sessionPath))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var items []WorkItem
	return items, json.Unmarshal(b, &items)
}
