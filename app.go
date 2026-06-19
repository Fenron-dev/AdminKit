package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"adminkit/internal/autostart"
	"adminkit/internal/config"
	"adminkit/internal/events"
	"adminkit/internal/export"
	"adminkit/internal/logging"
	"adminkit/internal/network"
	"adminkit/internal/printers"
	"adminkit/internal/services"
	"adminkit/internal/software"
	"adminkit/internal/system"
	"adminkit/internal/tools"
	"adminkit/internal/vault"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// defaultVaultPath ist der Standard-Speicherort der Vault relativ zur Binary.
const defaultVaultPath = "./adminkit_vault"

// App ist die Hauptstruktur der Wails-Anwendung.
// Alle hier exportierten Methoden sind im Frontend via window.go.* aufrufbar.
type App struct {
	ctx   context.Context
	vault *vault.Vault
	cfg   *config.Config

	// Zwischengespeicherte Scan-Ergebnisse für den Export
	lastSystemScan    *system.ScanResult
	lastNetworkScan   *network.ScanResult
	lastSoftwareScan  *software.ScanResult
	lastPrinterScan   *printers.ScanResult
	lastAutostartScan *autostart.ScanResult
	lastServicesScan  *services.ScanResult
	lastEventsScan    *events.ScanResult
	lastSessionName   string
	lastSessionPath   string
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
	if a.vault != nil && !a.vault.ExistsConfig() {
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
	return "0.6.0"
}

// SaveConfig speichert die Konfiguration (z.B. Branding-Einstellungen) dauerhaft in config.yaml.
func (a *App) SaveConfig(cfg *config.Config) error {
	if a.vault == nil {
		return fmt.Errorf("keine Vault initialisiert")
	}
	a.cfg = cfg
	if err := config.Save(cfg, a.vault.RootPath); err != nil {
		logging.Errorf("Config", "Speichern fehlgeschlagen: %v", err)
		return err
	}
	logging.Info("Config", "Konfiguration gespeichert")
	return nil
}

// PickLogoFile öffnet einen nativen Datei-Dialog, kopiert die gewählte Bild-Datei
// in vault/branding/ und gibt den vault-relativen Pfad zurück.
// Gibt "" zurück wenn der Dialog abgebrochen wird.
func (a *App) PickLogoFile() (string, error) {
	chosen, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Firmen-Logo auswählen",
		Filters: []runtime.FileFilter{
			{DisplayName: "Bilder (PNG, JPG, SVG)", Pattern: "*.png;*.jpg;*.jpeg;*.svg;*.gif;*.webp"},
		},
	})
	if err != nil {
		return "", fmt.Errorf("Datei-Dialog: %w", err)
	}
	if chosen == "" {
		return "", nil // abgebrochen
	}

	// Datei in vault/branding/ kopieren, damit sie immer verfügbar ist
	if a.vault != nil {
		brandingDir := filepath.Join(a.vault.RootPath, "branding")
		if mkErr := os.MkdirAll(brandingDir, 0755); mkErr == nil {
			ext := strings.ToLower(filepath.Ext(chosen))
			dest := filepath.Join(brandingDir, "logo"+ext)
			if copyErr := copyFile(chosen, dest); copyErr == nil {
				// Vault-relativer Pfad — leichter zu portieren
				return filepath.Join("branding", "logo"+ext), nil
			}
		}
	}
	// Fallback: originaler Pfad
	return chosen, nil
}

// GetLogoBase64 gibt das konfigurierte Logo als Data-URI zurück (für die App-Anzeige).
func (a *App) GetLogoBase64() string {
	return a.readLogoBase64()
}

// copyFile kopiert eine Datei von src nach dst.
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

