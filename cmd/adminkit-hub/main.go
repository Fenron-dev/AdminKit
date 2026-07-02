// Command adminkit-hub ist der eigenständige AdminKit-Fleet-Hub ohne GUI
// (Phase D, #74/#80). Er verwendet dieselben internal/hub-Pakete wie die
// Desktop-App und ist als Dienst oder Docker-Container auf VPS/NAS deploybar.
//
// Pairing: Beim Start wird ein PIN ausgegeben. Eine Eingabe (Enter) auf der
// Konsole erzeugt einen neuen PIN — so lassen sich Clients koppeln.
package main

import (
	"bufio"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"adminkit/internal/hub"
)

// version wird in der /health-Antwort gemeldet.
const version = "hub-1.0"

func main() {
	var (
		configPath = flag.String("config", "hub-config.yaml", "Pfad zur hub-config.yaml")
		root       = flag.String("root", "", "Vault-Verzeichnis des Hubs (überschreibt config)")
		port       = flag.Int("port", 0, "Listen-Port (überschreibt config)")
		advertise  = flag.Bool("advertise", true, "mDNS-Bekanntmachung im LAN")
		selfSigned = flag.Bool("self-signed", false, "Selbstsigniertes TLS-Zertifikat erzeugen/verwenden")
		certFile   = flag.String("tls-cert", "", "TLS-Zertifikat (aktiviert HTTPS)")
		keyFile    = flag.String("tls-key", "", "TLS-Schlüssel (aktiviert HTTPS)")
	)
	flag.Parse()

	cfg, err := loadHubConfig(*configPath)
	if err != nil {
		log.Fatalf("hub-config.yaml konnte nicht gelesen werden: %v", err)
	}
	applyFlagOverrides(&cfg, *root, *port, *advertise, *selfSigned, *certFile, *keyFile)

	if err := os.MkdirAll(cfg.Root, 0755); err != nil {
		log.Fatalf("Vault-Verzeichnis konnte nicht erstellt werden: %v", err)
	}

	cert, key, err := resolveTLS(cfg)
	if err != nil {
		log.Fatalf("TLS-Konfiguration fehlgeschlagen: %v", err)
	}

	srv, err := hub.NewServer(hub.Options{
		HubRoot:   cfg.Root,
		Port:      cfg.Port,
		Version:   version,
		Advertise: cfg.Advertise,
		CertFile:  cert,
		KeyFile:   key,
	})
	if err != nil {
		log.Fatalf("Hub konnte nicht initialisiert werden: %v", err)
	}
	if err := srv.Start(); err != nil {
		log.Fatalf("Hub-Start fehlgeschlagen: %v", err)
	}

	scheme := "http"
	if srv.TLSEnabled() {
		scheme = "https"
	}
	log.Printf("AdminKit-Hub läuft: %s://0.0.0.0:%d  (Vault: %s)", scheme, cfg.Port, cfg.Root)
	printNewPairingCode(srv)
	log.Printf("→ Enter drücken für einen neuen Pairing-PIN. Strg+C zum Beenden.")

	go readPairingRequests(srv)

	// Auf Beenden-Signal warten und sauber herunterfahren.
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig
	log.Printf("Fahre Hub herunter…")
	if err := srv.Stop(); err != nil {
		log.Printf("Fehler beim Stoppen: %v", err)
	}
}

// applyFlagOverrides überschreibt Config-Werte mit gesetzten Kommandozeilen-Flags.
func applyFlagOverrides(cfg *hubConfig, root string, port int, advertise, selfSigned bool, certFile, keyFile string) {
	if root != "" {
		cfg.Root = root
	}
	if port != 0 {
		cfg.Port = port
	}
	// advertise-Flag hat den Default true; nur übernehmen, wenn explizit false gesetzt.
	if !advertise {
		cfg.Advertise = false
	}
	if selfSigned {
		cfg.TLS.Enabled = true
		cfg.TLS.SelfSigned = true
	}
	if certFile != "" && keyFile != "" {
		cfg.TLS.Enabled = true
		cfg.TLS.CertFile = certFile
		cfg.TLS.KeyFile = keyFile
	}
}

// resolveTLS ermittelt Cert-/Key-Pfade und erzeugt bei Bedarf ein selbstsigniertes Zertifikat.
func resolveTLS(cfg hubConfig) (cert, key string, err error) {
	if !cfg.TLS.Enabled {
		return "", "", nil
	}
	cert, key = cfg.TLS.CertFile, cfg.TLS.KeyFile
	if cert == "" || key == "" {
		// Auto-Pfade im Vault-Verzeichnis.
		cert = filepath.Join(cfg.Root, "hub-cert.pem")
		key = filepath.Join(cfg.Root, "hub-key.pem")
	}
	if cfg.TLS.SelfSigned {
		if err := hub.EnsureSelfSigned(cert, key, cfg.TLS.Hosts); err != nil {
			return "", "", err
		}
	}
	if !fileExists(cert) || !fileExists(key) {
		return "", "", fmt.Errorf("TLS aktiviert, aber Zertifikat/Schlüssel fehlen (%s / %s)", cert, key)
	}
	return cert, key, nil
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// printNewPairingCode erzeugt einen PIN und gibt ihn gut sichtbar aus.
func printNewPairingCode(srv *hub.Server) {
	pin, expires, err := srv.GeneratePairingCode()
	if err != nil {
		log.Printf("PIN konnte nicht erzeugt werden: %v", err)
		return
	}
	fmt.Printf("\n  ┌──────────────────────────────┐\n")
	fmt.Printf("  │  Pairing-PIN:  %s        │\n", pin)
	fmt.Printf("  └──────────────────────────────┘\n")
	fmt.Printf("  Gültig bis %s\n\n", expires.Format("15:04:05"))
}

// readPairingRequests erzeugt bei jeder Konsolen-Eingabe einen neuen PIN.
func readPairingRequests(srv *hub.Server) {
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		printNewPairingCode(srv)
	}
}
