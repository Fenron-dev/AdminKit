package config

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// S2: config.yaml enthält API-Keys → nur für den Besitzer lesbar,
// auch wenn eine alte Datei noch mit 0644 im Vault liegt.
func TestConfigPermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("keine Unix-Rechte unter Windows")
	}
	dir := t.TempDir()
	p := filepath.Join(dir, DefaultConfigFilename)
	if err := os.WriteFile(p, []byte("api_keys:\n  virustotal: geheim\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	if fi, _ := os.Stat(p); fi.Mode().Perm() != 0o600 {
		t.Errorf("nach Load: %v, erwartet 0600", fi.Mode().Perm())
	}
	os.Chmod(p, 0o644)
	if err := Save(cfg, dir); err != nil {
		t.Fatal(err)
	}
	if fi, _ := os.Stat(p); fi.Mode().Perm() != 0o600 {
		t.Errorf("nach Save: %v, erwartet 0600", fi.Mode().Perm())
	}
	if _, err := os.Stat(p + ".tmp"); !os.IsNotExist(err) {
		t.Error("Temp-Datei bleibt liegen")
	}
	if c2, err := Load(dir); err != nil || c2.APIKeys.VirusTotal != "geheim" {
		t.Errorf("Inhalt verloren: %v", err)
	}
}
