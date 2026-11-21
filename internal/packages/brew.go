package packages

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"adminkit/internal/execx"
)

// Brew steuert Homebrew (macOS). Homebrew läuft nie als root – AdminKit
// startet brew immer als angemeldeter Benutzer.
type Brew struct {
	path string
}

// NewBrew sucht brew an den bekannten Orten (Wails-Apps erben den Shell-PATH nicht).
func NewBrew() *Brew {
	p, _ := FindBrew()
	return &Brew{path: p}
}

// FindBrew liefert den Pfad zu brew.
func FindBrew() (string, error) {
	for _, p := range []string{
		"/opt/homebrew/bin/brew", // Apple Silicon
		"/usr/local/bin/brew",    // Intel
		"/home/linuxbrew/.linuxbrew/bin/brew",
	} {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	if p, err := lookPath("brew"); err == nil {
		return p, nil
	}
	return "", fmt.Errorf("Homebrew nicht installiert (brew nicht gefunden)")
}

// BrewInstallCommand ist der offizielle Installationsbefehl von brew.sh.
const BrewInstallCommand = `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`

func (b *Brew) Name() string { return "brew" }

// env ergänzt PATH um das brew-Verzeichnis und schaltet Hinweise ab.
func (b *Brew) env() []string {
	dir := filepath.Dir(b.path)
	return []string{
		"PATH=" + dir + ":/usr/bin:/bin:/usr/sbin:/sbin",
		"HOMEBREW_NO_ENV_HINTS=1",
		"HOMEBREW_NO_EMOJI=1",
		"HOMEBREW_COLOR=",
		"HOMEBREW_NO_COLOR=1",
	}
}

func (b *Brew) exec(ctx context.Context, timeout time.Duration, out func(string), args ...string) (*execx.Result, error) {
	if os.Geteuid() == 0 {
		return &execx.Result{ExitCode: -1}, fmt.Errorf("Homebrew darf nicht als root laufen – AdminKit bitte als normaler Benutzer starten")
	}
	opts := execx.Options{Timeout: timeout, Env: b.env()}
	if out != nil {
		opts.OnLine = filterProgress(out)
	}
	return execx.Run(ctx, opts, b.path, args...)
}

func (b *Brew) Status(ctx context.Context) Status {
	st := Status{Manager: "brew", Path: b.path}
	if b.path == "" {
		st.Hint = "Homebrew ist nicht installiert. Die Installation braucht Adminrechte und die Xcode Command Line Tools und wird deshalb nicht automatisch ausgeführt. Befehl im Terminal ausführen:"
		st.InstallCommand = BrewInstallCommand
		return st
	}
	res, err := b.exec(ctx, 30*time.Second, nil, "--version")
	if err != nil {
		st.Hint = err.Error()
		return st
	}
	first := strings.SplitN(strings.TrimSpace(res.Stdout), "\n", 2)[0]
	st.Version = strings.TrimSpace(strings.TrimPrefix(first, "Homebrew"))
	st.Available = res.ExitCode == 0
	st.SupportsPin = true // nur für Formeln
	if _, err := os.Stat(filepath.Join(filepath.Dir(b.path), "mas")); err == nil {
		st.HasMAS = true
	}
	return st
}

func (b *Brew) Command(a Action, id string, o Options) ([]string, error) {
	exe := b.path
	if exe == "" {
		exe = "brew"
	}
	needID := a != ActionUpgradeAll && a != ActionOutdated && a != ActionSearch
	if needID {
		if err := ValidateID("brew", id); err != nil {
			return nil, err
		}
	}
	var args []string
	switch a {
	case ActionInstall:
		args = []string{"install"}
		if o.Cask {
			args = append(args, "--cask")
		}
		args = append(args, id)
	case ActionUpgrade:
		args = []string{"upgrade"}
		if o.Cask {
			args = append(args, "--cask")
			if o.Greedy {
				args = append(args, "--greedy")
			}
		}
		args = append(args, id)
	case ActionUpgradeAll:
		args = []string{"upgrade"}
		if o.Greedy {
			args = append(args, "--greedy")
		}
	case ActionUninstall:
		args = []string{"uninstall"}
		if o.Cask {
			args = append(args, "--cask")
		}
		args = append(args, id)
	case ActionPin, ActionUnpin:
		if o.Cask {
			return nil, fmt.Errorf("Homebrew kann nur Formeln pinnen, keine Casks")
		}
		args = []string{string(a), id}
	case ActionOutdated:
		args = []string{"outdated", "--json=v2"}
		if o.Greedy {
			args = append(args, "--greedy")
		}
	case ActionSearch:
		q, err := ValidateQuery(id)
		if err != nil {
			return nil, err
		}
		kind := "--formula"
		if o.Cask {
			kind = "--cask"
		}
		args = []string{"search", kind, q}
	default:
		return nil, fmt.Errorf("unbekannte Aktion %q", a)
	}
	return append([]string{exe}, args...), nil
}

// ── JSON-Formate ────────────────────────────────────────────────────────────

type brewOutdatedJSON struct {
	Formulae []struct {
		Name              string          `json:"name"`
		InstalledVersions json.RawMessage `json:"installed_versions"`
		CurrentVersion    string          `json:"current_version"`
		Pinned            bool            `json:"pinned"`
	} `json:"formulae"`
	Casks []struct {
		Name              string          `json:"name"`
		InstalledVersions json.RawMessage `json:"installed_versions"`
		CurrentVersion    string          `json:"current_version"`
	} `json:"casks"`
}

// firstVersion akzeptiert ["1.0","1.1"] oder "1.0" (ältere brew-Versionen).
func firstVersion(raw json.RawMessage) string {
	var list []string
	if json.Unmarshal(raw, &list) == nil {
		if len(list) > 0 {
			return list[len(list)-1]
		}
		return ""
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	return ""
}

func parseBrewOutdated(data []byte) ([]Package, error) {
	var j brewOutdatedJSON
	if err := json.Unmarshal(data, &j); err != nil {
		return nil, fmt.Errorf("brew outdated: unerwartete Ausgabe: %w", err)
	}
	var pkgs []Package
	for _, f := range j.Formulae {
		pkgs = append(pkgs, Package{ID: f.Name, Name: f.Name, Version: firstVersion(f.InstalledVersions),
			Available: f.CurrentVersion, Source: SourceBrew, Pinned: f.Pinned})
	}
	for _, c := range j.Casks {
		pkgs = append(pkgs, Package{ID: c.Name, Name: c.Name, Version: firstVersion(c.InstalledVersions),
			Available: c.CurrentVersion, Source: SourceBrewCask})
	}
	return pkgs, nil
}

type brewInfoJSON struct {
	Formulae []struct {
		Name      string `json:"name"`
		Desc      string `json:"desc"`
		Installed []struct {
			Version            string `json:"version"`
			InstalledOnRequest bool   `json:"installed_on_request"`
		} `json:"installed"`
		Pinned   bool `json:"pinned"`
		Outdated bool `json:"outdated"`
		Versions struct {
			Stable string `json:"stable"`
		} `json:"versions"`
	} `json:"formulae"`
	Casks []struct {
		Token       string   `json:"token"`
		Name        []string `json:"name"`
		Version     string   `json:"version"`
		Installed   string   `json:"installed"`
		Outdated    bool     `json:"outdated"`
		AutoUpdates bool     `json:"auto_updates"`
	} `json:"casks"`
}

// parseBrewInstalled wertet `brew info --json=v2 --installed` aus.
// Formeln, die nur als Abhängigkeit installiert wurden, werden ausgelassen.
func parseBrewInstalled(data []byte) ([]Package, error) {
	var j brewInfoJSON
	if err := json.Unmarshal(data, &j); err != nil {
		return nil, fmt.Errorf("brew info: unerwartete Ausgabe: %w", err)
	}
	var pkgs []Package
	for _, f := range j.Formulae {
		if len(f.Installed) == 0 {
			continue
		}
		inst := f.Installed[len(f.Installed)-1]
		if !inst.InstalledOnRequest {
			continue
		}
		p := Package{ID: f.Name, Name: f.Name, Version: inst.Version, Source: SourceBrew, Pinned: f.Pinned}
		if f.Outdated {
			p.Available = f.Versions.Stable
		}
		pkgs = append(pkgs, p)
	}
	for _, c := range j.Casks {
		name := c.Token
		if len(c.Name) > 0 {
			name = c.Name[0]
		}
		p := Package{ID: c.Token, Name: name, Version: c.Installed, Source: SourceBrewCask, AutoUpdates: c.AutoUpdates}
		if c.Outdated {
			p.Available = c.Version
		}
		pkgs = append(pkgs, p)
	}
	return pkgs, nil
}

// ── Manager-Methoden ────────────────────────────────────────────────────────

func (b *Brew) Installed(ctx context.Context) ([]Package, error) {
	if b.path == "" {
		return nil, fmt.Errorf("Homebrew nicht verfügbar")
	}
	res, err := b.exec(ctx, 2*time.Minute, nil, "info", "--json=v2", "--installed")
	if err != nil {
		return nil, err
	}
	if res.ExitCode != 0 {
		return nil, fmt.Errorf("brew info: %s", lastLine(res.Combined()))
	}
	return parseBrewInstalled([]byte(res.Stdout))
}

// Outdated aktualisiert zuerst die Paketlisten (`brew update`, online) und
// liefert dann die veralteten Formeln und Casks.
func (b *Brew) Outdated(ctx context.Context, o Options) ([]Package, error) {
	if b.path == "" {
		return nil, fmt.Errorf("Homebrew nicht verfügbar")
	}
	// Fehler bei update sind nicht fatal (z. B. offline) – dann gilt der lokale Stand.
	_, _ = b.exec(ctx, 3*time.Minute, nil, "update", "--quiet")
	args, err := b.Command(ActionOutdated, "", o)
	if err != nil {
		return nil, err
	}
	res, err := b.exec(ctx, 3*time.Minute, nil, args[1:]...)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(res.Stdout) == "" && res.ExitCode != 0 {
		return nil, fmt.Errorf("brew outdated: %s", lastLine(res.Combined()))
	}
	pkgs, err := parseBrewOutdated([]byte(res.Stdout))
	if err != nil {
		return nil, err
	}
	// auto_updates-Flag für Casks ergänzen (für den Hinweis in der UI)
	if inst, err := b.Installed(ctx); err == nil {
		auto := map[string]bool{}
		for _, p := range inst {
			if p.AutoUpdates {
				auto[p.ID] = true
			}
		}
		for i := range pkgs {
			pkgs[i].AutoUpdates = auto[pkgs[i].ID]
		}
	}
	return pkgs, nil
}

func (b *Brew) Search(ctx context.Context, query string, o Options) ([]Package, error) {
	if b.path == "" {
		return nil, fmt.Errorf("Homebrew nicht verfügbar")
	}
	var pkgs []Package
	for _, cask := range []bool{true, false} {
		oo := o
		oo.Cask = cask
		args, err := b.Command(ActionSearch, query, oo)
		if err != nil {
			return nil, err
		}
		res, err := b.exec(ctx, 2*time.Minute, nil, args[1:]...)
		if err != nil {
			return nil, err
		}
		src := SourceBrew
		if cask {
			src = SourceBrewCask
		}
		for _, name := range parseBrewSearch(res.Stdout) {
			pkgs = append(pkgs, Package{ID: name, Name: name, Source: src})
		}
	}
	return pkgs, nil
}

// parseBrewSearch liest die Namensliste von `brew search` (ohne Überschriften).
func parseBrewSearch(out string) []string {
	var names []string
	for _, l := range strings.Split(out, "\n") {
		l = strings.TrimSpace(l)
		if l == "" || strings.HasPrefix(l, "==>") || strings.HasPrefix(l, "If you meant") ||
			strings.Contains(l, " ") || strings.HasPrefix(l, "No ") {
			continue
		}
		names = append(names, strings.TrimSuffix(l, " ✔"))
	}
	return names
}

// rePasswordNeeded erkennt Casks, die per sudo nach einem Passwort fragen.
var rePasswordNeeded = regexp.MustCompile(`(?i)(a terminal is required|no tty present|a password is required|sudo: .*password|askpass)`)

func (b *Brew) run(ctx context.Context, a Action, id string, o Options, out func(string)) Result {
	r := Result{ID: id, Action: a}
	args, err := b.Command(a, id, o)
	if err != nil {
		r.Message = err.Error()
		return r
	}
	r.Command = execx.QuoteArgs(args)
	if b.path == "" {
		r.Message = "Homebrew nicht verfügbar"
		return r
	}
	res, err := b.exec(ctx, 30*time.Minute, out, args[1:]...)
	r.Output = cleanOutput(res.Combined())
	r.Code = int64(res.ExitCode)
	if err != nil {
		r.Canceled = res.Canceled
		r.Message = err.Error()
		if res.Canceled {
			r.Message = "Abgebrochen"
		}
		return r
	}
	switch {
	case res.ExitCode == 0:
		r.Success = true
		r.Message = "Erfolgreich"
		if strings.Contains(strings.ToLower(r.Output), "restart") && strings.Contains(strings.ToLower(r.Output), "reboot") {
			r.Reboot = true
		}
	case rePasswordNeeded.MatchString(r.Output):
		r.NeedsTerminal = true
		r.Message = "Dieses Paket fragt nach dem Admin-Passwort. Bitte den Befehl im Terminal ausführen."
	default:
		r.Message = "Fehlgeschlagen: " + lastErrorLine(r.Output)
	}
	return r
}

// lastErrorLine sucht die aussagekräftigste Fehlerzeile („Error: …“).
func lastErrorLine(s string) string {
	lines := strings.Split(s, "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if strings.HasPrefix(strings.TrimSpace(lines[i]), "Error:") {
			return strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(lines[i]), "Error:"))
		}
	}
	return lastLine(s)
}

func (b *Brew) Install(ctx context.Context, id string, o Options, out func(string)) Result {
	return b.run(ctx, ActionInstall, id, o, out)
}
func (b *Brew) Upgrade(ctx context.Context, id string, o Options, out func(string)) Result {
	return b.run(ctx, ActionUpgrade, id, o, out)
}
func (b *Brew) UpgradeAll(ctx context.Context, o Options, out func(string)) Result {
	return b.run(ctx, ActionUpgradeAll, "", o, out)
}
func (b *Brew) Uninstall(ctx context.Context, id string, o Options, out func(string)) Result {
	return b.run(ctx, ActionUninstall, id, o, out)
}
func (b *Brew) Pin(ctx context.Context, id string, pin bool, o Options) Result {
	a := ActionPin
	if !pin {
		a = ActionUnpin
	}
	return b.run(ctx, a, id, o, nil)
}
