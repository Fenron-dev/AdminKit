package main

import (
	"context"
	"os"
	"path/filepath"

	"adminkit/internal/config"
	"adminkit/internal/logging"
	"adminkit/internal/system"
	"adminkit/internal/vault"
)

// defaultVaultPath ist der Standard-Speicherort der Vault relativ zur Binary.
const defaultVaultPath = "./adminkit_vault"

// App ist die Hauptstruktur der Wails-Anwendung.
// Alle hier exportierten Methoden sind im Frontend via window.go.* aufrufbar.
type App struct {
	ctx   context.Context
	vault *vault.Vault
	cfg   *config.Config
}

// NewApp erstellt eine neue App-Instanz.
func NewApp() *App {
	return &App{}
}

// Startup wird von Wails beim Start der Anwendung aufgerufen.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx

	// Vault-Pfad auflösen (relativ zur Binary-Position)
	vaultPath := resolveVaultPath()

	// Konfiguration laden (oder Standard verwenden wenn noch nicht vorhanden)
	cfg, err := config.Load(vaultPath)
	if err != nil {
		cfg = config.DefaultConfig()
	}
	a.cfg = cfg

	// Vault initialisieren
	v, err := vault.New(vaultPath)
	if err != nil {
		// Ohne Vault können wir nicht arbeiten — Fehler ins Stderr loggen
		logging.Errorf("App", "Vault konnte nicht initialisiert werden: %v", err)
	} else {
		a.vault = v
	}

	// Logging initialisieren (nach Vault, da Log-Pfad von Vault abhängt)
	if initErr := logging.Init(
		cfg.Logging.Level,
		cfg.Logging.Location,
		cfg.Logging.CustomPath,
		vaultPath,
	); initErr != nil {
		// Fallback: stderr-only, kein Absturz
		logging.Warnf("App", "Logging-Datei konnte nicht geöffnet werden: %v", initErr)
	}

	// Konfiguration speichern (erstellt config.yaml falls nicht vorhanden)
	if !v.ExistsConfig() {
		if saveErr := config.Save(cfg, vaultPath); saveErr != nil {
			logging.Warnf("App", "config.yaml konnte nicht gespeichert werden: %v", saveErr)
		}
	}

	logging.Info("App", "AdminKit gestartet")
}

// Shutdown wird von Wails beim Beenden aufgerufen.
func (a *App) Shutdown(ctx context.Context) {
	logging.Info("App", "AdminKit beendet")
	logging.Close()
}

// --- Frontend-API ---

// GetConfig gibt die aktuelle Konfiguration ans Frontend zurück.
func (a *App) GetConfig() *config.Config {
	return a.cfg
}

// GetVaultPath gibt den absoluten Vault-Pfad zurück.
func (a *App) GetVaultPath() string {
	if a.vault == nil {
		return ""
	}
	return a.vault.RootPath
}

// GetAppVersion gibt die AdminKit-Version zurück.
func (a *App) GetAppVersion() string {
	return "1.0.0"
}

// NewSession erstellt eine neue Kunden-Session im Vault.
func (a *App) NewSession(customerName string) (string, error) {
	if a.vault == nil {
		return "", nil
	}
	return a.vault.NewSession(customerName)
}

// ScanSystem führt einen vollständigen System-Scan durch und gibt das Ergebnis zurück.
// Fehler (z.B. fehlende Adminrechte) werden als result.Errors zurückgegeben, kein Absturz.
func (a *App) ScanSystem() (*system.ScanResult, error) {
	logging.Info("System", "System-Scan gestartet")
	result, err := system.Scan()
	if err != nil {
		logging.Errorf("System", "Scan fehlgeschlagen: %v", err)
		return nil, err
	}
	for _, e := range result.Errors {
		logging.Warnf("System", "[%s] %s", e.Module, e.Message)
	}
	logging.Infof("System", "System-Scan abgeschlossen (%d Fehler)", len(result.Errors))
	return result, nil
}

// SaveSystemScan speichert ein Scan-Ergebnis im aktuellen Session-Ordner als Markdown.
// sessionPath muss ein gültiger Pfad zu einem Session-Verzeichnis im Vault sein.
func (a *App) SaveSystemScan(result *system.ScanResult, sessionPath string) error {
	if sessionPath == "" {
		return nil
	}
	if err := system.SaveToVault(result, sessionPath); err != nil {
		logging.Errorf("System", "Vault-Speicherung fehlgeschlagen: %v", err)
		return err
	}
	logging.Infof("System", "Scan gespeichert: %s", sessionPath)
	return nil
}

// resolveVaultPath sucht den Vault-Pfad in dieser Reihenfolge:
// 1. Neben der Binary (portabler Betrieb auf USB-Stick)
// 2. Arbeitsverzeichnis
func resolveVaultPath() string {
	// Pfad zur aktuell laufenden Binary
	exe, err := os.Executable()
	if err == nil {
		candidate := filepath.Join(filepath.Dir(exe), "adminkit_vault")
		if isWritable(filepath.Dir(exe)) {
			return candidate
		}
	}
	return defaultVaultPath
}

// isWritable prüft, ob in einem Verzeichnis geschrieben werden kann.
func isWritable(dir string) bool {
	testFile := filepath.Join(dir, ".adminkit_write_test")
	f, err := os.Create(testFile)
	if err != nil {
		return false
	}
	f.Close()
	os.Remove(testFile)
	return true
}
