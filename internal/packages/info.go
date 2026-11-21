package packages

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"adminkit/internal/execx"

	"gopkg.in/yaml.v3"
)

// Info sind die Detailinformationen zu einem Paket („Wofür ist das, welches nehme ich?“).
type Info struct {
	Package
	Description     string       `json:"description"`      // Kurzbeschreibung
	LongDescription string       `json:"long_description"` // ausführlich
	DescLang        string       `json:"desc_lang"`        // "de" | "en" | …
	Publisher       string       `json:"publisher"`
	PublisherURL    string       `json:"publisher_url"`
	Homepage        string       `json:"homepage"`
	License         string       `json:"license"`
	LicenseURL      string       `json:"license_url"`
	Tags            []string     `json:"tags"`
	InstallNotes    string       `json:"install_notes"`
	InstallerTypes  []string     `json:"installer_types"` // verständlich übersetzt
	Scopes          []string     `json:"scopes"`
	Archs           []string     `json:"archs"`
	NeedsAdmin      bool         `json:"needs_admin"`
	SHA256          []string     `json:"sha256"`
	Deprecated      bool         `json:"deprecated"`
	Disabled        bool         `json:"disabled"`
	ManifestURL     string       `json:"manifest_url"`
	GitHub          *GitHubStats `json:"github,omitempty"`
	Note            *Note        `json:"note,omitempty"`
	Hints           []Hint       `json:"hints"`
	FromCache       bool         `json:"from_cache"`
	FetchedAt       time.Time    `json:"fetched_at"`
	// Partial: nur Teilinformationen (z. B. Fallback über winget show).
	Partial bool `json:"partial"`
}

// GitHubStats beschreibt das Quellcode-Projekt eines Pakets.
type GitHubStats struct {
	URL      string    `json:"url"`
	Stars    int       `json:"stars"`
	PushedAt time.Time `json:"pushed_at"`
	Archived bool      `json:"archived"`
	License  string    `json:"license"`
}

// InfoOptions steuert den Abruf.
type InfoOptions struct {
	Online      bool // Internet erlaubt (online.packages)
	GitHubStats bool // GitHub-API erlaubt (online.github_stats)
	GitHubToken string
	CacheDir    string // vault/packages/cache ("" = kein Cache)
	CacheDays   int
	Known       []string // weitere IDs für Varianten-Hinweise
	Notes       *Notes
}

var wingetTypeLabels = map[string]string{
	"msi": "MSI-Installer", "wix": "MSI-Installer (WiX)", "exe": "Setup-Programm (EXE)",
	"nullsoft": "Setup-Programm (NSIS)", "inno": "Setup-Programm (Inno Setup)", "burn": "Setup-Programm (WiX Burn)",
	"msix": "MSIX-App", "appx": "App-Paket", "zip": "ZIP-Archiv", "portable": "Portables Programm, ohne Installation", "pwa": "Web-App",
}

var scopeLabels = map[string]string{"machine": "für alle Benutzer", "user": "nur für den aktuellen Benutzer"}

var httpClient = &http.Client{Timeout: 20 * time.Second}

// httpGet ist austauschbar für Tests.
var httpGet = func(ctx context.Context, u string, header map[string]string) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", "AdminKit")
	for k, v := range header {
		req.Header.Set(k, v)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	return body, resp.StatusCode, err
}

// ── Cache ───────────────────────────────────────────────────────────────────

var reUnsafeFile = regexp.MustCompile(`[^A-Za-z0-9._+@-]`)

func cachePath(dir string, src Source, id string) string {
	return filepath.Join(dir, string(managerOf(src))+"_"+reUnsafeFile.ReplaceAllString(id, "_")+".json")
}

func managerOf(src Source) string {
	if src == SourceBrew || src == SourceBrewCask || src == SourceMAS {
		return "brew"
	}
	return "winget"
}

