package main

import (
	"os"

	"gopkg.in/yaml.v3"

	"adminkit/internal/hub"
)

// hubConfig ist die GUI-lose Konfiguration des Standalone-Hubs (hub-config.yaml).
type hubConfig struct {
	// Root ist das Vault-Verzeichnis des Hubs (Sessions, Keys, Clients).
	Root string `yaml:"root"`
	// Port, auf dem gelauscht wird.
	Port int `yaml:"port"`
	// Advertise macht den Hub im LAN per mDNS bekannt (im Online-Betrieb meist aus).
	Advertise bool `yaml:"advertise"`
	// TLS konfiguriert HTTPS.
	TLS tlsConfig `yaml:"tls"`
}

type tlsConfig struct {
	// Enabled aktiviert HTTPS (erfordert Zertifikat oder SelfSigned).
	Enabled bool `yaml:"enabled"`
	// SelfSigned erzeugt bei Bedarf ein selbstsigniertes Zertifikat.
	SelfSigned bool `yaml:"self_signed"`
	// CertFile/KeyFile: eigenes Zertifikat (leer + SelfSigned → auto-generiert).
	CertFile string `yaml:"cert_file"`
	KeyFile  string `yaml:"key_file"`
	// Hosts: zusätzliche DNS-Namen/IPs für das selbstsignierte Zertifikat.
	Hosts []string `yaml:"hosts"`
}

// defaultHubConfig liefert sinnvolle Standardwerte.
func defaultHubConfig() hubConfig {
	return hubConfig{
		Root:      "./hub_vault",
		Port:      hub.DefaultPort,
		Advertise: true,
	}
}

// loadHubConfig liest hub-config.yaml. Fehlt die Datei, gelten die Defaults.
func loadHubConfig(path string) (hubConfig, error) {
	cfg := defaultHubConfig()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return cfg, err
	}
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return cfg, err
	}
	if cfg.Port == 0 {
		cfg.Port = hub.DefaultPort
	}
	if cfg.Root == "" {
		cfg.Root = "./hub_vault"
	}
	return cfg, nil
}
