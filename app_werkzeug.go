package main

// Werkzeugkasten (#88–#92): Go-Seite der Plattform-Schicht (platform.adminkit.js).

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"regexp"
	goruntime "runtime"
	"strings"
	"sync"
	"time"

	"adminkit/internal/capture"
	"adminkit/internal/cmdrun"
	"adminkit/internal/execx"
	"adminkit/internal/hashing"
	"adminkit/internal/logging"
	"adminkit/internal/netcheck"
	"adminkit/internal/network"
	"adminkit/internal/system"
	"adminkit/internal/werkzeug"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type wzState struct {
	once  sync.Once
	state *werkzeug.State
	err   error

	mu         sync.Mutex
	hashCancel context.CancelFunc

	uploadsOnce sync.Once
	uploads     *werkzeug.Uploads
	recorder    capture.Recorder
}

func (a *App) toolState() (*werkzeug.State, error) {
	if a.vault == nil {
		return nil, fmt.Errorf("keine Vault initialisiert")
	}
	a.wz.once.Do(func() {
		a.wz.state, a.wz.err = werkzeug.OpenState(a.vault.RootPath)
		if a.wz.err != nil {
			logging.Warnf("Werkzeug", "state.json: %v", a.wz.err)
		}
	})
	return a.wz.state, nil
}

// GetToolStates liefert alle gespeicherten Werkzeug-Einstellungen.
// (map[string]any statt json.RawMessage – unkritisch für die Wails-Bindings.)
func (a *App) GetToolStates() (map[string]any, error) {
	s, err := a.toolState()
	if err != nil {
		return nil, err
	}
	out := map[string]any{}
	for k, raw := range s.All() {
		var v any
		if json.Unmarshal(raw, &v) == nil {
			out[k] = v
		}
	}
	return out, nil
}

// SaveToolState speichert eine Werkzeug-Einstellung (value = JSON, "null" löscht).
func (a *App) SaveToolState(key, value string) error {
	s, err := a.toolState()
	if err != nil {
		return err
	}
	return s.Set(key, value)
}

// GetDeviceIdentity liefert Hersteller, Modell und Geräte-Seriennummer (#111).
func (a *App) GetDeviceIdentity() (system.DeviceIdentity, error) {
	return system.Identity()
}

// GetGateways liefert die Standardgateways verbundener Adapter (#112, nur lesend).
func (a *App) GetGateways() ([]string, error) {
	r, err := network.Scan(false)
	if r == nil {
		return nil, err
	}
	var out []string
	seen := map[string]bool{}
	for _, ad := range r.Adapters {
		if ad.IsConnected && ad.Gateway != "" && !seen[ad.Gateway] && ad.Type != network.AdapterLoopback {
			seen[ad.Gateway] = true
			out = append(out, ad.Gateway)
		}
	}
	return out, nil
}

// ── Eigene Einträge (#105) ──────────────────────────────────────────────────

// GetEntries liefert eine Sammlung eigener Einträge (JSON, "{}" wenn leer).
func (a *App) GetEntries(kind string) (string, error) {
	root, err := a.vaultRootOrErr()
	if err != nil {
		return "", err
	}
	return werkzeug.LoadEntries(root, kind)
}

// SaveEntries speichert eine Sammlung eigener Einträge (JSON-Objekt).
func (a *App) SaveEntries(kind, data string) error {
	root, err := a.vaultRootOrErr()
	if err != nil {
		return err
	}
	return werkzeug.SaveEntries(root, kind, data)
}

// ── Links (#91) ─────────────────────────────────────────────────────────────

// GetLinks lädt vault/links/links.yaml und ergänzt neue mitgelieferte Links.
func (a *App) GetLinks() (*werkzeug.Links, error) {
	if a.vault == nil {
		return nil, fmt.Errorf("keine Vault initialisiert")
	}
	l, changed, err := werkzeug.LoadLinks(a.vault.RootPath)
	if err != nil {
		return nil, err
	}
	if changed {
		logging.Infof("Werkzeug", "Links abgeglichen (%d Links, Revision %d)", len(l.Links), l.Revision)
	}
	return l, nil
}