func readCache(opt InfoOptions, src Source, id string, allowStale bool) *Info {
	if opt.CacheDir == "" {
		return nil
	}
	data, err := os.ReadFile(cachePath(opt.CacheDir, src, id))
	if err != nil {
		return nil
	}
	var info Info
	if json.Unmarshal(data, &info) != nil {
		return nil
	}
	days := opt.CacheDays
	if days <= 0 {
		days = 30
	}
	if !allowStale && time.Since(info.FetchedAt) > time.Duration(days)*24*time.Hour {
		return nil
	}
	info.FromCache = true
	return &info
}

func writeCache(opt InfoOptions, info *Info) {
	if opt.CacheDir == "" || info == nil || info.Partial {
		return
	}
	if err := os.MkdirAll(opt.CacheDir, 0755); err != nil {
		return
	}
	cp := *info
	cp.FromCache = false
	cp.Note, cp.Hints = nil, nil // werden bei jeder Anzeige neu berechnet
	data, err := json.MarshalIndent(cp, "", "  ")
	if err == nil {
		_ = os.WriteFile(cachePath(opt.CacheDir, info.Source, info.ID), data, 0644)
	}
}

// ── Abruf ───────────────────────────────────────────────────────────────────

// GetInfo liefert Infos zu einem Paket: zuerst aus dem Cache, dann online
// (winget-Manifest auf GitHub) bzw. lokal (brew info). Hinweise und Notizen
// werden immer frisch berechnet.
func GetInfo(ctx context.Context, m Manager, p Package, opt InfoOptions) (*Info, error) {
	if p.Source == "" {
		if m.Name() == "brew" {
			p.Source = SourceBrew
		} else {
			p.Source = SourceWinget
		}
	}
	var info *Info
	var err error
	if c := readCache(opt, p.Source, p.ID, false); c != nil {
		info = c
	} else {
		switch {
		case p.Source == SourceBrew || p.Source == SourceBrewCask:
			b, ok := m.(*Brew)
			if !ok {
				return nil, fmt.Errorf("Homebrew-Infos gibt es nur auf dem Mac")
			}
			info, err = b.info(ctx, p)
		case opt.Online:
			info, err = wingetManifestInfo(ctx, p)
			if err != nil {
				if w, ok := m.(*Winget); ok && w.path != "" {
					if alt, err2 := w.show(ctx, p); err2 == nil {
						info, err = alt, nil
					}
				}
			}
		default:
			if c := readCache(opt, p.Source, p.ID, true); c != nil {
				info = c
			} else {
				err = fmt.Errorf("keine gespeicherten Infos – zum Laden werden die Online-Funktionen benötigt")
			}
		}
		if err != nil {
			// Abgelaufener Cache ist besser als nichts
			if c := readCache(opt, p.Source, p.ID, true); c != nil {
				info, err = c, nil
			} else {
				return nil, err
			}
		}
		if !info.FromCache && opt.Online && opt.GitHubStats && info.GitHub == nil {
			info.GitHub = fetchGitHubStats(ctx, opt.GitHubToken, info.Homepage, info.PublisherURL, info.LicenseURL)
		}
		if !info.FromCache {
			info.FetchedAt = time.Now()
			writeCache(opt, info)
		}
	}
	info.Note = opt.Notes.For(info.Source, info.ID)
	info.Hints = BuildHints(HintInput{
		ID: info.ID, Name: info.Name, Tags: info.Tags, Source: info.Source, Known: opt.Known,
		GitHub: info.GitHub, HasNote: info.Note != nil, Deprecated: info.Deprecated, Disabled: info.Disabled,
		NoChecksum: (info.Source == SourceBrewCask && len(info.SHA256) == 0 && !info.Partial),
	})
	if info.Note != nil && info.Note.SuggestPin {
		info.Hints = append(info.Hints, Hint{"info", "Pin empfohlen",
			"Diese Software wird meist zentral verwaltet. Mit „🔒“ von „Alle aktualisieren“ ausnehmen."})
	}
	return info, nil
}

// ── winget-Manifest ─────────────────────────────────────────────────────────

