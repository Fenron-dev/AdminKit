package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"time"

	"adminkit/internal/aiassist"
	"adminkit/internal/autostart"
	"adminkit/internal/browserext"
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
	"adminkit/internal/virustotal"
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
	lastAutostartScan   *autostart.ScanResult
	lastServicesScan    *services.ScanResult
	lastEventsScan      *events.ScanResult
	lastBrowserExtScan  *browserext.ScanResult
	lastProcessScan     []system.RunningProcess
	lastVTAuditLog      []export.VTAuditEntry
	lastSessionName     string
	lastSessionPath     string

	// VirusTotal-Client (lazy-initialisiert wenn API-Key vorhanden)
	vtClient *virustotal.Client
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

// SaveTerminalLog speichert den Terminal-Inhalt als Textdatei im Vault-Unterordner "logs/".
// Gibt den vollständigen Pfad der gespeicherten Datei zurück.
func (a *App) SaveTerminalLog(content string) (string, error) {
	if a.vault == nil {
		return "", fmt.Errorf("keine Vault initialisiert")
	}
	logsDir := filepath.Join(a.vault.RootPath, "logs")
	if err := os.MkdirAll(logsDir, 0o755); err != nil {
		return "", fmt.Errorf("Log-Verzeichnis konnte nicht erstellt werden: %w", err)
	}
	ts := time.Now().Format("2006-01-02_15-04-05")
	filePath := filepath.Join(logsDir, fmt.Sprintf("terminal_%s.txt", ts))
	if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
		return "", fmt.Errorf("Log konnte nicht gespeichert werden: %w", err)
	}
	return filePath, nil
}

// GetAppVersion gibt die AdminKit-Version zurück.
func (a *App) GetAppVersion() string {
	return "0.6.0"
}

// GetPlatform gibt das aktuelle Betriebssystem zurück (darwin, windows, linux).
func (a *App) GetPlatform() string {
	return goruntime.GOOS
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
	a.lastBrowserExtScan = nil
	a.lastProcessScan = nil
	a.lastVTAuditLog = nil
	return path, nil
}