// SaveLinks speichert Bereiche und Links. Gelöschte mitgelieferte Links werden
// unter „entfernt“ vermerkt, damit sie beim nächsten Abgleich nicht zurückkommen.
func (a *App) SaveLinks(l *werkzeug.Links) error {
	if a.vault == nil {
		return fmt.Errorf("keine Vault initialisiert")
	}
	old, _, err := werkzeug.LoadLinks(a.vault.RootPath)
	if err == nil {
		now := map[string]bool{}
		for _, x := range l.Links {
			now[x.ID] = true
		}
		seed := werkzeug.DefaultLinkIDs()
		removed := map[string]bool{}
		for _, id := range l.Entfernt {
			removed[id] = true
		}
		for _, x := range old.Links {
			if !now[x.ID] && seed[x.ID] && !removed[x.ID] {
				l.Entfernt = append(l.Entfernt, x.ID)
			}
		}
		// Gelöschte mitgelieferte Bereiche ebenso vermerken (#96)
		nowB := map[string]bool{}
		for _, b := range l.Bereiche {
			nowB[b.ID] = true
		}
		seedB := werkzeug.DefaultBereichIDs()
		removedB := map[string]bool{}
		for _, id := range l.EntfernteBereiche {
			removedB[id] = true
		}
		for _, b := range old.Bereiche {
			if !nowB[b.ID] && seedB[b.ID] && !removedB[b.ID] {
				l.EntfernteBereiche = append(l.EntfernteBereiche, b.ID)
			}
		}
	}
	if err := werkzeug.SaveLinks(a.vault.RootPath, l); err != nil {
		return err
	}
	logging.Infof("Werkzeug", "Links gespeichert (%d)", len(l.Links))
	return nil
}

// ── Prüfsumme (#89) ─────────────────────────────────────────────────────────

// PickFileForHash öffnet einen Dateidialog ("" = abgebrochen).
func (a *App) PickFileForHash() (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "Datei für die Prüfsumme wählen"})
}

// HashFile berechnet SHA-256, SHA-1, SHA-512 und MD5 als Stream.
// Fortschritt per Event "hash:progress" {done,total}; Abbruch mit CancelHash.
func (a *App) HashFile(path string) (map[string]string, error) {
	ctx, cancel := context.WithCancel(a.ctx)
	a.wz.mu.Lock()
	if a.wz.hashCancel != nil {
		a.wz.hashCancel()
	}
	a.wz.hashCancel = cancel
	a.wz.mu.Unlock()
	defer cancel()
	var last time.Time
	res, err := hashing.File(ctx, path, nil, func(done, total int64) {
		if time.Since(last) > 200*time.Millisecond || done == total {
			last = time.Now()
			runtime.EventsEmit(a.ctx, "hash:progress", map[string]int64{"done": done, "total": total})
		}
	})
	if err != nil {
		return nil, err
	}
	logging.Infof("Werkzeug", "Prüfsumme berechnet: %s", filepath.Base(path))
	return res, nil
}

// CancelHash bricht eine laufende Prüfsummenberechnung ab.
func (a *App) CancelHash() {
	a.wz.mu.Lock()
	defer a.wz.mu.Unlock()
	if a.wz.hashCancel != nil {
		a.wz.hashCancel()
		a.wz.hashCancel = nil
	}
}

// ── Dokumente & Arbeitsprotokoll (#89) ─────────────────────────────────────

// ExportDocument erzeugt ein Kundendokument (Ratgeber, WLAN-Karte …) mit
// Branding als HTML, legt es in <Session>/exports ab (ohne Session im Vault
// unter exports/dokumente), öffnet es im Standardbrowser (dort drucken oder
// als PDF speichern) und vermerkt es optional im Arbeitsprotokoll.
func (a *App) ExportDocument(kind, title, bodyHTML string, card bool, workTitle, workDetail string) (string, error) {
	if a.vault == nil {
		return "", fmt.Errorf("keine Vault initialisiert")
	}
	if len(bodyHTML) > 4<<20 {
		return "", fmt.Errorf("Dokument zu groß")
	}
	dir := a.vault.DataPath("exports", "dokumente")
	if a.lastSessionPath != "" {
		dir = filepath.Join(a.lastSessionPath, "exports")
	}
	o := werkzeug.DocOptions{Title: title, BodyHTML: bodyHTML, Card: card, Customer: a.lastCustomer, LogoURI: a.readLogoBase64()}
	if a.cfg != nil {
		o.Company, o.Technician = a.cfg.Branding.CompanyName, a.cfg.Branding.TechnicianName
	}
	path, err := werkzeug.WriteDocument(dir, kind, o, time.Now())
	if err != nil {
		return "", err
	}
	logging.Infof("Werkzeug", "Dokument erzeugt: %s", path)
	if workTitle != "" {
		if err := werkzeug.AppendWork(a.lastSessionPath, werkzeug.WorkItem{Time: time.Now(), Title: workTitle, Detail: workDetail, File: filepath.Base(path)}); err != nil {
			logging.Warnf("Werkzeug", "Arbeitsprotokoll: %v", err)
		}
	}
	if err := openFilePlatform(path); err != nil {
		logging.Warnf("Werkzeug", "Dokument konnte nicht geöffnet werden: %v", err)
	}
	return path, nil
}