const wingetRawBase = "https://raw.githubusercontent.com/microsoft/winget-pkgs/master/manifests/"
const wingetAPIBase = "https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests/"

// manifestDir liefert z. B. "m/Mozilla/Firefox/de" für Mozilla.Firefox.de.
func manifestDir(id string) string {
	return strings.ToLower(id[:1]) + "/" + strings.ReplaceAll(id, ".", "/")
}

// ManifestWebURL ist die Seite mit den Paketdateien auf GitHub.
func ManifestWebURL(id string) string {
	return "https://github.com/microsoft/winget-pkgs/tree/master/manifests/" + manifestDir(id)
}

func wingetManifestInfo(ctx context.Context, p Package) (*Info, error) {
	if err := ValidateID("winget", p.ID); err != nil {
		return nil, err
	}
	version := p.Available
	if version == "" || strings.Contains(version, "…") {
		version = p.Version
	}
	files, err := fetchManifestFiles(ctx, p.ID, version)
	if err != nil {
		// Version unbekannt oder gekürzt → neueste Version über die GitHub-API ermitteln
		latest, lerr := latestManifestVersion(ctx, p.ID)
		if lerr != nil {
			return nil, err
		}
		files, err = fetchManifestFiles(ctx, p.ID, latest)
		if err != nil {
			return nil, err
		}
		version = latest
	}
	info := parseManifests(p, files)
	info.Version = version
	if p.Version != "" {
		info.Version = p.Version
	}
	info.Available = p.Available
	info.ManifestURL = ManifestWebURL(p.ID)
	return info, nil
}

// manifestFiles enthält die rohen YAML-Texte eines Paketstands.
type manifestFiles struct {
	Version   string // <ID>.yaml (bzw. Singleton)
	Locale    string // Standard-Locale
	LocaleDE  string // optional de-DE
	Installer string
	Singleton bool
}

func fetchManifestFiles(ctx context.Context, id, version string) (*manifestFiles, error) {
	if version == "" {
		return nil, fmt.Errorf("Version unbekannt")
	}
	base := wingetRawBase + manifestDir(id) + "/" + url.PathEscape(version) + "/"
	get := func(name string) (string, error) {
		body, code, err := httpGet(ctx, base+url.PathEscape(name), nil)
		if err != nil {
			return "", err
		}
		if code != 200 {
			return "", fmt.Errorf("HTTP %d für %s", code, name)
		}
		return string(body), nil
	}
	vt, err := get(id + ".yaml")
	if err != nil {
		return nil, err
	}
	var head struct {
		ManifestType  string `yaml:"ManifestType"`
		DefaultLocale string `yaml:"DefaultLocale"`
	}
	_ = yaml.Unmarshal([]byte(vt), &head)
	f := &manifestFiles{Version: vt}
	if head.ManifestType == "singleton" {
		f.Singleton = true
		f.Locale, f.Installer = vt, vt
		return f, nil
	}
	loc := head.DefaultLocale
	if loc == "" {
		loc = "en-US"
	}
	if f.Locale, err = get(id + ".locale." + loc + ".yaml"); err != nil {
		return nil, err
	}
	if loc != "de-DE" {
		f.LocaleDE, _ = get(id + ".locale.de-DE.yaml")
	}
	f.Installer, _ = get(id + ".installer.yaml")
	return f, nil
}

// latestManifestVersion listet die Versionsordner über die GitHub-API.
func latestManifestVersion(ctx context.Context, id string) (string, error) {
	body, code, err := httpGet(ctx, wingetAPIBase+manifestDir(id), map[string]string{"Accept": "application/vnd.github+json"})
	if err != nil {
		return "", err
	}
	if code != 200 {
		return "", fmt.Errorf("GitHub-API: HTTP %d", code)
	}
	var entries []struct {
		Name string `json:"name"`
		Type string `json:"type"`
	}
	if err := json.Unmarshal(body, &entries); err != nil {
		return "", err
	}
	var versions []string
	for _, e := range entries {
		// Unterordner wie "Firefox/de" (weitere ID-Ebene) beginnen nicht mit einer Ziffer
		if e.Type == "dir" && e.Name != "" && e.Name[0] >= '0' && e.Name[0] <= '9' {
			versions = append(versions, e.Name)
		}
	}
	if len(versions) == 0 {
		return "", fmt.Errorf("keine Versionen gefunden")
	}
	sort.Slice(versions, func(i, j int) bool { return !versionAtLeast(versions[i], versions[j]) })
	return versions[len(versions)-1], nil
}

