// Package bundle exportiert und importiert AdminKit-Sessions als portable
// .adminkit-Dateien (ZIP). Wird für den Air-Gap-Transfer von isolierten oder
// verdächtigen Geräten ohne Netzwerkverbindung genutzt (siehe #74).
//
// Ein Bundle enthält:
//
//	meta.json            ← Kunde, Alias, Hostname, Scan-Zeit, DeviceID, Version
//	snapshots/<key>.json ← die Scan-Schnappschüsse (system, network, ...)
//
// Das Format ist bewusst identisch zum Vault-Session-Layout, sodass Import
// ohne Umbau in einen neuen Session-Ordner entpackt werden kann.
package bundle

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Extension ist die Dateiendung für exportierte Session-Bundles.
const Extension = ".adminkit"

// metaFilename ist der Name der Metadaten-Datei im Bundle.
const metaFilename = "meta.json"

// Meta beschreibt die Herkunft einer Session. Wird als meta.json ins Bundle
// geschrieben und beim Import ausgelesen (z.B. für das "Extern importiert"-Badge).
type Meta struct {
	SchemaVersion   int       `json:"schema_version"`
	SessionName     string    `json:"session_name"`
	CustomerName    string    `json:"customer_name,omitempty"`
	DeviceAlias     string    `json:"device_alias,omitempty"`
	Hostname        string    `json:"hostname,omitempty"`
	Location        string    `json:"location,omitempty"`
	Technician      string    `json:"technician,omitempty"`
	DeviceID        string    `json:"device_id,omitempty"`
	AdminKitVersion string    `json:"adminkit_version,omitempty"`
	ScannedAt       time.Time `json:"scanned_at"`
	ExportedAt      time.Time `json:"exported_at"`
}

// currentSchemaVersion erlaubt spätere Format-Migrationen beim Import.
const currentSchemaVersion = 1

// Export packt die Snapshots einer Session zusammen mit meta in ein
// .adminkit-Bundle unter destPath. Existiert destPath als Verzeichnis, wird
// ein Dateiname aus dem Session-Namen abgeleitet. Gibt den finalen Pfad zurück.
func Export(sessionPath string, meta Meta, destPath string) (string, error) {
	snapDir := filepath.Join(sessionPath, "snapshots")
	entries, err := os.ReadDir(snapDir)
	if err != nil {
		return "", fmt.Errorf("session hat keine Snapshots zum Exportieren: %w", err)
	}

	if meta.SchemaVersion == 0 {
		meta.SchemaVersion = currentSchemaVersion
	}
	if meta.SessionName == "" {
		meta.SessionName = filepath.Base(sessionPath)
	}
	if meta.ExportedAt.IsZero() {
		meta.ExportedAt = time.Now()
	}

	// Wenn destPath ein Verzeichnis ist, Dateinamen aus dem Session-Namen bauen.
	if info, statErr := os.Stat(destPath); statErr == nil && info.IsDir() {
		destPath = filepath.Join(destPath, sanitizeFilename(meta.SessionName)+Extension)
	}
	if !strings.HasSuffix(strings.ToLower(destPath), Extension) {
		destPath += Extension
	}

	out, err := os.Create(destPath)
	if err != nil {
		return "", err
	}
	defer out.Close()

	zw := zip.NewWriter(out)
	// meta.json zuerst schreiben.
	metaBytes, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return "", err
	}
	if err := writeZipFile(zw, metaFilename, metaBytes); err != nil {
		return "", err
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, readErr := os.ReadFile(filepath.Join(snapDir, entry.Name()))
		if readErr != nil {
			continue
		}
		if err := writeZipFile(zw, "snapshots/"+entry.Name(), data); err != nil {
			return "", err
		}
	}

	if err := zw.Close(); err != nil {
		return "", err
	}
	return destPath, nil
}

// Import entpackt ein .adminkit-Bundle in einen neuen Session-Ordner unter
// dataDir. Gibt den Pfad des neuen Session-Ordners und die Meta-Daten zurück.
// Kollidiert der Session-Name mit einem bestehenden Ordner, wird ein Suffix
// angehängt, sodass nie eine vorhandene Session überschrieben wird.
func Import(bundlePath, dataDir string) (string, Meta, error) {
	zr, err := zip.OpenReader(bundlePath)
	if err != nil {
		return "", Meta{}, fmt.Errorf("bundle konnte nicht geöffnet werden: %w", err)
	}
	defer zr.Close()

	meta, err := readMeta(&zr.Reader)
	if err != nil {
		return "", Meta{}, err
	}

	sessionName := meta.SessionName
	if sessionName == "" {
		sessionName = strings.TrimSuffix(filepath.Base(bundlePath), Extension)
	}
	sessionPath := uniqueSessionPath(dataDir, sanitizeFilename(sessionName))

	for _, f := range zr.File {
		if f.Name == metaFilename {
			continue
		}
		// Zip-Slip-Schutz: Zielpfad muss innerhalb von sessionPath bleiben.
		target := filepath.Join(sessionPath, f.Name)
		if !strings.HasPrefix(target, filepath.Clean(sessionPath)+string(os.PathSeparator)) {
			return "", Meta{}, fmt.Errorf("unsicherer Pfad im Bundle: %q", f.Name)
		}
		if f.FileInfo().IsDir() {
			continue
		}
		if err := extractFile(f, target); err != nil {
			return "", Meta{}, err
		}
	}

	// meta.json auch in die Session schreiben, damit die Herkunft erhalten bleibt.
	if err := os.MkdirAll(sessionPath, 0755); err == nil {
		if metaBytes, mErr := json.MarshalIndent(meta, "", "  "); mErr == nil {
			_ = os.WriteFile(filepath.Join(sessionPath, metaFilename), metaBytes, 0644)
		}
	}

	return sessionPath, meta, nil
}

