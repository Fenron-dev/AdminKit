package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"adminkit/internal/bundle"
	"adminkit/internal/clients"
	"adminkit/internal/config"
	"adminkit/internal/export"
	"adminkit/internal/fleet"
	"adminkit/internal/hub"
	syncpkg "adminkit/internal/sync"
)

// hubRootPath ist das Vault-Verzeichnis des eingebetteten Hubs.
func (a *App) hubRootPath() string {
	if a.vault == nil {
		return ""
	}
	return filepath.Join(a.vault.RootPath, "hub")
}

// dataDirPath ist der Ordner, in dem lokale Sessions liegen (vault/data).
func (a *App) dataDirPath() string {
	if a.vault == nil {
		return ""
	}
	return filepath.Join(a.vault.RootPath, "data")
}

// clientStore öffnet den Kundenspeicher der lokalen Vault.
func (a *App) clientStore() (*clients.Store, error) {
	if a.vault == nil {
		return nil, fmt.Errorf("keine Vault initialisiert")
	}
	return clients.NewStore(a.vault.RootPath)
}

// ensureDeviceIdentity stellt sicher, dass DeviceID und DeviceName gesetzt und
// persistiert sind. Wird vor jeder Sync-Aktion aufgerufen.
func (a *App) ensureDeviceIdentity() error {
	if a.cfg == nil {
		return fmt.Errorf("keine Konfiguration geladen")
	}
	changed := false
	if a.cfg.Sync.DeviceID == "" {
		a.cfg.Sync.DeviceID = uuid.NewString()
		changed = true
	}
	if a.cfg.Sync.DeviceName == "" {
		if host, _ := os.Hostname(); host != "" {
			a.cfg.Sync.DeviceName = host
		} else {
			a.cfg.Sync.DeviceName = "AdminKit-Gerät"
		}
		changed = true
	}
	if changed && a.vault != nil {
		return config.Save(a.cfg, a.vault.RootPath)
	}
	return nil
}

// --- Kundenverwaltung (#74) ---

// GetClients gibt alle Kundenprofile der lokalen Vault zurück.
func (a *App) GetClients() ([]config.Customer, error) {
	store, err := a.clientStore()
	if err != nil {
		return nil, err
	}
	return store.List()
}

// SaveClient legt einen Kunden an oder aktualisiert ihn (gibt ihn mit ID zurück).
func (a *App) SaveClient(c config.Customer) (config.Customer, error) {
	store, err := a.clientStore()
	if err != nil {
		return config.Customer{}, err
	}
	return store.Save(c)
}

// DeleteClient entfernt ein Kundenprofil.
func (a *App) DeleteClient(id string) error {
	store, err := a.clientStore()
	if err != nil {
		return err
	}
	return store.Delete(id)
}

// --- Hub-Rolle (Server) ---

// StartHub startet den eingebetteten LAN-Hub und setzt die Rolle auf "hub".
func (a *App) StartHub() error {
	if a.vault == nil {
		return fmt.Errorf("keine Vault initialisiert")
	}
	if a.hubServer != nil {
		return nil // läuft bereits
	}
	if err := a.ensureDeviceIdentity(); err != nil {
		return err
	}
	port := a.cfg.Sync.ListenPort
	if port == 0 {
		port = config.DefaultSyncPort
	}
	srv, err := hub.NewServer(hub.Options{
		HubRoot:   a.hubRootPath(),
		Port:      port,
		Version:   a.GetAppVersion(),
		Advertise: true,
	})
	if err != nil {
		return err
	}
	if err := srv.Start(); err != nil {
		return err
	}
	a.hubServer = srv
	a.cfg.Sync.Role = config.SyncRoleHub
	a.cfg.Sync.ListenPort = port
	return config.Save(a.cfg, a.vault.RootPath)
}

// StopHub fährt den eingebetteten Hub herunter (Rolle wird auf offline gesetzt).
func (a *App) StopHub() error {
	if a.hubServer == nil {
		return nil
	}
	err := a.hubServer.Stop()
	a.hubServer = nil
	if a.cfg != nil && a.vault != nil {
		a.cfg.Sync.Role = config.SyncRoleOffline
		_ = config.Save(a.cfg, a.vault.RootPath)
	}
	return err
}