type localeManifest struct {
	PackageLocale     string   `yaml:"PackageLocale"`
	Publisher         string   `yaml:"Publisher"`
	PublisherURL      string   `yaml:"PublisherUrl"`
	PackageName       string   `yaml:"PackageName"`
	PackageURL        string   `yaml:"PackageUrl"`
	License           string   `yaml:"License"`
	LicenseURL        string   `yaml:"LicenseUrl"`
	ShortDescription  string   `yaml:"ShortDescription"`
	Description       string   `yaml:"Description"`
	Tags              []string `yaml:"Tags"`
	InstallationNotes string   `yaml:"InstallationNotes"`
}

type installerEntry struct {
	Architecture         string `yaml:"Architecture"`
	InstallerType        string `yaml:"InstallerType"`
	Scope                string `yaml:"Scope"`
	InstallerSha256      string `yaml:"InstallerSha256"`
	ElevationRequirement string `yaml:"ElevationRequirement"`
}

type installerManifest struct {
	installerEntry `yaml:",inline"`
	Installers     []installerEntry `yaml:"Installers"`
}

// parseManifests wertet die YAML-Dateien aus (rein, ohne Netz → testbar).
func parseManifests(p Package, f *manifestFiles) *Info {
	info := &Info{Package: p}
	var loc, de localeManifest
	_ = yaml.Unmarshal([]byte(f.Locale), &loc)
	if f.LocaleDE != "" {
		_ = yaml.Unmarshal([]byte(f.LocaleDE), &de)
	}
	pick := func(a, b string) string {
		if strings.TrimSpace(a) != "" {
			return strings.TrimSpace(a)
		}
		return strings.TrimSpace(b)
	}
	info.Description = pick(de.ShortDescription, loc.ShortDescription)
	info.LongDescription = pick(de.Description, loc.Description)
	info.DescLang = "en"
	if de.ShortDescription != "" || strings.HasPrefix(loc.PackageLocale, "de") {
		info.DescLang = "de"
	}
	if info.Name == "" || strings.Contains(info.Name, "…") {
		info.Name = pick(loc.PackageName, p.ID)
	}
	info.Publisher = loc.Publisher
	info.PublisherURL = loc.PublisherURL
	info.Homepage = loc.PackageURL
	info.License = pick(de.License, loc.License)
	info.LicenseURL = loc.LicenseURL
	info.Tags = loc.Tags
	if len(de.Tags) > 0 {
		info.Tags = de.Tags
	}
	info.InstallNotes = pick(de.InstallationNotes, loc.InstallationNotes)

	var im installerManifest
	_ = yaml.Unmarshal([]byte(f.Installer), &im)
	types, scopes, archs, hashes := set{}, set{}, set{}, set{}
	add := func(e installerEntry) {
		t := strings.ToLower(e.InstallerType)
		if t == "" {
			t = strings.ToLower(im.InstallerType)
		}
		if t != "" {
			if l, ok := wingetTypeLabels[t]; ok {
				types.add(l)
			} else {
				types.add(t)
			}
		}
		sc := e.Scope
		if sc == "" {
			sc = im.Scope
		}
		if sc != "" {
			if l, ok := scopeLabels[sc]; ok {
				scopes.add(l)
			} else {
				scopes.add(sc)
			}
		}
		archs.add(e.Architecture)
		hashes.add(strings.ToLower(e.InstallerSha256))
		el := e.ElevationRequirement
		if el == "" {
			el = im.ElevationRequirement
		}
		if strings.Contains(strings.ToLower(el), "elevat") {
			info.NeedsAdmin = true
		}
	}
	for _, e := range im.Installers {
		add(e)
	}
	if len(im.Installers) == 0 && im.InstallerType != "" {
		add(im.installerEntry)
	}
	info.InstallerTypes, info.Scopes, info.Archs, info.SHA256 = types.list(), scopes.list(), archs.list(), hashes.list()
	return info
}

