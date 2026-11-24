package main

// Disk-Analyzer (#97–#99): Wails-Bindings für internal/diskscan.

import (
	"fmt"
	"path/filepath"
	"time"

	"adminkit/internal/diskscan"
	"adminkit/internal/export"
	"adminkit/internal/logging"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) diskScanner() *diskscan.Scanner {
	a.diskOnce.Do(func() { a.disk = diskscan.New() })
	return a.disk
}

// GetDiskScanRoots schlägt Startpunkte vor (Benutzerordner, Laufwerke).
func (a *App) GetDiskScanRoots() []diskscan.Root { return diskscan.Roots() }

// PickDiskScanFolder lässt einen beliebigen Ordner wählen ("" = abgebrochen).
func (a *App) PickDiskScanFolder() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "Ordner für die Speicher-Analyse wählen"})
}

// StartDiskScan startet die Analyse im Hintergrund. Fortschritt kommt als
// Event „diskscan:progress“ (max. 2×/s), das Ende als „diskscan:done“.
func (a *App) StartDiskScan(root string) error {
	s := a.diskScanner()
	stop := make(chan struct{})
	err := s.Start(root, func(st diskscan.Status) {
		close(stop)
		if st.Done {
			a.lastDiskReport = a.buildDiskReport(st)
		}
		logging.Infof("Disk", "Analyse %s: %d Dateien, %d Bytes, %d ms (abgebrochen: %v)", st.Root, st.Files, st.Bytes, st.ElapsedMs, st.Canceled)
		runtime.EventsEmit(a.ctx, "diskscan:done", st)
	})
	if err != nil {
		return err
	}
	logging.Infof("Disk", "Analyse gestartet: %s", root)
	go func() {
		t := time.NewTicker(500 * time.Millisecond)
		defer t.Stop()
		for {
			select {
			case <-stop:
				return
			case <-t.C:
				runtime.EventsEmit(a.ctx, "diskscan:progress", s.Status())
			}
		}
	}()
	return nil
}

// CancelDiskScan bricht die laufende Analyse ab.
func (a *App) CancelDiskScan() { a.diskScanner().Cancel() }

// GetDiskScanStatus liefert den aktuellen Stand.
func (a *App) GetDiskScanStatus() diskscan.Status { return a.diskScanner().Status() }

// GetDiskNodeChildren liefert den Inhalt eines Ordners (größte zuerst, max. 200).
func (a *App) GetDiskNodeChildren(path string, hideSystem bool) (*diskscan.Dir, error) {
	return a.diskScanner().Children(path, hideSystem, 200)
}

// GetDiskTopFiles liefert die größten Dateien.
func (a *App) GetDiskTopFiles(limit int, hideSystem bool) ([]diskscan.FileEntry, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	return a.diskScanner().TopFiles(limit, hideSystem)
}

// GetDiskHotspots liefert die Ordner, in denen sich der Speicher ballt.
func (a *App) GetDiskHotspots(limit int) ([]diskscan.Hotspot, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	return a.diskScanner().Hotspots(limit)
}

// DiskMoveToTrash verschiebt einen Eintrag in den Papierkorb (Bestätigung im
// Frontend). Systembereiche und Hauptordner sind gesperrt.
func (a *App) DiskMoveToTrash(path string) error {
	if err := a.diskScanner().MoveToTrash(path); err != nil {
		logging.Warnf("Disk", "Papierkorb fehlgeschlagen (%s): %v", path, err)
		return err
	}
	logging.Infof("Disk", "In den Papierkorb verschoben: %s", path)
	// Bericht aktualisieren
	if st := a.diskScanner().Status(); st.Done {
		a.lastDiskReport = a.buildDiskReport(st)
	}
	return nil
}

// buildDiskReport fasst die Analyse für den HTML-Bericht zusammen (ohne System).
func (a *App) buildDiskReport(st diskscan.Status) *export.DiskReport {
	s := a.diskScanner()
	r := &export.DiskReport{Root: st.Root, ScannedAt: time.Now(), Bytes: st.Bytes, Files: st.Files, Unreadable: st.Errors,
		VolumeTotal: st.VolumeTotal, VolumeFree: st.VolumeFree}
	if hs, err := s.Hotspots(20); err == nil {
		for _, h := range hs {
			r.Hotspots = append(r.Hotspots, export.DiskRow{Path: h.Path, Size: h.Size, Category: string(h.Category)})
		}
	}
	if tf, err := s.TopFiles(20, true); err == nil {
		for _, f := range tf {
			r.TopFiles = append(r.TopFiles, export.DiskRow{Path: f.Path, Size: f.Size, Category: string(f.Category)})
		}
	}
	return r
}

// DiskReportSummary: Kurzfassung für die Anzeige „im Bericht enthalten“.
func (a *App) DiskReportSummary() string {
	if a.lastDiskReport == nil {
		return ""
	}
	return fmt.Sprintf("%s – %s", filepath.Base(a.lastDiskReport.Root), export.HumanBytes(a.lastDiskReport.Bytes))
}
