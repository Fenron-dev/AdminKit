package config

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestLoadOldConfigKeepsOnlineDefaults(t *testing.T) {
	dir := t.TempDir()
	// Alte config.yaml ohne online/packages/billing-Abschnitt.
	old := "version: \"1.0\"\nbranding:\n  company_name: Test\n"
	if err := os.WriteFile(filepath.Join(dir, DefaultConfigFilename), []byte(old), 0644); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.Online.Allowed("packages") || !cfg.Online.Allowed("dns") {
		t.Errorf("Online-Standard sollte aktiv sein: %+v", cfg.Online)
	}
	if cfg.Billing.AEMinutes != 10 || cfg.Packages.DefaultScope != "machine" {
		t.Errorf("Standardwerte fehlen: %+v %+v", cfg.Billing, cfg.Packages)
	}
}

func TestOnlineMasterSwitch(t *testing.T) {
	o := Online{Enabled: false, Packages: true, DNS: true}
	if o.Allowed("packages") || o.Allowed("dns") {
		t.Error("Hauptschalter aus muss alles abschalten")
	}
	o.Enabled = true
	o.DNS = false
	if !o.Allowed("packages") || o.Allowed("dns") || o.Allowed("unbekannt") {
		t.Errorf("Einzelschalter falsch ausgewertet: %+v", o)
	}
}

func TestSaveUsesRestrictivePermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix-Rechte")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, DefaultConfigFilename)
	if err := os.WriteFile(path, []byte("version: x\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := Save(DefaultConfig(), dir); err != nil {
		t.Fatal(err)
	}
	st, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if st.Mode().Perm() != 0600 {
		t.Errorf("Rechte = %v, want 0600", st.Mode().Perm())
	}
}