// RecordWork vermerkt eine Arbeit im Session-Bericht („Durchgeführte Arbeiten“).
func (a *App) RecordWork(title, detail string) error {
	if a.lastSessionPath == "" {
		return fmt.Errorf("keine aktive Session – bitte zuerst eine Session anlegen")
	}
	return werkzeug.AppendWork(a.lastSessionPath, werkzeug.WorkItem{Time: time.Now(), Title: title, Detail: detail})
}

// SessionTiming liefert Beginn und bisherige Dauer der aktuellen Session.
type SessionTiming struct {
	Active   bool      `json:"active"`
	Start    time.Time `json:"start"`
	Minutes  int       `json:"minutes"`
	Customer string    `json:"customer"`
}

// GetSessionTiming liefert die Einsatzzeit der aktuellen Session (für AE).
func (a *App) GetSessionTiming() SessionTiming {
	if a.lastSessionPath == "" || a.sessionStart.IsZero() {
		return SessionTiming{}
	}
	return SessionTiming{Active: true, Start: a.sessionStart, Minutes: int(time.Since(a.sessionStart).Minutes()), Customer: a.lastCustomer}
}

// ── Dateien (#89) ───────────────────────────────────────────────────────────

// OpenTextFileDialog lässt eine Textdatei wählen (z. B. .eml) und liefert Name und Inhalt.
func (a *App) OpenTextFileDialog(title, pattern string) (map[string]string, error) {
	opts := runtime.OpenDialogOptions{Title: title}
	if pattern != "" {
		opts.Filters = []runtime.FileFilter{{DisplayName: pattern, Pattern: pattern}, {DisplayName: "Alle Dateien", Pattern: "*"}}
	}
	p, err := runtime.OpenFileDialog(a.ctx, opts)
	if err != nil || p == "" {
		return nil, err
	}
	st, err := os.Stat(p)
	if err != nil {
		return nil, err
	}
	if st.Size() > 10<<20 {
		return nil, fmt.Errorf("Datei größer als 10 MB")
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return nil, err
	}
	return map[string]string{"name": filepath.Base(p), "content": string(b)}, nil
}

// SaveDataURL speichert ein data:-URI (z. B. PNG der WLAN-Karte) über einen Speichern-Dialog.
func (a *App) SaveDataURL(defaultName, dataURL string) (string, error) {
	i := strings.Index(dataURL, ";base64,")
	if !strings.HasPrefix(dataURL, "data:") || i < 0 {
		return "", fmt.Errorf("ungültige Daten")
	}
	data, err := base64.StdEncoding.DecodeString(dataURL[i+8:])
	if err != nil {
		return "", err
	}
	p, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: "Speichern", DefaultFilename: defaultName})
	if err != nil || p == "" {
		return "", err
	}
	return p, os.WriteFile(p, data, 0644)
}

// ── Netz & Sicherheit (#90) ─────────────────────────────────────────────────

func (a *App) requireOnline(area string) error {
	if a.cfg != nil && !a.cfg.Online.Allowed(area) {
		names := map[string]string{"dns": "DNS- & Mail-Check", "link_services": "Link-Dienste"}
		return fmt.Errorf("%s ist in den Einstellungen (Online-Funktionen) abgeschaltet", names[area])
	}
	return nil
}

// DNSQuery fragt einen DNS-Eintrag ab. server: "" / "system" oder IP-Adresse.
// Antwort im DoH-JSON-Format (wie Google/Cloudflare).
func (a *App) DNSQuery(name, rrtype, server string) (*netcheck.DoHResponse, error) {
	if err := a.requireOnline("dns"); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	return netcheck.Query(ctx, name, rrtype, server)
}

// ResolverChoice ist ein auswählbarer DNS-Server.
type ResolverChoice struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

