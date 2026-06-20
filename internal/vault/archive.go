package vault

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// ArchiveResult beschreibt das Ergebnis eines Archivierungsvorgangs.
type ArchiveResult struct {
	ArchivePath  string `json:"archive_path"`
	CopiedFiles  int    `json:"copied_files"`
	CopiedBytes  int64  `json:"copied_bytes"`
	DeletedDirs  int    `json:"deleted_dirs"`
}

// ArchiveAndClean kopiert alle Session-Daten, Exporte und Logs in destDir
// und löscht sie danach aus der Vault. config.yaml und clients/ bleiben erhalten.
// Der Vorgang ist sicher: Löschen erfolgt nur nach erfolgreichem Kopieren.
func (v *Vault) ArchiveAndClean(destDir string) (*ArchiveResult, error) {
	ts := time.Now().Format("20060102_150405")
	archivePath := filepath.Join(destDir, "AdminKit_Archiv_"+ts)

	if err := os.MkdirAll(archivePath, 0755); err != nil {
		return nil, fmt.Errorf("archiv-verzeichnis konnte nicht erstellt werden: %w", err)
	}

	result := &ArchiveResult{ArchivePath: archivePath}

	// Quellen die archiviert werden sollen
	sources := []string{"data", "exports", "logs"}

	for _, src := range sources {
		srcPath := filepath.Join(v.RootPath, src)
		if _, err := os.Stat(srcPath); os.IsNotExist(err) {
			continue
		}
		dstPath := filepath.Join(archivePath, src)
		if err := copyDir(srcPath, dstPath, result); err != nil {
			// Archiv-Verzeichnis bei Fehler aufräumen um halbfertige Kopien zu vermeiden
			_ = os.RemoveAll(archivePath)
			return nil, fmt.Errorf("fehler beim Kopieren von '%s': %w", src, err)
		}
	}

	if result.CopiedFiles == 0 {
		_ = os.RemoveAll(archivePath)
		return nil, fmt.Errorf("keine Daten im Vault gefunden — nichts zu archivieren")
	}

	// Erst nach erfolgreichem Kopieren löschen
	for _, src := range sources {
		srcPath := filepath.Join(v.RootPath, src)
		if _, err := os.Stat(srcPath); os.IsNotExist(err) {
			continue
		}
		entries, err := os.ReadDir(srcPath)
		if err != nil {
			continue
		}
		for _, e := range entries {
			entryPath := filepath.Join(srcPath, e.Name())
			if err := os.RemoveAll(entryPath); err != nil {
				return nil, fmt.Errorf("löschen von '%s' fehlgeschlagen: %w", entryPath, err)
			}
			result.DeletedDirs++
		}
	}

	// Verzeichnisstruktur neu erstellen (vault muss funktionsfähig bleiben)
	if err := v.initialize(); err != nil {
		return nil, fmt.Errorf("vault-struktur konnte nicht wiederhergestellt werden: %w", err)
	}

	return result, nil
}

// copyDir kopiert ein Verzeichnis rekursiv. Gibt Anzahl kopierter Dateien und Bytes zurück.
func copyDir(src, dst string, result *ArchiveResult) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)

		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}

		n, err := copyFile(path, target)
		if err != nil {
			return err
		}
		result.CopiedFiles++
		result.CopiedBytes += n
		return nil
	})
}

// copyFile kopiert eine einzelne Datei und gibt die Anzahl kopierter Bytes zurück.
func copyFile(src, dst string) (int64, error) {
	in, err := os.Open(src)
	if err != nil {
		return 0, err
	}
	defer in.Close()

	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return 0, err
	}

	out, err := os.Create(dst)
	if err != nil {
		return 0, err
	}
	defer out.Close()

	n, err := io.Copy(out, in)
	if err != nil {
		return 0, err
	}
	return n, out.Sync()
}
