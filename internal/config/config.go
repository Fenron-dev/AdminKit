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
}

// APIKeys enthält API-Schlüssel für externe Dienste.
// Gespeichert in adminkit_vault/config.yaml — niemals ins Git-Repo.
type APIKeys struct {
	VirusTotal string `yaml:"virustotal,omitempty"  json:"virustotal,omitempty"`
	OpenAI     string `yaml:"openai,omitempty"      json:"openai,omitempty"`
	Anthropic  string `yaml:"anthropic,omitempty"   json:"anthropic,omitempty"`
	Groq       string `yaml:"groq,omitempty"        json:"groq,omitempty"`
	OpenRouter string `yaml:"openrouter,omitempty"  json:"openrouter,omitempty"`
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
	LogLocation          string `yaml:"log_location"           json:"log_location"`
	ExportFormat         string `yaml:"export_format"          json:"export_format"`
	IncludeWifiPasswords bool   `yaml:"include_wifi_passwords" json:"include_wifi_passwords"`
	IncludeSmartData     bool   `yaml:"include_smart_data"     json:"include_smart_data"`
	AutoVTScan           bool   `yaml:"auto_vt_scan"           json:"auto_vt_scan"`
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

	return cfg, nil
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

	return os.WriteFile(filepath.Join(vaultPath, DefaultConfigFilename), data, 0644)
}
