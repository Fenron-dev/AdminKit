package bundle

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// writeSession legt eine Minimal-Session mit Snapshots an und gibt ihren Pfad zurück.
func writeSession(t *testing.T, root, name string, snapshots map[string]string) string {
	t.Helper()
	sessionPath := filepath.Join(root, name)
	snapDir := filepath.Join(sessionPath, "snapshots")
	if err := os.MkdirAll(snapDir, 0755); err != nil {
		t.Fatalf("session anlegen: %v", err)
	}
	for key, data := range snapshots {
		if err := os.WriteFile(filepath.Join(snapDir, key+".json"), []byte(data), 0644); err != nil {
			t.Fatalf("snapshot schreiben: %v", err)
		}
	}
	return sessionPath
}

func TestExportImportRoundTrip(t *testing.T) {
	root := t.TempDir()
	snapshots := map[string]string{
		"system":  `{"os":"macOS","host":"MacBook"}`,
		"network": `{"adapters":2}`,
	}
	sessionPath := writeSession(t, root, "20260701_Musterfirma_Empfang-PC", snapshots)

	meta := Meta{
		SessionName:  "20260701_Musterfirma_Empfang-PC",
		CustomerName: "Musterfirma GmbH",
		DeviceAlias:  "Empfang-PC",
		Hostname:     "Desktop-GES3234SW",
		DeviceID:     "device-uuid-1",
		ScannedAt:    time.Now(),
	}

	dest := t.TempDir()
	bundlePath, err := Export(sessionPath, meta, dest)
	if err != nil {
		t.Fatalf("Export: %v", err)
	}
	if filepath.Ext(bundlePath) != Extension {
		t.Fatalf("erwartete %s-Endung, bekam %q", Extension, bundlePath)
	}

	// Vorschau der Meta ohne Entpacken.
	preview, err := ReadMeta(bundlePath)
	if err != nil {
		t.Fatalf("ReadMeta: %v", err)
	}
	if preview.CustomerName != "Musterfirma GmbH" || preview.SchemaVersion != currentSchemaVersion {
		t.Fatalf("unerwartete Meta-Vorschau: %+v", preview)
	}

	// Import in ein frisches Datenverzeichnis.
	importDir := t.TempDir()
	newSession, gotMeta, err := Import(bundlePath, importDir)
	if err != nil {
		t.Fatalf("Import: %v", err)
	}
	if gotMeta.DeviceID != "device-uuid-1" {
		t.Fatalf("DeviceID ging verloren: %+v", gotMeta)
	}

	for key, want := range snapshots {
		got, err := os.ReadFile(filepath.Join(newSession, "snapshots", key+".json"))
		if err != nil {
			t.Fatalf("Snapshot %s fehlt nach Import: %v", key, err)
		}
		if string(got) != want {
			t.Fatalf("Snapshot %s verändert: got %q want %q", key, got, want)
		}
	}

	// meta.json muss in der importierten Session liegen.
	if _, err := os.Stat(filepath.Join(newSession, metaFilename)); err != nil {
		t.Fatalf("meta.json fehlt in importierter Session: %v", err)
	}
}

func TestImportNoCollisionOverwrite(t *testing.T) {
	root := t.TempDir()
	sessionPath := writeSession(t, root, "20260701_Kunde", map[string]string{"system": `{"a":1}`})
	meta := Meta{SessionName: "20260701_Kunde", ScannedAt: time.Now()}

	dest := t.TempDir()
	bundlePath, err := Export(sessionPath, meta, dest)
	if err != nil {
		t.Fatalf("Export: %v", err)
	}

	importDir := t.TempDir()
	first, _, err := Import(bundlePath, importDir)
	if err != nil {
		t.Fatalf("erster Import: %v", err)
	}
	second, _, err := Import(bundlePath, importDir)
	if err != nil {
		t.Fatalf("zweiter Import: %v", err)
	}
	if first == second {
		t.Fatalf("zweiter Import überschrieb den ersten: %q", first)
	}
}
