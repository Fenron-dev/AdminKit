package packages

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"adminkit/internal/execx"
)

// Winget steuert den Windows-Paketmanager winget.
type Winget struct {
	path    string
	version string
}

// NewWinget sucht winget.exe. Fehlt winget, liefert Status() einen Hinweis.
func NewWinget() *Winget {
	return &Winget{path: findWinget()}
}

func (w *Winget) Name() string { return "winget" }

// findWinget sucht winget im PATH, als App-Ausführungsalias und – für den
// SYSTEM-Kontext bzw. andere Benutzer – im WindowsApps-Ordner (höchste Version).
func findWinget() string {
	if p, err := lookPath("winget"); err == nil {
		return p
	}
	if la := os.Getenv("LOCALAPPDATA"); la != "" {
		p := filepath.Join(la, "Microsoft", "WindowsApps", "winget.exe")
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	pf := os.Getenv("ProgramFiles")
	if pf == "" {
		pf = `C:\Program Files`
	}
	matches, _ := filepath.Glob(filepath.Join(pf, "WindowsApps", "Microsoft.DesktopAppInstaller_*_x64__8wekyb3d8bbwe", "winget.exe"))
	if len(matches) == 0 {
		return ""
	}
	sort.Slice(matches, func(i, j int) bool {
		return versionAtLeast(appInstallerVersion(matches[i]), appInstallerVersion(matches[j]))
	})
	return matches[0]
}

// appInstallerVersion holt „1.23.1911.0“ aus …\Microsoft.DesktopAppInstaller_1.23.1911.0_x64__…\winget.exe
func appInstallerVersion(p string) string {
	dir := filepath.Base(filepath.Dir(p))
	parts := strings.Split(dir, "_")
	if len(parts) >= 2 {
		return parts[1]
	}
	return ""
}

func (w *Winget) Status(ctx context.Context) Status {
	st := Status{Manager: "winget", Path: w.path}
	if w.path == "" {
		st.Hint = "winget ist nicht installiert. Windows 10/11: „App-Installer“ im Microsoft Store installieren oder aktualisieren. " +
			"Windows Server/LTSC: in PowerShell (Admin) „Install-Module Microsoft.WinGet.Client“ und danach „Repair-WinGetPackageManager -AllUsers“ ausführen."
		return st
	}
	out, err := execx.Output(ctx, 30*time.Second, w.path, "--version")
	if err != nil {
		st.Hint = "winget gefunden, startet aber nicht: " + err.Error()
		return st
	}
	w.version = parseWingetVersion(out)
	st.Version = w.version
	st.Available = true
	st.SupportsPin = versionAtLeast(w.version, "1.5")
	return st
}

// sourceArgs liefert --source, wenn genau eine Quelle erlaubt ist.
func sourceArgs(o Options) []string {
	src := o.Sources
	if len(src) == 0 {
		src = []string{"winget"}
	}
	if len(src) == 1 {
		return []string{"--source", src[0]}
	}
	return nil
}

// Command baut die Argumentliste für eine Aktion – die einzige Stelle dafür.
func (w *Winget) Command(a Action, id string, o Options) ([]string, error) {
	exe := w.path
	if exe == "" {
		exe = "winget"
	}
	common := []string{"--accept-source-agreements", "--disable-interactivity"}
	needID := a != ActionUpgradeAll && a != ActionOutdated && a != ActionSearch
	if needID {
		if err := ValidateID("winget", id); err != nil {
			return nil, err
		}
	}
	var args []string
	switch a {
	case ActionInstall:
		args = []string{"install", "--id", id, "-e"}
		args = append(args, sourceArgs(o)...)
		args = append(args, "--accept-package-agreements")
		if o.Scope == "machine" || o.Scope == "user" {
			args = append(args, "--scope", o.Scope)
		}
		if o.Silent {
			args = append(args, "--silent")
		}
	case ActionUpgrade:
		args = []string{"upgrade", "--id", id, "-e", "--accept-package-agreements"}
		if o.Silent {
			args = append(args, "--silent")
		}
	case ActionUpgradeAll:
		args = []string{"upgrade", "--all", "--accept-package-agreements"}
		if o.Silent {
			args = append(args, "--silent")
		}
	case ActionUninstall:
		args = []string{"uninstall", "--id", id, "-e"}
		if o.Silent {
			args = append(args, "--silent")
		}
	case ActionPin:
		args = []string{"pin", "add", "--id", id, "-e"}
	case ActionUnpin:
		args = []string{"pin", "remove", "--id", id, "-e"}
	case ActionOutdated:
		args = []string{"upgrade", "--include-unknown"}
	case ActionSearch:
		q, err := ValidateQuery(id)
		if err != nil {
			return nil, err
		}
		args = []string{"search", "--query", q}
		args = append(args, sourceArgs(o)...)
	default:
		return nil, fmt.Errorf("unbekannte Aktion %q", a)
	}
	return append(append([]string{exe}, args...), common...), nil
}

// export liest alle Pakete über `winget export` (vollständige IDs, JSON).
func (w *Winget) export(ctx context.Context) ([]Package, error) {
	f, err := os.CreateTemp("", "adminkit-winget-*.json")
	if err != nil {
		return nil, err
	}
	tmp := f.Name()
	f.Close()
	os.Remove(tmp)       // winget legt die Datei selbst an
	defer os.Remove(tmp) // Minimal-Fußabdruck: sofort wieder löschen

	res, err := execx.Run(ctx, execx.Options{Timeout: 3 * time.Minute}, w.path,
		"export", "-o", tmp, "--include-versions", "--accept-source-agreements", "--disable-interactivity")
	if err != nil {
		return nil, err
	}
	data, rerr := os.ReadFile(tmp)
	if rerr != nil {
		return nil, fmt.Errorf("winget export (Code %d): %s", res.ExitCode, lastLine(res.Combined()))
	}
	return parseWingetExport(data)
}

func (w *Winget) Installed(ctx context.Context) ([]Package, error) {
	if w.path == "" {
		return nil, fmt.Errorf("winget nicht verfügbar")
	}
	exported, err := w.export(ctx)
	if err != nil {
		return nil, err
	}
	// Namen stehen nur in `winget list` – optional ergänzen.
	res, lerr := execx.Run(ctx, execx.Options{Timeout: 3 * time.Minute}, w.path,
		"list", "--accept-source-agreements", "--disable-interactivity")
	if lerr == nil {
		listed := parseWingetList(res.Stdout, false)
		known := make([]string, len(exported))
		for i, p := range exported {
			known[i] = p.ID
		}
		resolveTruncated(listed, known)
		names := map[string]Package{}
		for _, p := range listed {
			names[p.ID] = p
		}
		for i := range exported {
			if l, ok := names[exported[i].ID]; ok {
				exported[i].Name = l.Name
				exported[i].Available = l.Available
			}
		}
	}
	for i := range exported {
		if exported[i].Name == "" {
			exported[i].Name = exported[i].ID
		}
	}
	return exported, nil
}

func (w *Winget) Outdated(ctx context.Context, o Options) ([]Package, error) {
	if w.path == "" {
		return nil, fmt.Errorf("winget nicht verfügbar")
	}
	args, err := w.Command(ActionOutdated, "", o)
	if err != nil {
		return nil, err
	}
	res, err := execx.Run(ctx, execx.Options{Timeout: 5 * time.Minute}, args[0], args[1:]...)
	if err != nil {
		return nil, err
	}
	pkgs := parseWingetUpgrade(res.Stdout)
	if len(pkgs) == 0 && res.ExitCode != 0 {
		if ok, _, msg := describeWingetExit(res.ExitCode); !ok {
			return nil, fmt.Errorf("winget upgrade: %s", msg)
		}
	}
	// Gekürzte IDs über den Export auflösen
	needResolve := false
	for _, p := range pkgs {
		if p.Truncated {
			needResolve = true
			break
		}
	}
	if needResolve {
		if ex, err := w.export(ctx); err == nil {
			known := make([]string, len(ex))
			for i, p := range ex {
				known[i] = p.ID
			}
			resolveTruncated(pkgs, known)
		}
	}
	// Gepinnte Pakete markieren
	if pinned := w.pinned(ctx); len(pinned) > 0 {
		for i := range pkgs {
			if pinned[pkgs[i].ID] {
				pkgs[i].Pinned = true
			}
		}
	}
	return pkgs, nil
}

// pinned liefert die IDs aus `winget pin list` (leer bei älteren winget-Versionen).
func (w *Winget) pinned(ctx context.Context) map[string]bool {
	if w.version != "" && !versionAtLeast(w.version, "1.5") {
		return nil
	}
	res, err := execx.Run(ctx, execx.Options{Timeout: time.Minute}, w.path,
		"pin", "list", "--accept-source-agreements", "--disable-interactivity")
	if err != nil || res.ExitCode != 0 {
		return nil
	}
	out := map[string]bool{}
	for _, t := range parseWingetTables(res.Stdout) {
		for _, r := range t.Rows {
			out[r[1]] = true
		}
	}
	return out
}

func (w *Winget) Search(ctx context.Context, query string, o Options) ([]Package, error) {
	if w.path == "" {
		return nil, fmt.Errorf("winget nicht verfügbar")
	}
	args, err := w.Command(ActionSearch, query, o)
	if err != nil {
		return nil, err
	}
	res, err := execx.Run(ctx, execx.Options{Timeout: 2 * time.Minute}, args[0], args[1:]...)
	if err != nil {
		return nil, err
	}
	pkgs := parseWingetList(res.Stdout, true)
	if len(pkgs) == 0 && res.ExitCode != 0 {
		if ok, _, msg := describeWingetExit(res.ExitCode); !ok && uint32(res.ExitCode) != 0x8A150014 {
			return nil, fmt.Errorf("winget search: %s", msg)
		}
	}
	return pkgs, nil
}

// run führt eine verändernde Aktion aus und wertet den Rückgabecode aus.
func (w *Winget) run(ctx context.Context, a Action, id string, o Options, out func(string)) Result {
	r := Result{ID: id, Action: a}
	args, err := w.Command(a, id, o)
	if err != nil {
		r.Message = err.Error()
		return r
	}
	r.Command = execx.QuoteArgs(args)
	if w.path == "" {
		r.Message = "winget nicht verfügbar"
		return r
	}
	opts := execx.Options{Timeout: 30 * time.Minute}
	if out != nil {
		opts.OnLine = filterProgress(out)
	}
	res, err := execx.Run(ctx, opts, args[0], args[1:]...)
	r.Output = cleanOutput(res.Combined())
	r.Code = int64(uint32(res.ExitCode))
	if err != nil {
		r.Canceled = res.Canceled
		r.Message = err.Error()
		if res.Canceled {
			r.Message = "Abgebrochen"
		}
		return r
	}
	r.Success, r.Reboot, r.Message = describeWingetExit(res.ExitCode)
	return r
}

func (w *Winget) Install(ctx context.Context, id string, o Options, out func(string)) Result {
	return w.run(ctx, ActionInstall, id, o, out)
}
func (w *Winget) Upgrade(ctx context.Context, id string, o Options, out func(string)) Result {
	return w.run(ctx, ActionUpgrade, id, o, out)
}
func (w *Winget) UpgradeAll(ctx context.Context, o Options, out func(string)) Result {
	return w.run(ctx, ActionUpgradeAll, "", o, out)
}
func (w *Winget) Uninstall(ctx context.Context, id string, o Options, out func(string)) Result {
	return w.run(ctx, ActionUninstall, id, o, out)
}
func (w *Winget) Pin(ctx context.Context, id string, pin bool, o Options) Result {
	a := ActionPin
	if !pin {
		a = ActionUnpin
	}
	return w.run(ctx, a, id, o, nil)
}