// GetResolverChoices liefert System-Resolver, Router/Kunden-DNS (aus dem
// letzten Netzwerk-Scan) und öffentliche Resolver.
func (a *App) GetResolverChoices() []ResolverChoice {
	out := []ResolverChoice{{"System (wie dieses Gerät)", "system"}}
	seen := map[string]bool{}
	if a.lastNetworkScan != nil {
		for _, ad := range a.lastNetworkScan.Adapters {
			if !ad.IsConnected {
				continue
			}
			for _, d := range ad.DNSServers {
				if net.ParseIP(d) != nil && !seen[d] {
					seen[d] = true
					out = append(out, ResolverChoice{"Kunden-DNS " + d + " (" + ad.Name + ")", d})
				}
			}
			if g := ad.Gateway; net.ParseIP(g) != nil && !seen[g] {
				seen[g] = true
				out = append(out, ResolverChoice{"Router " + g, g})
			}
		}
	}
	return append(out,
		ResolverChoice{"Cloudflare 1.1.1.1", "1.1.1.1"},
		ResolverChoice{"Google 8.8.8.8", "8.8.8.8"},
		ResolverChoice{"Quad9 9.9.9.9", "9.9.9.9"})
}

// SMTPProbe testet die Verbindung zu einem Mailserver (Banner, STARTTLS,
// Zertifikat). Es wird keine Mail gesendet.
func (a *App) SMTPProbe(host string, port int) (*netcheck.SMTPResult, error) {
	if err := a.requireOnline("dns"); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 30*time.Second)
	defer cancel()
	r := netcheck.SMTPProbe(ctx, host, port)
	logging.Infof("Werkzeug", "SMTP-Test %s:%d → verbunden=%v tls=%v", host, port, r.Connected, r.TLS)
	return r, nil
}

// CertCheck liest und prüft das TLS-Zertifikat von host:port (#108, nur lesend).
// mode: auto (nach Port), tls, smtp, imap, pop3.
func (a *App) CertCheck(host string, port int, mode string) (*netcheck.CertResult, error) {
	if !netcheck.IsLocalTarget(host) {
		if err := a.requireOnline("dns"); err != nil {
			return nil, err
		}
	}
	ctx, cancel := context.WithTimeout(a.ctx, 20*time.Second)
	defer cancel()
	r := netcheck.CheckCert(ctx, host, port, mode)
	logging.Infof("Werkzeug", "Zertifikat %s:%d → vertraut=%v name=%v Tage=%d %s", host, port, r.Trusted, r.HostnameOK, r.DaysLeft, r.Error)
	return r, nil
}

// PortCheck prüft bis zu 10 Ports eines Hosts (#108, nur TCP-Verbindungsaufbau).
func (a *App) PortCheck(host string, ports []int) ([]netcheck.PortResult, error) {
	if !netcheck.IsLocalTarget(host) {
		if err := a.requireOnline("dns"); err != nil {
			return nil, err
		}
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	r, err := netcheck.CheckPorts(ctx, host, ports)
	if err == nil {
		logging.Infof("Werkzeug", "Port-Test %s %v", host, ports)
	}
	return r, err
}

// WakeOnLAN sendet ein Magic Packet (#116). Bestätigung erfolgt im Frontend.
func (a *App) WakeOnLAN(mac, broadcast string, port int) error {
	if err := netcheck.SendWOL(mac, broadcast, port); err != nil {
		return err
	}
	logging.Infof("Werkzeug", "Wake-on-LAN an %s (%s:%d)", mac, broadcast, port)
	return nil
}

// ARPTable liefert die bekannten Geräte im lokalen Netz (IP + MAC, #109).
func (a *App) ARPTable() ([]netcheck.Neighbor, error) {
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	return netcheck.ARPTable(ctx)
}

// ProbeDevice fragt ein Gerät im lokalen Netz nach Namen, Modell und Diensten ab (#109, nur lesend).
func (a *App) ProbeDevice(ip string) (*netcheck.DeviceProbe, error) {
	ctx, cancel := context.WithTimeout(a.ctx, 10*time.Second)
	defer cancel()
	r, err := netcheck.ProbeDevice(ctx, ip)
	if err == nil {
		logging.Infof("Werkzeug", "Geräteabfrage %s: %d Namen, Ports %v", ip, len(r.Names), r.OpenPorts)
	}
	return r, err
}

// OpenCommandTarget öffnet eine Einstellungsseite, Konsole oder App aus dem
// Befehle-Starter (#110). Nur Ziele aus der erlaubten Liste (cmdrun.ValidOpen).
func (a *App) OpenCommandTarget(target string, args []string) error {
	if err := cmdrun.Open(target, args); err != nil {
		return err
	}
	logging.Infof("Werkzeug", "Geöffnet: %s %v", target, args)
	return nil
}

// RunCommand führt einen Befehl aus dem Befehle-Starter aus (#110). Verändernde
// Befehle bestätigt der Nutzer vorher im Frontend (Dialog mit Auswirkungen).
func (a *App) RunCommand(req cmdrun.Request) *cmdrun.Result {
	logging.Infof("Werkzeug", "Befehl (%s, admin=%v): %s", req.Shell, req.Admin, req.Command)
	r := cmdrun.Run(a.ctx, req)
	logging.Infof("Werkzeug", "Befehl beendet: Exit %d, %d ms, Zeitlimit=%v %s", r.ExitCode, r.Millis, r.TimedOut, r.Error)
	return r
}

// IsElevated meldet, ob AdminKit mit Administratorrechten läuft.
func (a *App) IsElevated() bool { return cmdrun.Elevated() }

// RDAPLookup ermittelt Registrierung und Alter einer Domain.
func (a *App) RDAPLookup(domain string) (*netcheck.RDAPResult, error) {
	if err := a.requireOnline("link_services"); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 20*time.Second)
	defer cancel()
	cache := ""
	if a.vault != nil {
		cache = a.vault.DataPath("werkzeug", "cache")
	}
	return netcheck.RDAPLookup(ctx, domain, cache)
}