// GetHubStatus liefert den Laufzeitzustand des Hubs (oder Running=false).
func (a *App) GetHubStatus() hub.Status {
	if a.hubServer == nil {
		return hub.Status{Running: false}
	}
	return a.hubServer.Status()
}

// GetHubPairingCode erzeugt einen neuen 6-stelligen Pairing-PIN am Hub.
func (a *App) GetHubPairingCode() (string, error) {
	if a.hubServer == nil {
		return "", fmt.Errorf("hub läuft nicht")
	}
	pin, _, err := a.hubServer.GeneratePairingCode()
	return pin, err
}

// --- Client-Rolle ---

// DiscoverHubs sucht per mDNS nach Hubs im LAN (blockiert bis zu 3 Sekunden).
func (a *App) DiscoverHubs() ([]syncpkg.HubInfo, error) {
	ctx, cancel := context.WithTimeout(a.ctx, 4*time.Second)
	defer cancel()
	return syncpkg.Discover(ctx, 3*time.Second)
}

// PairWithHub koppelt dieses Gerät per PIN an den Hub unter baseURL und
// speichert Tokens sowie Host für spätere automatische Wiederverbindung.
func (a *App) PairWithHub(baseURL, pin string) error {
	if a.vault == nil {
		return fmt.Errorf("keine Vault initialisiert")
	}
	if err := a.ensureDeviceIdentity(); err != nil {
		return err
	}
	client := a.newSyncClient(baseURL)
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	if err := client.Pair(ctx, pin); err != nil {
		return err
	}
	a.syncClient = client
	a.cfg.Sync.Role = config.SyncRoleClient
	a.cfg.Sync.HubHost = baseURL
	return config.Save(a.cfg, a.vault.RootPath)
}

// newSyncClient baut einen Client, der Token-Änderungen automatisch in
// config.yaml persistiert (wichtig für USB-Stick-Betrieb).
func (a *App) newSyncClient(baseURL string) *syncpkg.Client {
	client := syncpkg.NewClient(baseURL, a.cfg.Sync.DeviceID, a.cfg.Sync.DeviceName)
	client.SetTokens(a.cfg.Sync.AccessToken, a.cfg.Sync.RefreshToken)
	client.OnTokens = func(access, refresh string) {
		if a.cfg == nil || a.vault == nil {
			return
		}
		a.cfg.Sync.AccessToken = access
		a.cfg.Sync.RefreshToken = refresh
		_ = config.Save(a.cfg, a.vault.RootPath)
	}
	return client
}

// ensureSyncClient stellt sicher, dass ein Client für den gespeicherten Hub existiert.
func (a *App) ensureSyncClient() (*syncpkg.Client, error) {
	if a.syncClient != nil {
		return a.syncClient, nil
	}
	if a.cfg == nil || a.cfg.Sync.HubHost == "" {
		return nil, fmt.Errorf("kein Hub gekoppelt")
	}
	a.syncClient = a.newSyncClient(a.cfg.Sync.HubHost)
	return a.syncClient, nil
}

// PushSessionToHub lädt eine lokale Session (Metadaten + Snapshots) zum Hub hoch.
func (a *App) PushSessionToHub(sessionPath string) error {
	client, err := a.ensureSyncClient()
	if err != nil {
		return err
	}
	meta, snapshots, err := a.readSessionForSync(sessionPath)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 60*time.Second)
	defer cancel()
	return client.PushSession(ctx, meta, snapshots)
}

// GetFleetOverview ruft die nach Kunde gruppierte Fleet-Übersicht ab.
// Als Hub direkt aus dem lokalen Store, als Client über den Hub.
func (a *App) GetFleetOverview() (map[string][]hub.SessionMeta, error) {
	if a.hubServer != nil {
		return a.hubServer.Fleet()
	}
	client, err := a.ensureSyncClient()
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	return client.Fleet(ctx)
}