type set struct {
	order []string
	seen  map[string]bool
}

func (s *set) add(v string) {
	v = strings.TrimSpace(v)
	if v == "" {
		return
	}
	if s.seen == nil {
		s.seen = map[string]bool{}
	}
	if !s.seen[v] {
		s.seen[v] = true
		s.order = append(s.order, v)
	}
}
func (s *set) list() []string { return s.order }

// ── winget show (Fallback) ──────────────────────────────────────────────────

var showKeys = map[string]string{
	"publisher": "publisher", "herausgeber": "publisher",
	"description": "description", "beschreibung": "description",
	"homepage": "homepage", "startseite": "homepage",
	"license": "license", "lizenz": "license",
	"installer type": "type", "installertyp": "type", "installer-typ": "type",
	"installer sha256": "sha256", "installer-sha256": "sha256",
}

func (w *Winget) show(ctx context.Context, p Package) (*Info, error) {
	if err := ValidateID("winget", p.ID); err != nil {
		return nil, err
	}
	res, err := execx.Run(ctx, execx.Options{Timeout: time.Minute}, w.path,
		"show", "--id", p.ID, "-e", "--accept-source-agreements", "--disable-interactivity")
	if err != nil {
		return nil, err
	}
	if res.ExitCode != 0 {
		_, _, msg := describeWingetExit(res.ExitCode)
		return nil, fmt.Errorf("winget show: %s", msg)
	}
	return parseWingetShow(p, res.Stdout), nil
}

func parseWingetShow(p Package, out string) *Info {
	info := &Info{Package: p, Partial: true, DescLang: "en"}
	for _, l := range cleanWingetOutput(out) {
		k, v, ok := strings.Cut(strings.TrimSpace(l), ":")
		if !ok {
			continue
		}
		v = strings.TrimSpace(v)
		switch showKeys[strings.ToLower(strings.TrimSpace(k))] {
		case "publisher":
			info.Publisher = v
		case "description":
			info.Description = v
		case "homepage":
			info.Homepage = v
		case "license":
			info.License = v
		case "type":
			if lbl, ok := wingetTypeLabels[strings.ToLower(v)]; ok {
				v = lbl
			}
			info.InstallerTypes = append(info.InstallerTypes, v)
		case "sha256":
			info.SHA256 = append(info.SHA256, strings.ToLower(v))
		}
	}
	info.ManifestURL = ManifestWebURL(p.ID)
	return info
}

// ── Homebrew ────────────────────────────────────────────────────────────────

type brewInfoDetail struct {
	Formulae []struct {
		Name       string `json:"name"`
		Desc       string `json:"desc"`
		Homepage   string `json:"homepage"`
		License    string `json:"license"`
		Deprecated bool   `json:"deprecated"`
		Disabled   bool   `json:"disabled"`
		Versions   struct {
			Stable string `json:"stable"`
		} `json:"versions"`
	} `json:"formulae"`
	Casks []struct {
		Token       string   `json:"token"`
		Name        []string `json:"name"`
		Desc        string   `json:"desc"`
		Homepage    string   `json:"homepage"`
		Version     string   `json:"version"`
		Sha256      string   `json:"sha256"`
		AutoUpdates bool     `json:"auto_updates"`
		Deprecated  bool     `json:"deprecated"`
		Disabled    bool     `json:"disabled"`
		Caveats     string   `json:"caveats"`
	} `json:"casks"`
}