// LinkPreview holt Titel, Beschreibung und Endadresse über microlink.io –
// AdminKit selbst ruft den Link nicht auf.
func (a *App) LinkPreview(rawURL string) (*netcheck.Preview, error) {
	if err := a.requireOnline("link_services"); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 25*time.Second)
	defer cancel()
	return netcheck.LinkPreview(ctx, rawURL)
}

// URLScanSearch sucht frühere Scans einer Domain bei urlscan.io (API-Key nötig).
func (a *App) URLScanSearch(domain string) ([]netcheck.URLScanHit, error) {
	if err := a.requireOnline("link_services"); err != nil {
		return nil, err
	}
	key := ""
	if a.cfg != nil {
		key = a.cfg.APIKeys.URLScan
	}
	ctx, cancel := context.WithTimeout(a.ctx, 20*time.Second)
	defer cancel()
	return netcheck.URLScanSearch(ctx, domain, key)
}

// SaveSessionNote legt ein Markdown-Protokoll in der Session ab
// (z. B. network/maildomain_<domain>.md) und vermerkt es im Bericht.
func (a *App) SaveSessionNote(folder, name, markdown, workTitle string) (string, error) {
	if a.lastSessionPath == "" {
		return "", fmt.Errorf("keine aktive Session – bitte zuerst eine Session anlegen")
	}
	switch folder {
	case "network", "security", "software", "werkzeug":
	default:
		return "", fmt.Errorf("unbekannter Ordner %q", folder)
	}
	safe := strings.Trim(regexp.MustCompile(`[^A-Za-z0-9._-]+`).ReplaceAllString(name, "_"), "._")
	if safe == "" || len(markdown) > 1<<20 {
		return "", fmt.Errorf("ungültiger Name oder Inhalt zu groß")
	}
	p := filepath.Join(a.lastSessionPath, folder, safe+".md")
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return "", err
	}
	if err := os.WriteFile(p, []byte(markdown), 0644); err != nil {
		return "", err
	}
	if workTitle != "" {
		_ = werkzeug.AppendWork(a.lastSessionPath, werkzeug.WorkItem{Time: time.Now(), Title: workTitle, Detail: name, File: filepath.Base(p)})
	}
	return p, nil
}

// ── Wiki (#92) ──────────────────────────────────────────────────────────────

// ListWikiArticles gleicht die Startartikel ab und listet alle Artikel.
func (a *App) ListWikiArticles() ([]werkzeug.ArticleMeta, error) {
	if a.vault == nil {
		return nil, fmt.Errorf("keine Vault initialisiert")
	}
	if n, err := werkzeug.SyncWikiSeeds(a.vault.RootPath); err != nil {
		logging.Warnf("Werkzeug", "Wiki-Startartikel: %v", err)
	} else if n > 0 {
		logging.Infof("Werkzeug", "%d Wiki-Startartikel angelegt/aktualisiert", n)
	}
	return werkzeug.ListArticles(a.vault.RootPath)
}

