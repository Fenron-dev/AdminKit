package main

// Tab „Dokumente“ (#96): Vorlagen und Dateien im Vault unter dokumente/,
// dazu die selbst angelegten Wiki-Kategorien.

import (
	"fmt"

	"adminkit/internal/logging"
	"adminkit/internal/werkzeug"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) vaultRootOrErr() (string, error) {
	if a.vault == nil {
		return "", fmt.Errorf("keine Vault initialisiert")
	}
	return a.vault.RootPath, nil
}

// ListDocuments legt fehlende Beispielvorlagen an und liefert den Ordnerbaum.
func (a *App) ListDocuments() (*werkzeug.DocTree, error) {
	root, err := a.vaultRootOrErr()
	if err != nil {
		return nil, err
	}
	if n, err := werkzeug.SyncDocSeeds(root); err != nil {
		logging.Warnf("Dokumente", "Beispielvorlagen: %v", err)
	} else if n > 0 {
		logging.Infof("Dokumente", "%d Beispielvorlagen angelegt", n)
	}
	return werkzeug.ListDocs(root)
}

// CreateDocFolder legt einen Unterordner an und liefert dessen relativen Pfad.
func (a *App) CreateDocFolder(parent, name string) (string, error) {
	root, err := a.vaultRootOrErr()
	if err != nil {
		return "", err
	}
	rel, err := werkzeug.CreateDocFolder(root, parent, name)
	if err == nil {
		logging.Infof("Dokumente", "Ordner angelegt: %s", rel)
	}
	return rel, err
}

// RenameDoc benennt eine Datei oder einen Ordner um → neuer relativer Pfad.
func (a *App) RenameDoc(rel, newName string) (string, error) {
	root, err := a.vaultRootOrErr()
	if err != nil {
		return "", err
	}
	n, err := werkzeug.RenameDoc(root, rel, newName)
	if err == nil {
		logging.Infof("Dokumente", "Umbenannt: %s → %s", rel, n)
	}
	return n, err
}

// DeleteDoc löscht eine Datei oder einen leeren Ordner (Bestätigung im Frontend).
func (a *App) DeleteDoc(rel string) error {
	root, err := a.vaultRootOrErr()
	if err != nil {
		return err
	}
	if err := werkzeug.DeleteDoc(root, rel); err != nil {
		return err
	}
	logging.Infof("Dokumente", "Gelöscht: %s", rel)
	return nil
}

// ReadDocText liest eine Markdown-/Textdatei.
func (a *App) ReadDocText(rel string) (string, error) {
	root, err := a.vaultRootOrErr()
	if err != nil {
		return "", err
	}
	return werkzeug.ReadDocText(root, rel)
}

// SaveDocText speichert eine Markdown-/Textdatei (neu oder geändert).
func (a *App) SaveDocText(rel, content string) error {
	root, err := a.vaultRootOrErr()
	if err != nil {
		return err
	}
	if err := werkzeug.SaveDocText(root, rel, content); err != nil {
		return err
	}
	logging.Infof("Dokumente", "Gespeichert: %s", rel)
	return nil
}

// ImportDocuments öffnet einen Dateidialog und kopiert die gewählten Dateien
// in den Ordner (nie überschreibend). Abbruch → leere Liste.
func (a *App) ImportDocuments(folder string) ([]string, error) {
	root, err := a.vaultRootOrErr()
	if err != nil {
		return nil, err
	}
	paths, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{Title: "Dateien in die Dokumente übernehmen"})
	if err != nil || len(paths) == 0 {
		return nil, err
	}
	out, err := werkzeug.ImportDocs(root, folder, paths)
	if len(out) > 0 {
		logging.Infof("Dokumente", "%d Datei(en) importiert nach %q", len(out), folder)
	}
	return out, err
}

// OpenDocument öffnet eine Datei mit dem Standardprogramm (Ordner: im Finder/Explorer).
func (a *App) OpenDocument(rel string) error {
	root, err := a.vaultRootOrErr()
	if err != nil {
		return err
	}
	p, err := werkzeug.DocPath(root, rel)
	if err != nil {
		return err
	}
	return openFilePlatform(p)
}

// RevealDocument zeigt eine Datei im Finder/Explorer.
func (a *App) RevealDocument(rel string) error {
	root, err := a.vaultRootOrErr()
	if err != nil {
		return err
	}
	p, err := werkzeug.DocPath(root, rel)
	if err != nil {
		return err
	}
	return revealFilePlatform(p)
}

// DocumentInfo: Werte für die automatisch vorbelegten Platzhalter.
type DocumentInfo struct {
	Company    string `json:"company"`
	Technician string `json:"technician"`
	Customer   string `json:"customer"`
}

// GetDocumentInfo liefert Firma, Techniker und den Kunden der aktuellen Session.
func (a *App) GetDocumentInfo() DocumentInfo {
	d := DocumentInfo{Customer: a.lastCustomer}
	if d.Customer == "" {
		d.Customer = a.lastSessionName // einfache Session: Name = Kunde
	}
	if a.cfg != nil {
		d.Company, d.Technician = a.cfg.Branding.CompanyName, a.cfg.Branding.TechnicianName
	}
	return d
}

// GetWikiCategories liefert alle Wiki-Kategorien (angelegte und benutzte).
func (a *App) GetWikiCategories() ([]string, error) {
	root, err := a.vaultRootOrErr()
	if err != nil {
		return nil, err
	}
	return werkzeug.WikiCategories(root)
}

// SaveWikiCategories speichert die selbst angelegten Wiki-Kategorien.
func (a *App) SaveWikiCategories(cats []string) error {
	root, err := a.vaultRootOrErr()
	if err != nil {
		return err
	}
	return werkzeug.SaveWikiCategories(root, cats)
}