// GetFleetSummary liefert die aggregierte Fleet-Übersicht (Kunden → Geräte mit
// Health-Status und Trend) für das Flotte-Tab (Phase C, #79).
func (a *App) GetFleetSummary() (fleet.Overview, error) {
	sessions, err := a.fleetSessions()
	if err != nil {
		return fleet.Overview{}, err
	}
	return fleet.BuildOverview(sessions), nil
}

// fleetSessions holt die Roh-Sessions: als Hub lokal, als Client über den Hub.
func (a *App) fleetSessions() ([]hub.SessionMeta, error) {
	if a.hubServer != nil {
		return a.hubServer.ListSessions()
	}
	client, err := a.ensureSyncClient()
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	return client.ListSessions(ctx)
}

// ExportFleetReport erzeugt einen kombinierten HTML-Bericht über alle Geräte
// der Flotte und speichert ihn im Vault (exports/reports). Gibt den Pfad zurück.
func (a *App) ExportFleetReport() (string, error) {
	if a.vault == nil {
		return "", fmt.Errorf("keine Vault initialisiert")
	}
	ov, err := a.GetFleetSummary()
	if err != nil {
		return "", err
	}
	report := &export.FleetReport{
		GeneratedAt: time.Now(),
		Overview:    ov,
	}
	if a.cfg != nil {
		report.CompanyName = a.cfg.Branding.CompanyName
		report.TechnicianName = a.cfg.Branding.TechnicianName
		report.LogoBase64 = a.readLogoBase64()
	}
	outDir := filepath.Join(a.vault.RootPath, "exports", "reports")
	return export.ExportFleetHTML(report, outDir)
}

// SyncRole gibt die aktuelle Rolle zurück (offline/hub/client) – für die
// Tab-Sichtbarkeit im Frontend.
func (a *App) SyncRole() string {
	if a.hubServer != nil {
		return string(config.SyncRoleHub)
	}
	if a.cfg != nil && a.cfg.Sync.Role != "" {
		return string(a.cfg.Sync.Role)
	}
	return string(config.SyncRoleOffline)
}

// --- Air-Gap-Bundles (#74) ---

// ExportSessionBundle exportiert eine Session als .adminkit-Datei. Öffnet einen
// Speichern-Dialog und gibt den gewählten Pfad zurück ("" bei Abbruch).
func (a *App) ExportSessionBundle(sessionPath string) (string, error) {
	meta := a.readSessionMeta(sessionPath)
	suggested := sanitizeExportName(meta.SessionName) + bundle.Extension
	dest, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Session als Bundle exportieren",
		DefaultFilename: suggested,
		Filters: []runtime.FileFilter{
			{DisplayName: "AdminKit-Bundle", Pattern: "*" + bundle.Extension},
		},
	})
	if err != nil {
		return "", fmt.Errorf("Speichern-Dialog: %w", err)
	}
	if dest == "" {
		return "", nil // abgebrochen
	}
	return bundle.Export(sessionPath, meta, dest)
}

// ImportSessionBundle importiert eine .adminkit-Datei in die lokale Vault.
// Öffnet einen Datei-Dialog und gibt den neuen Session-Pfad zurück ("" bei Abbruch).
func (a *App) ImportSessionBundle() (string, error) {
	if a.vault == nil {
		return "", fmt.Errorf("keine Vault initialisiert")
	}
	src, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Session-Bundle importieren",
		Filters: []runtime.FileFilter{
			{DisplayName: "AdminKit-Bundle", Pattern: "*" + bundle.Extension},
		},
	})
	if err != nil {
		return "", fmt.Errorf("Datei-Dialog: %w", err)
	}
	if src == "" {
		return "", nil // abgebrochen
	}
	if err := os.MkdirAll(a.dataDirPath(), 0755); err != nil {
		return "", err
	}
	sessionPath, _, err := bundle.Import(src, a.dataDirPath())
	return sessionPath, err
}

// --- Session-Metadaten-Helfer ---