// GetWikiArticle liest einen Artikel samt Bildern.
func (a *App) GetWikiArticle(slug string) (*werkzeug.Article, error) {
	if a.vault == nil {
		return nil, fmt.Errorf("keine Vault initialisiert")
	}
	return werkzeug.GetArticle(a.vault.RootPath, slug)
}

// SaveWikiArticle speichert einen Artikel (leerer Slug = neu) und liefert den Slug.
func (a *App) SaveWikiArticle(art *werkzeug.Article) (string, error) {
	if a.vault == nil {
		return "", fmt.Errorf("keine Vault initialisiert")
	}
	autor := ""
	if a.cfg != nil {
		autor = a.cfg.Branding.TechnicianName
	}
	slug, err := werkzeug.SaveArticle(a.vault.RootPath, art, autor)
	if err == nil {
		logging.Infof("Werkzeug", "Wiki-Artikel gespeichert: %s", slug)
	}
	return slug, err
}

// DeleteWikiArticle löscht einen Artikel samt Bildern (Bestätigung im Frontend).
func (a *App) DeleteWikiArticle(slug string) error {
	if a.vault == nil {
		return fmt.Errorf("keine Vault initialisiert")
	}
	if err := werkzeug.DeleteArticle(a.vault.RootPath, slug); err != nil {
		return err
	}
	logging.Infof("Werkzeug", "Wiki-Artikel gelöscht: %s", slug)
	return nil
}

// SaveWikiImage legt ein Bild (data:-URI) für einen Artikel ab → relativer Pfad.
func (a *App) SaveWikiImage(slug, name, dataURL string) (string, error) {
	if a.vault == nil {
		return "", fmt.Errorf("keine Vault initialisiert")
	}
	return werkzeug.SaveImage(a.vault.RootPath, slug, name, dataURL)
}

// ── Wiki-Medien (#117) ──────────────────────────────────────────────────────

func (a *App) wikiUploads() *werkzeug.Uploads {
	a.wz.uploadsOnce.Do(func() { a.wz.uploads = werkzeug.NewUploads() })
	return a.wz.uploads
}

// WikiMediaBegin startet das Hochladen einer Mediendatei in Stücken.
func (a *App) WikiMediaBegin(slug, name string) (string, error) {
	root, err := a.vaultRootOrErr()
	if err != nil {
		return "", err
	}
	return a.wikiUploads().Begin(root, slug, name)
}

// WikiMediaChunk hängt ein Base64-Stück an (max. einige MB je Aufruf).
func (a *App) WikiMediaChunk(id, b64 string) error { return a.wikiUploads().Chunk(id, b64) }

// WikiMediaEnd schließt das Hochladen ab und liefert den Pfad für das Markdown.
func (a *App) WikiMediaEnd(id string) (string, error) {
	rel, err := a.wikiUploads().End(id)
	if err == nil {
		logging.Infof("Werkzeug", "Wiki-Medium gespeichert: %s", rel)
	}
	return rel, err
}

// WikiMediaAbort verwirft ein begonnenes Hochladen.
func (a *App) WikiMediaAbort(id string) { a.wikiUploads().Abort(id) }

// PickWikiMedia wählt eine Datei per Dialog und legt sie beim Artikel ab.
func (a *App) PickWikiMedia(slug string) (string, error) {
	root, err := a.vaultRootOrErr()
	if err != nil {
		return "", err
	}
	p, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "Datei einfügen", Filters: []runtime.FileFilter{
		{DisplayName: "Medien und Anhänge", Pattern: "*.mp4;*.m4v;*.webm;*.mov;*.mp3;*.m4a;*.ogg;*.opus;*.wav;*.gif;*.png;*.jpg;*.jpeg;*.webp;*.pdf;*.txt;*.log;*.zip"},
	}})
	if err != nil || p == "" {
		return "", err
	}
	return werkzeug.ImportMedia(root, slug, p)
}

// OpenWikiMedia öffnet einen Anhang (z. B. PDF) mit dem Standardprogramm.
func (a *App) OpenWikiMedia(rel string) error {
	root, err := a.vaultRootOrErr()
	if err != nil {
		return err
	}
	p, ok := werkzeug.ResolveMedia(root, rel)
	if !ok {
		return fmt.Errorf("ungültiger Pfad")
	}
	return openFilePlatform(p)
}