// Read lädt Meta und alle Snapshots eines Bundles in den Speicher, ohne auf
// die Platte zu entpacken. Genutzt vom Hub, um ein importiertes Bundle über
// denselben Storage-Pfad wie ein normaler Push abzulegen. Der zurückgegebene
// Map-Key ist der Snapshot-Name ohne Verzeichnis und Endung (z.B. "system").
func Read(bundlePath string) (Meta, map[string][]byte, error) {
	zr, err := zip.OpenReader(bundlePath)
	if err != nil {
		return Meta{}, nil, fmt.Errorf("bundle konnte nicht geöffnet werden: %w", err)
	}
	defer zr.Close()

	meta, err := readMeta(&zr.Reader)
	if err != nil {
		return Meta{}, nil, err
	}

	snapshots := map[string][]byte{}
	for _, f := range zr.File {
		if f.FileInfo().IsDir() || !strings.HasPrefix(f.Name, "snapshots/") {
			continue
		}
		key := strings.TrimSuffix(filepath.Base(f.Name), ".json")
		if key == "" {
			continue
		}
		rc, openErr := f.Open()
		if openErr != nil {
			return Meta{}, nil, openErr
		}
		data, readErr := io.ReadAll(io.LimitReader(rc, 50<<20))
		rc.Close()
		if readErr != nil {
			return Meta{}, nil, readErr
		}
		snapshots[key] = data
	}
	return meta, snapshots, nil
}

// ReadMeta liest nur die Metadaten eines Bundles, ohne es zu entpacken.
// Nützlich für eine Vorschau vor dem Import.
func ReadMeta(bundlePath string) (Meta, error) {
	zr, err := zip.OpenReader(bundlePath)
	if err != nil {
		return Meta{}, err
	}
	defer zr.Close()
	return readMeta(&zr.Reader)
}

// WriteSessionMeta schreibt die meta.json direkt in einen Session-Ordner
// (nicht ins Bundle). Wird bei Session-Erstellung genutzt, damit Kunde/Alias
// erhalten bleiben und Export/Push dieselben Metadaten wiederverwenden.
func WriteSessionMeta(sessionPath string, meta Meta) error {
	if meta.SchemaVersion == 0 {
		meta.SchemaVersion = currentSchemaVersion
	}
	if meta.SessionName == "" {
		meta.SessionName = filepath.Base(sessionPath)
	}
	if err := os.MkdirAll(sessionPath, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(sessionPath, metaFilename), data, 0644)
}

// ReadSessionMeta liest die meta.json aus einem Session-Ordner.
func ReadSessionMeta(sessionPath string) (Meta, error) {
	data, err := os.ReadFile(filepath.Join(sessionPath, metaFilename))
	if err != nil {
		return Meta{}, err
	}
	var meta Meta
	if err := json.Unmarshal(data, &meta); err != nil {
		return Meta{}, err
	}
	return meta, nil
}

func readMeta(zr *zip.Reader) (Meta, error) {
	for _, f := range zr.File {
		if f.Name != metaFilename {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return Meta{}, err
		}
		defer rc.Close()
		var meta Meta
		if err := json.NewDecoder(rc).Decode(&meta); err != nil {
			return Meta{}, fmt.Errorf("meta.json im Bundle ist ungültig: %w", err)
		}
		return meta, nil
	}
	return Meta{}, fmt.Errorf("bundle enthält keine %s", metaFilename)
}

func extractFile(f *zip.File, target string) error {
	if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
		return err
	}
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	out, err := os.Create(target)
	if err != nil {
		return err
	}
	defer out.Close()
	// Größenlimit gegen Zip-Bomben: 50 MB pro Datei ist mehr als genug für JSON.
	_, err = io.Copy(out, io.LimitReader(rc, 50<<20))
	return err
}

func writeZipFile(zw *zip.Writer, name string, data []byte) error {
	w, err := zw.Create(name)
	if err != nil {
		return err
	}
	_, err = w.Write(data)
	return err
}

// uniqueSessionPath hängt bei Namenskollision _2, _3, ... an.
func uniqueSessionPath(dataDir, name string) string {
	base := filepath.Join(dataDir, name)
	if _, err := os.Stat(base); os.IsNotExist(err) {
		return base
	}
	for i := 2; ; i++ {
		candidate := fmt.Sprintf("%s_%d", base, i)
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate
		}
	}
}

// sanitizeFilename entfernt Pfadtrenner und problematische Zeichen aus Namen.
func sanitizeFilename(name string) string {
	replacer := strings.NewReplacer(
		"/", "_", "\\", "_", ":", "_", "*", "_", "?", "_",
		"\"", "_", "<", "_", ">", "_", "|", "_",
	)
	cleaned := strings.TrimSpace(replacer.Replace(name))
	if cleaned == "" {
		return "session"
	}
	return cleaned
}