// readSessionForSync liest Snapshots und Metadaten einer Session für den Push.
func (a *App) readSessionForSync(sessionPath string) (hub.SessionMeta, map[string][]byte, error) {
	snapMap, err := a.LoadSession(sessionPath)
	if err != nil {
		return hub.SessionMeta{}, nil, err
	}
	if len(snapMap) == 0 {
		return hub.SessionMeta{}, nil, fmt.Errorf("session hat keine Snapshots")
	}
	snapshots := make(map[string][]byte, len(snapMap))
	for k, v := range snapMap {
		snapshots[k] = []byte(v)
	}
	m := a.readSessionMeta(sessionPath)
	meta := hub.SessionMeta{
		SessionName:  m.SessionName,
		CustomerName: m.CustomerName,
		DeviceAlias:  m.DeviceAlias,
		Hostname:     m.Hostname,
		Location:     m.Location,
		Technician:   m.Technician,
		DeviceID:     a.cfg.Sync.DeviceID,
		SourceDevice: a.cfg.Sync.DeviceName,
		ScannedAt:    m.ScannedAt,
		HealthScore:  healthFromSnapshot(snapMap["health"]),
	}
	meta.ID = hub.SessionID(meta.DeviceID, meta.SessionName)
	return meta, snapshots, nil
}

// healthFromSnapshot liest den Score aus dem "health"-Snapshot (0 wenn keiner).
func healthFromSnapshot(raw string) int {
	if raw == "" {
		return 0
	}
	var hs struct {
		Score int `json:"score"`
	}
	if json.Unmarshal([]byte(raw), &hs) != nil {
		return 0
	}
	return hs.Score
}

// readSessionMeta liest die meta.json einer Session oder leitet sie aus dem
// Ordnernamen ab, falls keine vorhanden ist (Alt-Sessions).
func (a *App) readSessionMeta(sessionPath string) bundle.Meta {
	if m, err := bundle.ReadSessionMeta(sessionPath); err == nil {
		return m
	}
	host, _ := os.Hostname()
	meta := bundle.Meta{
		SessionName: filepath.Base(sessionPath),
		Hostname:    host,
		ScannedAt:   time.Now(),
	}
	if a.cfg != nil {
		meta.Technician = a.cfg.Branding.TechnicianName
	}
	return meta
}

// writeSessionMeta schreibt die meta.json einer Session (bei Session-Erstellung).
func (a *App) writeSessionMeta(sessionPath string, meta bundle.Meta) error {
	return bundle.WriteSessionMeta(sessionPath, meta)
}

// NewCustomerSession erstellt eine Session mit Kunde, Geräte-Alias und Standort
// und legt die meta.json an (erweiterter "Neue Session"-Dialog, Phase B).
func (a *App) NewCustomerSession(customerName, deviceAlias, location string) (string, error) {
	label := customerName
	if deviceAlias != "" {
		label = customerName + "_" + deviceAlias
	}
	sessionPath, err := a.NewSession(label)
	if err != nil {
		return "", err
	}
	host, _ := os.Hostname()
	meta := bundle.Meta{
		SessionName:     filepath.Base(sessionPath),
		CustomerName:    customerName,
		DeviceAlias:     deviceAlias,
		Location:        location,
		Hostname:        host,
		AdminKitVersion: a.GetAppVersion(),
		ScannedAt:       time.Now(),
	}
	if a.cfg != nil {
		meta.Technician = a.cfg.Branding.TechnicianName
		meta.DeviceID = a.cfg.Sync.DeviceID
	}
	if err := a.writeSessionMeta(sessionPath, meta); err != nil {
		return sessionPath, err // Session existiert bereits, Meta-Fehler nur melden
	}
	return sessionPath, nil
}

// sanitizeExportName macht einen Session-Namen dateisystemtauglich.
func sanitizeExportName(name string) string {
	if name == "" {
		return "session"
	}
	out := make([]rune, 0, len(name))
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9',
			r == '-', r == '_':
			out = append(out, r)
		default:
			out = append(out, '_')
		}
	}
	return string(out)
}