// NewSession erstellt eine neue Kunden-Session im Vault und speichert den Namen für den Export.
func (a *App) NewSession(customerName string) (string, error) {
	if a.vault == nil {
		return "", nil
	}
	path, err := a.vault.NewSession(customerName)
	if err != nil {
		return "", err
	}
	a.lastSessionName = customerName
	a.lastSessionPath = path
	// Bisherige Scan-Caches zurücksetzen wenn eine neue Session beginnt
	a.lastSystemScan = nil
	a.lastNetworkScan = nil
	a.lastSoftwareScan = nil
	a.lastPrinterScan = nil
	a.lastAutostartScan = nil
	a.lastServicesScan = nil
	a.lastEventsScan = nil
	return path, nil
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
	a.lastSystemScan = result
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

// ScanNetwork führt einen Netzwerk-Scan durch.
// WiFi-Passwörter werden nur gelesen wenn die Konfiguration include_wifi_passwords=true hat.
// Passwörter werden niemals geloggt — nur im Rückgabewert enthalten.
func (a *App) ScanNetwork() (*network.ScanResult, error) {
	includePasswords := a.cfg != nil && a.cfg.Defaults.IncludeWifiPasswords
	logging.Info("Network", "Netzwerk-Scan gestartet")

	result, err := network.Scan(includePasswords)
	if err != nil {
		logging.Errorf("Network", "Scan fehlgeschlagen: %v", err)
		return nil, err
	}
	for _, e := range result.Errors {
		logging.Warnf("Network", "[%s] %s", e.Module, e.Message)
	}
	// WiFi-Passwörter bewusst NICHT loggen
	logging.Infof("Network", "Netzwerk-Scan abgeschlossen: %d Adapter, %d Shares, %d WiFi-Profile",
		len(result.Adapters), len(result.Shares), len(result.WiFi))
	a.lastNetworkScan = result
	return result, nil
}

// SaveNetworkScan speichert ein Netzwerk-Scan-Ergebnis im Session-Ordner.
func (a *App) SaveNetworkScan(result *network.ScanResult, sessionPath string) error {
	if sessionPath == "" {
		return nil
	}
	includePasswords := a.cfg != nil && a.cfg.Defaults.IncludeWifiPasswords
	if err := network.SaveToVault(result, sessionPath, includePasswords); err != nil {
		logging.Errorf("Network", "Vault-Speicherung fehlgeschlagen: %v", err)
		return err
	}
	logging.Infof("Network", "Scan gespeichert: %s", sessionPath)
	return nil
}

// ScanSoftware inventarisiert installierte Programme, Laufzeiten und Browser.
func (a *App) ScanSoftware() (*software.ScanResult, error) {
	logging.Info("Software", "Software-Scan gestartet")
	result, err := software.Scan()
	if err != nil {
		logging.Errorf("Software", "Scan fehlgeschlagen: %v", err)
		return nil, err
	}
	for _, e := range result.Errors {
		logging.Warnf("Software", "[%s] %s", e.Module, e.Message)
	}
	logging.Infof("Software", "Software-Scan abgeschlossen: %d Programme, %d Laufzeiten, %d Browser (%d Fehler)",
		len(result.Programs), len(result.Runtimes), len(result.Browsers), len(result.Errors))
	a.lastSoftwareScan = result
	return result, nil
}

// SaveSoftwareScan speichert den Software-Scan als Markdown und CSV im Session-Ordner.
func (a *App) SaveSoftwareScan(result *software.ScanResult, sessionPath string) error {
	if sessionPath == "" {
		return nil
	}
	if err := software.SaveToVault(result, sessionPath); err != nil {
		logging.Errorf("Software", "Vault-Speicherung fehlgeschlagen: %v", err)
		return err
	}
	logging.Infof("Software", "Scan gespeichert: %s", sessionPath)
	return nil
}

// ScanAutostart sammelt alle Autostart-Einträge (Registry, Tasks, LaunchAgents usw.).
func (a *App) ScanAutostart() (*autostart.ScanResult, error) {
	logging.Info("Autostart", "Autostart-Scan gestartet")
	result := autostart.Scan()
	for _, e := range result.Errors {
		logging.Warnf("Autostart", "[%s] %s", e.Module, e.Message)
	}
	logging.Infof("Autostart", "Autostart-Scan abgeschlossen: %d Einträge (%d Fehler)",
		len(result.Entries), len(result.Errors))
	a.lastAutostartScan = &result
	if a.vault != nil {
		path := a.lastSessionPath
		if path == "" {
			path = a.vault.RootPath
		}
		if _, err := autostart.SaveToVault(path, result); err != nil {
			logging.Warnf("Autostart", "Vault-Speicherung fehlgeschlagen: %v", err)
		}
	}
	return &result, nil
}

// ScanServices listet laufende und automatisch startende Dienste auf.
func (a *App) ScanServices() (*services.ScanResult, error) {
	logging.Info("Services", "Dienste-Scan gestartet")
	result := services.Scan()
	for _, e := range result.Errors {
		logging.Warnf("Services", "[%s] %s", e.Module, e.Message)
	}
	logging.Infof("Services", "Dienste-Scan abgeschlossen: %d Dienste", len(result.Services))
	a.lastServicesScan = &result
	return &result, nil
}

// ScanEvents liest kritische Systemereignisse der letzten 7 Tage.
func (a *App) ScanEvents() (*events.ScanResult, error) {
	logging.Info("Events", "Event-Log-Scan gestartet")
	result := events.Scan()
	for _, e := range result.Errors {
		logging.Warnf("Events", "[%s] %s", e.Module, e.Message)
	}
	logging.Infof("Events", "Event-Scan abgeschlossen: %d Ereignisse", len(result.Events))
	a.lastEventsScan = &result
	return &result, nil
}

// ScanPrinters listet alle installierten Drucker auf.
func (a *App) ScanPrinters() (*printers.ScanResult, error) {
	logging.Info("Printers", "Drucker-Scan gestartet")
	result := printers.Scan()
	for _, e := range result.Errors {
		logging.Warnf("Printers", "[%s] %s", e.Module, e.Message)
	}
	logging.Infof("Printers", "Drucker-Scan abgeschlossen: %d Drucker (%d Fehler)", len(result.Printers), len(result.Errors))
	a.lastPrinterScan = &result
	return &result, nil
}

// SavePrinterScan speichert den Drucker-Scan als Markdown in den Vault.
func (a *App) SavePrinterScan(result *printers.ScanResult, sessionPath string) error {
	if sessionPath == "" && a.vault != nil {
		sessionPath = a.vault.RootPath
	}
	if sessionPath == "" {
		return nil
	}
	path, err := printers.SaveToVault(sessionPath, *result)
	if err != nil {
		logging.Errorf("Printers", "Vault-Speicherung fehlgeschlagen: %v", err)
		return err
	}
	logging.Infof("Printers", "Scan gespeichert: %s", path)
	return nil
}

// RunConsoleTool führt ein Konsolen-Diagnose-Tool aus und gibt die Ausgabe zurück.
// tool: "ping", "traceroute", "dns", "netstat", "arp", "portscan", "drivers"
// target: Ziel-Host / IP / Port-Liste (abhängig vom Tool)
func (a *App) RunConsoleTool(tool, target string) (string, error) {
	logging.Infof("Tools", "Konsolen-Tool '%s' gestartet (Ziel: %s)", tool, target)
	out, err := tools.RunCommand(tool, target)
	if err != nil {
		logging.Warnf("Tools", "'%s' fehlgeschlagen: %v", tool, err)
		return "", err
	}
	return out, nil
}

// BackupVault erstellt ein ZIP-Archiv der gesamten Vault.
// Das Archiv wird in vaultPath/exports/backups/ abgelegt.
func (a *App) BackupVault() (string, error) {
	if a.vault == nil {
		return "", fmt.Errorf("keine Vault initialisiert")
	}
	logging.Info("Tools", "Vault-Backup gestartet")
	path, err := tools.BackupVault(a.vault.RootPath)
	if err != nil {
		logging.Errorf("Tools", "Vault-Backup fehlgeschlagen: %v", err)
		return "", err
	}
	logging.Infof("Tools", "Vault-Backup erstellt: %s", path)
	return path, nil
}

// GetClipboard liest den aktuellen Inhalt der Zwischenablage.
func (a *App) GetClipboard() (string, error) {
	return tools.GetClipboard()
}

// GetUptime gibt die Zeit seit dem letzten Systemstart als formatierten String zurück.
func (a *App) GetUptime() (string, error) {
	return tools.GetUptime()
}

// ExportSession exportiert alle bisher durchgeführten Scans der aktuellen Session.
// format: "html" oder "json"
// Gibt den absoluten Pfad der erzeugten Datei zurück.
func (a *App) ExportSession(format string) (string, error) {
	if a.lastSystemScan == nil && a.lastNetworkScan == nil &&
		a.lastSoftwareScan == nil && a.lastAutostartScan == nil {
		return "", fmt.Errorf("kein Scan durchgeführt – bitte zuerst scannen")
	}

	sessionName := a.lastSessionName
	if sessionName == "" {
		sessionName = "Unbenannte Session"
	}

	outDir := filepath.Join(a.vault.RootPath, "exports")
	if a.lastSessionPath != "" {
		outDir = filepath.Join(a.lastSessionPath, "exports")
	}

	data := &export.SessionExport{
		GeneratedAt:    time.Now(),
		SessionName:    sessionName,
		SessionPath:    a.lastSessionPath,
		System:         a.lastSystemScan,
		Network:        a.lastNetworkScan,
		Software:       a.lastSoftwareScan,
		Printers:       a.lastPrinterScan,
		Autostart:      a.lastAutostartScan,
		Services:       a.lastServicesScan,
		Events:         a.lastEventsScan,
		CompanyName:    a.cfg.Branding.CompanyName,
		TechnicianName: a.cfg.Branding.TechnicianName,
		LogoBase64:     a.readLogoBase64(),
	}

	includePasswords := a.cfg != nil && a.cfg.Defaults.IncludeWifiPasswords

	var (
		path string
		err  error
	)
	switch format {
	case "json":
		path, err = export.ExportJSON(data, outDir)
	default:
		path, err = export.ExportHTML(data, outDir, includePasswords)
	}
	if err != nil {
		logging.Errorf("Export", "Export fehlgeschlagen (%s): %v", format, err)
		return "", err
	}
	logging.Infof("Export", "Bericht erstellt: %s", path)
	return path, nil
}

// ExportCSV exportiert die Software-Liste als CSV-Datei (Excel-kompatibel, UTF-8 BOM).
func (a *App) ExportCSV() (string, error) {
	if a.lastSoftwareScan == nil && a.lastPrinterScan == nil {
		return "", fmt.Errorf("kein Scan durchgeführt – bitte zuerst scannen")
	}

	sessionName := a.lastSessionName
	if sessionName == "" {
		sessionName = "Unbenannte Session"
	}

	outDir := filepath.Join(a.vault.RootPath, "exports")
	if a.lastSessionPath != "" {
		outDir = filepath.Join(a.lastSessionPath, "exports")
	}

	data := &export.SessionExport{
		GeneratedAt:    time.Now(),
		SessionName:    sessionName,
		SessionPath:    a.lastSessionPath,
		Software:       a.lastSoftwareScan,
		Printers:       a.lastPrinterScan,
		CompanyName:    a.cfg.Branding.CompanyName,
		TechnicianName: a.cfg.Branding.TechnicianName,
	}

	path, err := export.ExportCSV(data, outDir)
	if err != nil {
		logging.Errorf("Export", "CSV-Export fehlgeschlagen: %v", err)
		return "", err
	}
	logging.Infof("Export", "CSV erstellt: %s", path)
	return path, nil
}

// readLogoBase64 liest die Logo-Datei aus der Konfiguration und gibt sie als
// "data:image/...;base64,..." zurück. Gibt "" zurück wenn kein Logo konfiguriert ist.
func (a *App) readLogoBase64() string {
	if a.cfg == nil || a.cfg.Branding.LogoPath == "" {
		return ""
	}
	logoPath := a.cfg.Branding.LogoPath
	// Relativen Pfad relativ zur Vault auflösen
	if !filepath.IsAbs(logoPath) && a.vault != nil {
		logoPath = filepath.Join(a.vault.RootPath, logoPath)
	}
	data, err := os.ReadFile(logoPath)
	if err != nil {
		logging.Warnf("Export", "Logo konnte nicht gelesen werden: %v", err)
		return ""
	}
	// MIME-Typ aus Dateiendung ableiten
	mime := "image/png"
	lower := strings.ToLower(logoPath)
	switch {
	case strings.HasSuffix(lower, ".jpg") || strings.HasSuffix(lower, ".jpeg"):
		mime = "image/jpeg"
	case strings.HasSuffix(lower, ".svg"):
		mime = "image/svg+xml"
	case strings.HasSuffix(lower, ".gif"):
		mime = "image/gif"
	case strings.HasSuffix(lower, ".webp"):
		mime = "image/webp"
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)
}

// resolveVaultPath sucht den Vault-Pfad in dieser Reihenfolge:
// 1. Neben der Binary (portabler Betrieb auf USB-Stick, Windows .exe)
// 2. Home-Verzeichnis (macOS .app aus Finder, read-only Bundle-Pfad)
// 3. Relatives Fallback ./adminkit_vault
func resolveVaultPath() string {
	exe, err := os.Executable()
	if err == nil {
		dir := filepath.Dir(exe)
		// Auf macOS nicht in den .app-Bundle schreiben — Pfad enthält .app/Contents/
		if !strings.Contains(dir, ".app"+string(filepath.Separator)+"Contents") && isWritable(dir) {
			return filepath.Join(dir, "adminkit_vault")
		}
	}
	// Fallback: ~/adminkit_vault (funktioniert immer: macOS, Windows, Linux)
	if home, err := os.UserHomeDir(); err == nil {
		return filepath.Join(home, "adminkit_vault")
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
