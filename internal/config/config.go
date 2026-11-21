// Package config verwaltet die AdminKit-Konfiguration aus config.yaml.
// Die Konfiguration liegt im Vault-Verzeichnis und wird beim Start geladen.
package config

import (
	"errors"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

const DefaultConfigFilename = "config.yaml"

// Config repräsentiert die vollständige Konfiguration aus config.yaml.
type Config struct {
	Version   string   `yaml:"version"              json:"version"`
	VaultPath string   `yaml:"vault_path"           json:"vault_path"`
	Branding  Branding `yaml:"branding"             json:"branding"`
	Defaults  Defaults `yaml:"defaults"             json:"defaults"`
	Backup    Backup   `yaml:"backup"               json:"backup"`
	UI        UI       `yaml:"ui"                   json:"ui"`
	Logging   Logging  `yaml:"logging"              json:"logging"`
	APIKeys   APIKeys  `yaml:"api_keys,omitempty"   json:"api_keys,omitempty"`
	AIModels  AIModels `yaml:"ai_models,omitempty"  json:"ai_models,omitempty"`
	Sync      Sync     `yaml:"sync,omitempty"       json:"sync,omitempty"`
	Online    Online   `yaml:"online"               json:"online"`
	Packages  Packages `yaml:"packages"             json:"packages"`
	Billing   Billing  `yaml:"billing"              json:"billing"`
}

// Online ist der gemeinsame Schalter für alle Funktionen, die ins Internet gehen
// (Paketverwaltung, DNS-/Mail-Check, Link-Dienste). Enabled=false schaltet alles
// ab, z. B. für Quarantäne- oder Air-Gap-Sticks. Online-Aktionen starten nie
// automatisch, sondern nur auf Klick.
type Online struct {
	Enabled      bool `yaml:"enabled"       json:"enabled"`
	Packages     bool `yaml:"packages"      json:"packages"`
	DNS          bool `yaml:"dns"           json:"dns"`
	LinkServices bool `yaml:"link_services" json:"link_services"`
	GitHubStats  bool `yaml:"github_stats"  json:"github_stats"`
}

// Allowed meldet, ob ein bestimmter Online-Bereich aktiv ist
// ("packages", "dns", "link_services", "github_stats").
func (o Online) Allowed(area string) bool {
	if !o.Enabled {
		return false
	}
	switch area {
	case "packages":
		return o.Packages
	case "dns":
		return o.DNS
	case "link_services":
		return o.LinkServices
	case "github_stats":
		return o.GitHubStats
	}
	return false
}

// Packages konfiguriert die Paketverwaltung (winget / Homebrew).
type Packages struct {
	// Sources: winget-Quellen, Standard nur "winget" (optional "msstore").
	Sources []string `yaml:"sources"         json:"sources"`
	// Silent: Installer ohne Fenster (--silent).
	Silent bool `yaml:"silent"          json:"silent"`
	// DefaultScope: "machine", "user" oder "" (Installer entscheidet).
	DefaultScope string `yaml:"default_scope"   json:"default_scope"`
	// GreedyCasks: Homebrew --greedy (auch selbstaktualisierende Apps).
	GreedyCasks bool `yaml:"greedy_casks"    json:"greedy_casks"`
	// InfoCacheDays: Gültigkeit des Paket-Info-Caches im Vault.
	InfoCacheDays int `yaml:"info_cache_days" json:"info_cache_days"`
}

// Billing konfiguriert die Abrechnung in Arbeitseinheiten (AE).
type Billing struct {
	// AEMinutes: Minuten pro Arbeitseinheit (Standard 10).
	AEMinutes int `yaml:"ae_minutes" json:"ae_minutes"`
	// Rounding: "up" (angefangene AE zählt) oder "nearest".
	Rounding string `yaml:"rounding"   json:"rounding"`
}

// SyncRole beschreibt die Rolle dieser AdminKit-Instanz im Sync-Verbund.
type SyncRole string

const (
	// SyncRoleOffline: kein Sync (Standard). Tool läuft rein lokal.
	SyncRoleOffline SyncRole = "offline"
	// SyncRoleHub: diese Instanz stellt einen LAN-Hub bereit.
	SyncRoleHub SyncRole = "hub"
	// SyncRoleClient: diese Instanz pusht Sessions an einen Hub.
	SyncRoleClient SyncRole = "client"
)

// Sync konfiguriert die optionale Fleet-Synchronisierung (siehe #74).
// Tokens landen ausschließlich in der Vault-config.yaml, niemals im Git-Repo.
type Sync struct {
	// Role: offline (Standard) | hub | client.
	Role SyncRole `yaml:"role,omitempty"          json:"role,omitempty"`
	// DeviceID: stabile UUID dieses Geräts/Sticks (für Session-Identität).
	DeviceID string `yaml:"device_id,omitempty"     json:"device_id,omitempty"`
	// DeviceName: menschenlesbarer Name (z.B. "Dennis-Stick").
	DeviceName string `yaml:"device_name,omitempty"   json:"device_name,omitempty"`
	// HubHost/HubPort: zuletzt bekannter Hub (für USB-Stick-Wiederfinden).
	HubHost string `yaml:"hub_host,omitempty"      json:"hub_host,omitempty"`
	HubPort int    `yaml:"hub_port,omitempty"      json:"hub_port,omitempty"`
	// HubPort für den eingebetteten Hub-Server (Rolle hub).
	ListenPort int `yaml:"listen_port,omitempty"   json:"listen_port,omitempty"`
	// AccessToken/RefreshToken: JWT-Pairing (nur Rolle client).
	AccessToken  string `yaml:"access_token,omitempty"  json:"-"`
	RefreshToken string `yaml:"refresh_token,omitempty" json:"-"`
}

// DefaultSyncPort ist der Standard-Port für den eingebetteten LAN-Hub.
const DefaultSyncPort = 8767

// Customer ist ein Kundenprofil (siehe #74). Wird nicht in config.yaml,
// sondern als eigene Datei unter vault/clients/<id>.yaml gespeichert, damit
// Kundenlisten über den Hub synchronisiert werden können.
type Customer struct {
	ID           string `yaml:"id"                      json:"id"`
	Name         string `yaml:"name"                    json:"name"`
	ShortName    string `yaml:"short_name,omitempty"    json:"short_name,omitempty"`
	ContactName  string `yaml:"contact_name,omitempty"  json:"contact_name,omitempty"`
	ContactEmail string `yaml:"contact_email,omitempty" json:"contact_email,omitempty"`
	Notes        string `yaml:"notes,omitempty"         json:"notes,omitempty"`
	CreatedAt    string `yaml:"created_at,omitempty"    json:"created_at,omitempty"`
}

// APIKeys enthält API-Schlüssel für externe Dienste.
// Gespeichert in adminkit_vault/config.yaml — niemals ins Git-Repo.
type APIKeys struct {
	VirusTotal string `yaml:"virustotal,omitempty"  json:"virustotal,omitempty"`
	OpenAI     string `yaml:"openai,omitempty"      json:"openai,omitempty"`
	Anthropic  string `yaml:"anthropic,omitempty"   json:"anthropic,omitempty"`
	Groq       string `yaml:"groq,omitempty"        json:"groq,omitempty"`
	OpenRouter string `yaml:"openrouter,omitempty"  json:"openrouter,omitempty"`
	// GitHub: optionales Token, erhöht das API-Limit für Paket-Statistiken.
	GitHub string `yaml:"github,omitempty"      json:"github,omitempty"`
	// URLScan: optionaler API-Key für urlscan.io (Link-Prüfer).
	URLScan string `yaml:"urlscan,omitempty"     json:"urlscan,omitempty"`
}

// AIModels speichert das bevorzugte Modell pro Anbieter.
type AIModels struct {
	OpenAI     string `yaml:"openai,omitempty"      json:"openai,omitempty"`
	Anthropic  string `yaml:"anthropic,omitempty"   json:"anthropic,omitempty"`
	Groq       string `yaml:"groq,omitempty"        json:"groq,omitempty"`
	Ollama     string `yaml:"ollama,omitempty"      json:"ollama,omitempty"`
	LMStudio   string `yaml:"lmstudio,omitempty"    json:"lmstudio,omitempty"`
	OpenRouter string `yaml:"openrouter,omitempty"  json:"openrouter,omitempty"`
}

// Branding enthält Firmen- und Technikerinformationen für Berichte.
type Branding struct {
	CompanyName    string `yaml:"company_name"    json:"company_name"`
	TechnicianName string `yaml:"technician_name" json:"technician_name"`
	// LogoPath: absoluter oder vault-relativer Pfad zu einer PNG/JPG-Datei.
	// Wird beim Export als Base64-Data-URI eingebettet.
	LogoPath string `yaml:"logo_path" json:"logo_path"`
}

type Defaults struct {
	LogLocation          string `yaml:"log_location"            json:"log_location"`
	ExportFormat         string `yaml:"export_format"           json:"export_format"`
	IncludeWifiPasswords bool   `yaml:"include_wifi_passwords"  json:"include_wifi_passwords"`
	IncludeSmartData     bool   `yaml:"include_smart_data"      json:"include_smart_data"`
	AutoVTScan           bool   `yaml:"auto_vt_scan"            json:"auto_vt_scan"`
	// EnabledQuickActions: Leer = alle aktiviert. Nur explizit deaktivierte werden weggelassen.
	DisabledQuickActions []string `yaml:"disabled_quick_actions,omitempty" json:"disabled_quick_actions,omitempty"`
}

type Backup struct {
	AutoBackupBeforeExport bool   `yaml:"auto_backup_before_export" json:"auto_backup_before_export"`
	Compression            string `yaml:"compression"               json:"compression"`
}

type UI struct {
	Theme        string `yaml:"theme"         json:"theme"`
	Language     string `yaml:"language"      json:"language"`
	ShowAdvanced bool   `yaml:"show_advanced" json:"show_advanced"`
}

type Logging struct {
	Level      string `yaml:"level"       json:"level"`
	Location   string `yaml:"location"    json:"location"`
	CustomPath string `yaml:"custom_path" json:"custom_path"`
	MaxSizeMB  int    `yaml:"max_size_mb" json:"max_size_mb"`
}

// DefaultConfig gibt eine sinnvolle Standardkonfiguration zurück.
func DefaultConfig() *Config {
	return &Config{
		Version:   "1.0",
		VaultPath: "./adminkit_vault",
		Defaults: Defaults{
			LogLocation:          "./logs",
			ExportFormat:         "html",
			IncludeWifiPasswords: true,
			IncludeSmartData:     true,
		},
		Backup: Backup{
			AutoBackupBeforeExport: true,
			Compression:            "gzip",
		},
		UI: UI{
			Theme:    "system",
			Language: "de",
		},
		Logging: Logging{
			Level:     "info",
			Location:  "vault",
			MaxSizeMB: 10,
		},
		Online: Online{
			Enabled:      true,
			Packages:     true,
			DNS:          true,
			LinkServices: true,
			GitHubStats:  true,
		},
		Packages: Packages{
			Sources:       []string{"winget"},
			Silent:        true,
			DefaultScope:  "machine",
			InfoCacheDays: 30,
		},
		Billing: Billing{
			AEMinutes: 10,
			Rounding:  "up",
		},
	}
}

// Load liest config.yaml aus dem angegebenen Verzeichnis.
// Wenn die Datei nicht existiert, wird die Standardkonfiguration zurückgegeben.
func Load(vaultPath string) (*Config, error) {
	cfg := DefaultConfig()
	cfgPath := filepath.Join(vaultPath, DefaultConfigFilename)

	data, err := os.ReadFile(cfgPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return cfg, nil
		}
		return nil, err
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	cfg.Normalize()
	return cfg, nil
}

// Normalize ersetzt ungültige oder fehlende Werte durch Standardwerte.
func (c *Config) Normalize() {
	if c.Billing.AEMinutes <= 0 {
		c.Billing.AEMinutes = 10
	}
	if c.Billing.Rounding != "nearest" {
		c.Billing.Rounding = "up"
	}
	if c.Packages.InfoCacheDays <= 0 {
		c.Packages.InfoCacheDays = 30
	}
	if len(c.Packages.Sources) == 0 {
		c.Packages.Sources = []string{"winget"}
	}
	switch c.Packages.DefaultScope {
	case "", "machine", "user":
	default:
		c.Packages.DefaultScope = "machine"
	}
}

// Save schreibt die Konfiguration als config.yaml in das angegebene Verzeichnis.
func Save(cfg *Config, vaultPath string) error {
	if err := os.MkdirAll(vaultPath, 0755); err != nil {
		return err
	}

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}

	// 0600: config.yaml enthält API-Keys und Sync-Tokens (Finding S2).
	path := filepath.Join(vaultPath, DefaultConfigFilename)
	if err := os.WriteFile(path, data, 0600); err != nil {
		return err
	}
	// WriteFile ändert die Rechte bestehender Dateien nicht – alte 0644 nachziehen.
	_ = os.Chmod(path, 0600) // auf FAT/exFAT-Sticks wirkungslos, kein Fehler
	return nil
}