// WikiMediaRoot liefert den Vault-Pfad für den Medien-Handler ("" ohne Vault).
func (a *App) wikiMediaRoot() string {
	if a.vault == nil {
		return ""
	}
	return a.vault.RootPath
}

// ── Bildschirmaufnahme (#121) ───────────────────────────────────────────────

// CaptureScreenshot blendet AdminKit kurz aus und nimmt den Bildschirm auf (PNG als data:-URI).
// mode "interactive" (nur macOS): Bereich oder Fenster selbst wählen.
func (a *App) CaptureScreenshot(mode string, delay int) (string, error) {
	runtime.WindowHide(a.ctx)
	defer runtime.WindowShow(a.ctx)
	time.Sleep(450 * time.Millisecond) // Fenster ausblenden lassen
	ctx, cancel := context.WithTimeout(a.ctx, 6*time.Minute)
	defer cancel()
	d, err := capture.Screenshot(ctx, mode, delay)
	if err == nil {
		logging.Infof("Werkzeug", "Bildschirmfoto aufgenommen (%s)", mode)
	}
	return d, err
}

// CaptureCapabilities: was auf diesem System möglich ist.
func (a *App) CaptureCapabilities() map[string]bool {
	root := ""
	if a.vault != nil {
		root = a.vault.RootPath
	}
	return map[string]bool{"interactive": goruntime.GOOS == "darwin", "native_video": capture.NativeVideo(), "ffmpeg": capture.FindFFmpeg(root) != ""}
}

// RecordStart startet eine Videoaufnahme über das System (macOS).
func (a *App) RecordStart(mic, clicks bool) error { return a.wz.recorder.Start(mic, clicks) }

// RecordStop beendet die Aufnahme und legt das Video beim Wiki-Artikel ab (→ relativer Pfad).
func (a *App) RecordStop(slug string) (string, error) {
	file, err := a.wz.recorder.Stop()
	if err != nil {
		return "", err
	}
	defer os.Remove(file)
	root, err := a.vaultRootOrErr()
	if err != nil {
		return "", err
	}
	return werkzeug.ImportMedia(root, slug, file)
}

// MediaToGIF erzeugt aus einem Wiki-Video ein GIF (FFmpeg nötig) → relativer Pfad.
func (a *App) MediaToGIF(rel string, start, end float64) (string, error) {
	root, err := a.vaultRootOrErr()
	if err != nil {
		return "", err
	}
	ff := capture.FindFFmpeg(root)
	if ff == "" {
		return "", fmt.Errorf("FFmpeg nicht gefunden (PATH oder Vault-Ordner tools/ffmpeg)")
	}
	src, ok := werkzeug.ResolveMedia(root, rel)
	if !ok {
		return "", fmt.Errorf("ungültiger Pfad")
	}
	tmp := filepath.Join(os.TempDir(), fmt.Sprintf("adminkit-%d.gif", time.Now().UnixNano()))
	defer os.Remove(tmp)
	ctx, cancel := context.WithTimeout(a.ctx, 10*time.Minute)
	defer cancel()
	if err := capture.ToGIF(ctx, ff, src, tmp, start, end, 10); err != nil {
		return "", err
	}
	slug := strings.Split(strings.TrimPrefix(rel, "_medien/"), "/")[0]
	return werkzeug.ImportMedia(root, slug, tmp)
}

// ── Hardwaretest (#92) ──────────────────────────────────────────────────────

// OpenSystemApp öffnet Kamera-App bzw. Ton-Einstellungen – Ausweg, falls die
// WebView keinen Zugriff auf Kamera/Mikrofon bekommt. kind: "camera" | "sound".
func (a *App) OpenSystemApp(kind string) error {
	var name string
	var args []string
	switch goruntime.GOOS + "/" + kind {
	case "darwin/camera":
		name, args = "open", []string{"-a", "Photo Booth"}
	case "darwin/sound":
		name, args = "open", []string{"x-apple.systempreferences:com.apple.Sound-Settings.extension"}
	case "windows/camera":
		name, args = "explorer.exe", []string{"microsoft.windows.camera:"}
	case "windows/sound":
		name, args = "explorer.exe", []string{"ms-settings:sound"}
	default:
		return fmt.Errorf("auf diesem System nicht verfügbar")
	}
	_, err := execx.Run(a.ctx, execx.Options{Timeout: 15 * time.Second}, name, args...)
	return err
}