func (b *Brew) info(ctx context.Context, p Package) (*Info, error) {
	if b.path == "" {
		return nil, fmt.Errorf("Homebrew nicht verfügbar")
	}
	if err := ValidateID("brew", p.ID); err != nil {
		return nil, err
	}
	kind := "--formula"
	if p.Source == SourceBrewCask {
		kind = "--cask"
	}
	res, err := b.exec(ctx, time.Minute, nil, "info", "--json=v2", kind, p.ID)
	if err != nil {
		return nil, err
	}
	if res.ExitCode != 0 {
		return nil, fmt.Errorf("brew info: %s", lastErrorLine(res.Combined()))
	}
	return parseBrewInfo(p, []byte(res.Stdout))
}

func parseBrewInfo(p Package, data []byte) (*Info, error) {
	var j brewInfoDetail
	if err := json.Unmarshal(data, &j); err != nil {
		return nil, fmt.Errorf("brew info: unerwartete Ausgabe: %w", err)
	}
	info := &Info{Package: p, DescLang: "en"}
	switch {
	case len(j.Formulae) > 0:
		f := j.Formulae[0]
		info.Source = SourceBrew
		info.Description, info.Homepage, info.License = f.Desc, f.Homepage, f.License
		info.Deprecated, info.Disabled = f.Deprecated, f.Disabled
		if info.Available == "" && info.Version == "" {
			info.Version = f.Versions.Stable
		}
		info.InstallerTypes = []string{"Kommandozeilenwerkzeug (Formel)"}
	case len(j.Casks) > 0:
		c := j.Casks[0]
		info.Source = SourceBrewCask
		if len(c.Name) > 0 && (info.Name == "" || info.Name == info.ID) {
			info.Name = c.Name[0]
		}
		info.Description, info.Homepage = c.Desc, c.Homepage
		info.Deprecated, info.Disabled, info.AutoUpdates = c.Deprecated, c.Disabled, c.AutoUpdates
		info.InstallNotes = strings.TrimSpace(c.Caveats)
		if info.Version == "" {
			info.Version = c.Version
		}
		if c.Sha256 != "" && c.Sha256 != "no_check" {
			info.SHA256 = []string{c.Sha256}
		}
		info.InstallerTypes = []string{"Mac-App (Cask)"}
	default:
		return nil, fmt.Errorf("Paket nicht gefunden")
	}
	return info, nil
}

// ── GitHub ──────────────────────────────────────────────────────────────────

var reGitHubRepo = regexp.MustCompile(`^https?://github\.com/([\w.-]+)/([\w.-]+)`)

// fetchGitHubStats lädt Sterne/Aktivität, wenn eine der URLs auf GitHub zeigt.
// Fehler (z. B. API-Limit) werden ignoriert – dann fehlt nur die Statistik.
func fetchGitHubStats(ctx context.Context, token string, urls ...string) *GitHubStats {
	for _, u := range urls {
		m := reGitHubRepo.FindStringSubmatch(u)
		if m == nil {
			continue
		}
		repo := strings.TrimSuffix(m[2], ".git")
		h := map[string]string{"Accept": "application/vnd.github+json"}
		if token != "" {
			h["Authorization"] = "Bearer " + token
		}
		body, code, err := httpGet(ctx, "https://api.github.com/repos/"+m[1]+"/"+repo, h)
		if err != nil || code != 200 {
			return nil
		}
		var j struct {
			HTMLURL  string    `json:"html_url"`
			Stars    int       `json:"stargazers_count"`
			PushedAt time.Time `json:"pushed_at"`
			Archived bool      `json:"archived"`
			License  *struct {
				SPDX string `json:"spdx_id"`
			} `json:"license"`
		}
		if json.Unmarshal(body, &j) != nil {
			return nil
		}
		gs := &GitHubStats{URL: j.HTMLURL, Stars: j.Stars, PushedAt: j.PushedAt, Archived: j.Archived}
		if j.License != nil {
			gs.License = j.License.SPDX
		}
		return gs
	}
	return nil
}