// SaveVTAuditLog speichert VT-Ergebnisse für die aktuelle Session (für Export).
// jsonResults ist ein JSON-Array von VT-Ergebnissen aus dem Frontend.
func (a *App) SaveVTAuditLog(jsonResults string) error {
	var entries []export.VTAuditEntry
	if err := json.Unmarshal([]byte(jsonResults), &entries); err != nil {
		return fmt.Errorf("ungültiges JSON: %w", err)
	}
	a.lastVTAuditLog = append(a.lastVTAuditLog, entries...)
	return nil
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

// GetProcesses gibt alle laufenden Prozesse zurück (PID, Name, User, CPU%, RAM).
func (a *App) GetProcesses() ([]system.RunningProcess, error) {
	procs, err := system.ScanProcesses()
	if err == nil {
		a.lastProcessScan = procs
	}
	return procs, err
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

// ScanNetworkBasic führt einen Netzwerk-Scan ohne WiFi-Passwörter durch.
// Wird beim Vollständigen Scan verwendet damit kein Admin-Dialog erscheint.
func (a *App) ScanNetworkBasic() (*network.ScanResult, error) {
	logging.Info("Network", "Netzwerk-Scan (Basic) gestartet")
	result, err := network.Scan(false) // immer ohne Passwörter
	if err != nil {
		logging.Errorf("Network", "Basic-Scan fehlgeschlagen: %v", err)
		return nil, err
	}
	for _, e := range result.Errors {
		logging.Warnf("Network", "[%s] %s", e.Module, e.Message)
	}
	logging.Infof("Network", "Netzwerk-Scan (Basic) abgeschlossen: %d Adapter, %d WiFi-Profile",
		len(result.Adapters), len(result.WiFi))
	a.lastNetworkScan = result
	return result, nil
}

// GetNetworkConnections gibt alle aktuellen TCP/UDP-Verbindungen mit Prozessname zurück.
func (a *App) GetNetworkConnections() ([]network.NetworkConnection, error) {
	conns, err := network.ScanConnections()
	if err != nil {
		logging.Warnf("Network", "Verbindungs-Scan Fehler: %v", err)
		return nil, err
	}
	logging.Infof("Network", "Verbindungs-Scan: %d Verbindungen gefunden", len(conns))
	return conns, nil
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

// ScanBrowserExtensions scannt installierte Browser-Erweiterungen (Chrome, Brave, Edge, Firefox).
func (a *App) ScanBrowserExtensions() (*browserext.ScanResult, error) {
	logging.Info("BrowserExt", "Browser-Extensions-Scan gestartet")
	result := browserext.Scan()
	for _, e := range result.Errors {
		logging.Warnf("BrowserExt", "[%s] %s", e.Module, e.Message)
	}
	logging.Infof("BrowserExt", "Browser-Extensions-Scan abgeschlossen: %d Erweiterungen", len(result.Extensions))
	a.lastBrowserExtScan = &result
	return &result, nil
}

// GetSessions gibt die Liste aller bisher erstellten Sessions zurück (neueste zuerst).
func (a *App) GetSessions() ([]vault.SessionInfo, error) {
	if a.vault == nil {
		return nil, nil
	}
	return a.vault.ListSessions()
}

// StartService startet einen Dienst per Name.
// Auf macOS: launchctl start; auf Windows: sc start.
// System-Dienste erfordern Admin-Rechte (einmaliger Dialog).
func (a *App) StartService(name string) (string, error) {
	logging.Infof("Services", "Starte Dienst: %s", name)
	out, err := services.StartService(name)
	if err != nil {
		logging.Warnf("Services", "Starten fehlgeschlagen (%s): %v", name, err)
		return "", err
	}
	logging.Infof("Services", "Dienst gestartet: %s", name)
	return out, nil
}

// StopService beendet einen Dienst per Name.
func (a *App) StopService(name string) (string, error) {
	logging.Infof("Services", "Beende Dienst: %s", name)
	out, err := services.StopService(name)
	if err != nil {
		logging.Warnf("Services", "Beenden fehlgeschlagen (%s): %v", name, err)
		return "", err
	}
	logging.Infof("Services", "Dienst beendet: %s", name)
	return out, nil
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

// OpenFile öffnet eine Datei mit der Standard-Anwendung des Betriebssystems.
func (a *App) OpenFile(path string) error {
	return openFilePlatform(path)
}

// RevealFile zeigt eine Datei im Finder (macOS) bzw. Windows Explorer an.
func (a *App) RevealFile(path string) error {
	return revealFilePlatform(path)
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
		BrowserExt:     a.lastBrowserExtScan,
		Processes:      a.lastProcessScan,
		VTAuditLog:     a.lastVTAuditLog,
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

// ExportCSV exportiert alle Scan-Daten als CSV-Datei (Excel-kompatibel, UTF-8 BOM).
func (a *App) ExportCSV() (string, error) {
	if a.lastSoftwareScan == nil && a.lastPrinterScan == nil &&
		a.lastSystemScan == nil && a.lastAutostartScan == nil &&
		a.lastServicesScan == nil && a.lastEventsScan == nil {
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
		Software:       a.lastSoftwareScan,
		Printers:       a.lastPrinterScan,
		Autostart:      a.lastAutostartScan,
		Services:       a.lastServicesScan,
		Events:         a.lastEventsScan,
		BrowserExt:     a.lastBrowserExtScan,
		Processes:      a.lastProcessScan,
		VTAuditLog:     a.lastVTAuditLog,
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

// ─── VirusTotal ───────────────────────────────────────────────────────────────

// CheckVirusTotalItems prüft eine Liste von Einträgen via VirusTotal Hash-Lookup.
// Gibt Fortschritt via Wails-Events ("vt:progress") ans Frontend.
// Erfordert einen konfigurierten VT-API-Key in den Einstellungen.
func (a *App) CheckVirusTotalItems(items []virustotal.CheckRequest) (*virustotal.BatchResult, error) {
	vtKey := ""
	if a.cfg != nil {
		vtKey = a.cfg.APIKeys.VirusTotal
	}
	if vtKey == "" {
		return nil, fmt.Errorf("kein VirusTotal-API-Key konfiguriert")
	}

	// Client neu erstellen wenn Key geändert wurde
	if a.vtClient == nil {
		a.vtClient = virustotal.NewClient(vtKey)
	}

	ctx := a.ctx

	result, err := a.vtClient.CheckBatch(ctx, items, func(current, total int, r virustotal.CheckResult) {
		runtime.EventsEmit(a.ctx, "vt:progress", map[string]any{
			"current": current,
			"total":   total,
			"result":  r,
		})
	})

	if err != nil && err != context.Canceled {
		logging.Errorf("VT", "Batch-Check fehlgeschlagen: %v", err)
		return result, err
	}

	logging.Infof("VT", "Batch-Check abgeschlossen: %d Einträge, %d Fehler, %d Anfragen heute",
		len(result.Results), result.Errors, a.vtClient.CallsToday())
	return result, nil
}

// HashFileForVT berechnet den SHA256-Hash einer Datei und gibt ihn zurück.
// Wird für den VT-Browser-Redirect ohne API-Key verwendet.
func (a *App) HashFileForVT(filePath string) (string, error) {
	hash, err := virustotal.SHA256File(filePath)
	if err != nil {
		logging.Warnf("VT", "Hash-Fehler (%s): %v", filePath, err)
		return "", fmt.Errorf("Datei kann nicht gelesen werden: %w", err)
	}
	logging.Infof("VT", "SHA256 berechnet: %s → %s", filePath, hash[:8]+"…")
	return hash, nil
}

// OpenVTInBrowser öffnet eine VirusTotal-Seite für den angegebenen SHA256-Hash
// ohne API-Key im Standard-Browser.
func (a *App) OpenVTInBrowser(sha256Hash string) {
	url := "https://www.virustotal.com/gui/file/" + sha256Hash
	runtime.BrowserOpenURL(a.ctx, url)
}

// PickFileForVTScan öffnet einen nativen Datei-Dialog und gibt den gewählten Pfad zurück.
func (a *App) PickFileForVTScan() (string, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Datei für VirusTotal-Prüfung auswählen",
	})
	if err != nil {
		return "", err
	}
	return path, nil
}

// UploadFileToVirusTotal lädt eine Datei direkt zu VirusTotal hoch und wartet auf
// das Analyseergebnis. Erfordert API-Key und explizite Nutzer-Zustimmung im Frontend
// ("Datei wird an VirusTotal übermittelt"). Max. 32 MB, Wartezeit bis zu 5 Minuten.
func (a *App) UploadFileToVirusTotal(filePath string) (*virustotal.CheckResult, error) {
	vtKey := ""
	if a.cfg != nil {
		vtKey = a.cfg.APIKeys.VirusTotal
	}
	if vtKey == "" {
		return nil, fmt.Errorf("kein VirusTotal-API-Key konfiguriert")
	}
	if a.vtClient == nil {
		a.vtClient = virustotal.NewClient(vtKey)
	}
	result, err := a.vtClient.UploadFile(a.ctx, filePath)
	if err != nil {
		logging.Warnf("VT", "Upload fehlgeschlagen (%s): %v", filePath, err)
		return &result, err
	}
	logging.Infof("VT", "Upload abgeschlossen: %s → %s (%d/%d)", filePath, result.Status, result.Detections, result.Engines)
	return &result, nil
}

// ─── VT-Whitelist ─────────────────────────────────────────────────────────────

type vtWhitelistEntry struct {
	SHA256  string `json:"sha256"`
	Name    string `json:"name"`
	AddedAt string `json:"added_at"`
}

func (a *App) vtWhitelistPath() string {
	return filepath.Join(a.vault.RootPath, "vt_whitelist.json")
}

// GetVTWhitelist gibt alle vertrauenswürdigen Hashes zurück.
func (a *App) GetVTWhitelist() ([]vtWhitelistEntry, error) {
	data, err := os.ReadFile(a.vtWhitelistPath())
	if os.IsNotExist(err) {
		return []vtWhitelistEntry{}, nil
	}
	if err != nil {
		return nil, err
	}
	var list []vtWhitelistEntry
	json.Unmarshal(data, &list)
	return list, nil
}

// AddToVTWhitelist fügt einen Hash zur Whitelist hinzu (idempotent).
func (a *App) AddToVTWhitelist(sha256, name string) error {
	list, _ := a.GetVTWhitelist()
	for _, e := range list {
		if strings.EqualFold(e.SHA256, sha256) {
			return nil // bereits vorhanden
		}
	}
	list = append(list, vtWhitelistEntry{
		SHA256:  strings.ToLower(sha256),
		Name:    name,
		AddedAt: time.Now().Format("2006-01-02 15:04:05"),
	})
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(a.vtWhitelistPath(), data, 0o644)
}

// RemoveFromVTWhitelist entfernt einen Hash aus der Whitelist.
func (a *App) RemoveFromVTWhitelist(sha256 string) error {
	list, _ := a.GetVTWhitelist()
	filtered := list[:0]
	for _, e := range list {
		if !strings.EqualFold(e.SHA256, sha256) {
			filtered = append(filtered, e)
		}
	}
	data, _ := json.MarshalIndent(filtered, "", "  ")
	return os.WriteFile(a.vtWhitelistPath(), data, 0o644)
}

// RunRawCommand führt einen beliebigen Shell-Befehl aus und gibt stdout+stderr zurück.
// Wird für die erweiterte Konsole (freie Eingabe) verwendet.
func (a *App) RunRawCommand(command string) (string, error) {
	logging.Infof("Console", "Befehl: %s", command)
	return tools.RunRaw(command)
}

// GetOpenRouterModels lädt die verfügbaren Modelle von OpenRouter.
// Gibt eine gefilterte Liste zurück; wenn onlyFree=true, nur kostenlose Modelle.
func (a *App) GetOpenRouterModels(onlyFree bool) ([]OpenRouterModel, error) {
	return fetchOpenRouterModels(onlyFree)
}

// OpenRouterModel beschreibt ein OpenRouter-Modell.
type OpenRouterModel struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	IsFree      bool    `json:"is_free"`
	ContextLen  int     `json:"context_length"`
	PricePrompt float64 `json:"price_prompt"`
}

// ─── KI-Analyse ──────────────────────────────────────────────────────────────

// AIProviderInfo beschreibt einen verfügbaren KI-Anbieter.
type AIProviderInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	HasKey  bool   `json:"has_key"`
	IsLocal bool   `json:"is_local"`
}

// GetAvailableAIProviders gibt zurück, welche Anbieter konfiguriert sind.
func (a *App) GetAvailableAIProviders() []AIProviderInfo {
	keys := config.APIKeys{}
	if a.cfg != nil {
		keys = a.cfg.APIKeys
	}
	return []AIProviderInfo{
		{ID: "openai",     Name: "OpenAI",     HasKey: keys.OpenAI != "",     IsLocal: false},
		{ID: "anthropic",  Name: "Anthropic",  HasKey: keys.Anthropic != "",  IsLocal: false},
		{ID: "groq",       Name: "Groq",       HasKey: keys.Groq != "",       IsLocal: false},
		{ID: "openrouter", Name: "OpenRouter", HasKey: keys.OpenRouter != "", IsLocal: false},
		{ID: "ollama",     Name: "Ollama",     HasKey: true,                   IsLocal: true},
		{ID: "lmstudio",   Name: "LM Studio",  HasKey: true,                  IsLocal: true},
	}
}

// CallAI sendet einen Prompt an einen Cloud-KI-Anbieter (OpenAI, Anthropic, Groq).
// Der API-Key wird aus der Konfiguration gelesen.
func (a *App) CallAI(provider, model, prompt string) (string, error) {
	if a.cfg == nil {
		return "", fmt.Errorf("keine Konfiguration geladen")
	}
	keys := a.cfg.APIKeys

	switch provider {
	case "openai":
		if keys.OpenAI == "" {
			return "", fmt.Errorf("kein OpenAI-API-Key konfiguriert")
		}
		if model == "" {
			model = "gpt-4o"
		}
		return aiassist.CallOpenAICompat("https://api.openai.com/v1", keys.OpenAI, model, prompt)

	case "anthropic":
		if keys.Anthropic == "" {
			return "", fmt.Errorf("kein Anthropic-API-Key konfiguriert")
		}
		return aiassist.CallAnthropic(keys.Anthropic, model, prompt)

	case "groq":
		if keys.Groq == "" {
			return "", fmt.Errorf("kein Groq-API-Key konfiguriert")
		}
		if model == "" {
			model = "llama-3.3-70b-versatile"
		}
		return aiassist.CallOpenAICompat("https://api.groq.com/openai/v1", keys.Groq, model, prompt)

	case "openrouter":
		if keys.OpenRouter == "" {
			return "", fmt.Errorf("kein OpenRouter-API-Key konfiguriert")
		}
		if model == "" {
			model = "meta-llama/llama-3.3-70b-instruct:free"
		}
		return aiassist.CallOpenAICompat("https://openrouter.ai/api/v1", keys.OpenRouter, model, prompt)

	default:
		return "", fmt.Errorf("unbekannter Anbieter: %s", provider)
	}
}

// CallLocalAI sendet einen Prompt an eine lokale KI-Instanz (Ollama, LM Studio).
// Verwendet die OpenAI-kompatible Chat-API (kein API-Key erforderlich).
func (a *App) CallLocalAI(baseURL, model, prompt string) (string, error) {
	if baseURL == "" {
		baseURL = aiassist.OllamaBaseURL
	}
	return aiassist.CallOpenAICompat(baseURL, "", model, prompt)
}

// fetchOpenRouterModels lädt Modelle von der öffentlichen OpenRouter-API.
func fetchOpenRouterModels(onlyFree bool) ([]OpenRouterModel, error) {
	type orPricing struct {
		Prompt     string `json:"prompt"`
		Completion string `json:"completion"`
	}
	type orModel struct {
		ID          string    `json:"id"`
		Name        string    `json:"name"`
		Description string    `json:"description"`
		ContextLen  int       `json:"context_length"`
		Pricing     orPricing `json:"pricing"`
	}
	type orResponse struct {
		Data []orModel `json:"data"`
	}

	resp, err := (&http.Client{Timeout: 15 * time.Second}).Get("https://openrouter.ai/api/v1/models")
	if err != nil {
		return nil, fmt.Errorf("OpenRouter API nicht erreichbar: %w", err)
	}
	defer resp.Body.Close()

	var raw orResponse
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("OpenRouter JSON: %w", err)
	}

	var out []OpenRouterModel
	for _, m := range raw.Data {
		isFree := m.Pricing.Prompt == "0" && m.Pricing.Completion == "0"
		if onlyFree && !isFree {
			continue
		}
		pricePrompt := 0.0
		fmt.Sscanf(m.Pricing.Prompt, "%f", &pricePrompt)
		out = append(out, OpenRouterModel{
			ID:          m.ID,
			Name:        m.Name,
			Description: m.Description,
			IsFree:      isFree,
			ContextLen:  m.ContextLen,
			PricePrompt: pricePrompt,
		})
	}
	return out, nil
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
