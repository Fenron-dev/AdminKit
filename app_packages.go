package main

// Paketverwaltung (winget / Homebrew) – siehe Issues #84–#87.

import (
	"context"
	"fmt"
	"sync"
	"time"

	"adminkit/internal/execx"
	"adminkit/internal/logging"
	"adminkit/internal/packages"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// pkgState hält den Paketmanager und den laufenden Vorgang.
type pkgState struct {
	once sync.Once
	mgr  packages.Manager

	// busy: es läuft immer nur ein Paketvorgang (winget/brew vertragen keine Parallelität).
	busy   sync.Mutex
	mu     sync.Mutex
	cancel context.CancelFunc
}

// PackageRef bezeichnet ein Paket für eine Aktion. Version/Available dienen nur
// dem Protokoll (Vorher/Nachher).
type PackageRef struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Source    packages.Source `json:"source"`
	Version   string          `json:"version"`
	Available string          `json:"available"`
}

func (a *App) pkgMgr() packages.Manager {
	a.pkg.once.Do(func() { a.pkg.mgr = packages.New() })
	return a.pkg.mgr
}

// pkgOptions ergänzt die Optionen aus dem Frontend um die Quellen aus der Config.
func (a *App) pkgOptions(o packages.Options, ref *PackageRef) packages.Options {
	if a.cfg != nil {
		o.Sources = a.cfg.Packages.Sources
	}
	if ref != nil {
		o.Cask = ref.Source == packages.SourceBrewCask
	}
	return o
}

func (a *App) requirePackagesOnline() error {
	if a.cfg != nil && !a.cfg.Online.Allowed("packages") {
		return fmt.Errorf("Online-Funktionen für die Paketverwaltung sind in den Einstellungen abgeschaltet")
	}
	return nil
}

// startPkgOp sperrt den Paketvorgang und liefert einen abbrechbaren Context.
func (a *App) startPkgOp() (context.Context, func(), error) {
	if !a.pkg.busy.TryLock() {
		return nil, nil, fmt.Errorf("Es läuft bereits ein Paketvorgang – bitte warten oder abbrechen")
	}
	ctx, cancel := context.WithCancel(a.ctx)
	a.pkg.mu.Lock()
	a.pkg.cancel = cancel
	a.pkg.mu.Unlock()
	done := func() {
		a.pkg.mu.Lock()
		a.pkg.cancel = nil
		a.pkg.mu.Unlock()
		cancel()
		a.pkg.busy.Unlock()
	}
	return ctx, done, nil
}

func (a *App) emitPkgLine(line string) {
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "packages:output", line)
	}
}

// logPkgChange schreibt das Ergebnis ins Log und in changes.md der Session.
func (a *App) logPkgChange(r packages.Result, ref PackageRef) {
	label := packages.ActionLabel(r.Action)
	pkgName := ref.ID
	if pkgName == "" {
		pkgName = "alle Pakete"
	}
	if r.Success {
		logging.Infof("Pakete", "%s %s: %s", label, pkgName, r.Message)
	} else {
		logging.Warnf("Pakete", "%s %s fehlgeschlagen: %s", label, pkgName, r.Message)
	}
	if r.Canceled || a.lastSessionPath == "" {
		return
	}
	if err := packages.AppendChange(a.lastSessionPath, packages.ChangeEntry{
		Time: time.Now(), Action: label, Package: pkgName,
		Before: r.Before, After: r.After, Success: r.Success, Message: r.Message,
	}); err != nil {
		logging.Warnf("Pakete", "changes.md konnte nicht geschrieben werden: %v", err)
	}
}

// ── Lesende Methoden ────────────────────────────────────────────────────────

// GetPackageManagerStatus prüft, ob winget bzw. Homebrew vorhanden ist.
func (a *App) GetPackageManagerStatus() packages.Status {
	ctx, cancel := context.WithTimeout(a.ctx, 45*time.Second)
	defer cancel()
	return a.pkgMgr().Status(ctx)
}

// GetInstalledPackages listet die über den Paketmanager bekannten Pakete (offline).
func (a *App) GetInstalledPackages() ([]packages.Package, error) {
	ctx, cancel := context.WithTimeout(a.ctx, 5*time.Minute)
	defer cancel()
	return a.pkgMgr().Installed(ctx)
}

// GetOutdatedPackages liefert die Pakete mit verfügbarem Update (online).
func (a *App) GetOutdatedPackages(opts packages.Options) ([]packages.Package, error) {
	if err := a.requirePackagesOnline(); err != nil {
		return nil, err
	}
	ctx, done, err := a.startPkgOp()
	if err != nil {
		return nil, err
	}
	defer done()
	pkgs, err := a.pkgMgr().Outdated(ctx, a.pkgOptions(opts, nil))
	if err != nil {
		logging.Warnf("Pakete", "Update-Prüfung fehlgeschlagen: %v", err)
		return nil, err
	}
	logging.Infof("Pakete", "%d Update(s) verfügbar", len(pkgs))
	return pkgs, nil
}

// SearchPackages sucht im Paketkatalog (online).
func (a *App) SearchPackages(query string) ([]packages.Package, error) {
	if err := a.requirePackagesOnline(); err != nil {
		return nil, err
	}
	ctx, done, err := a.startPkgOp()
	if err != nil {
		return nil, err
	}
	defer done()
	return a.pkgMgr().Search(ctx, query, a.pkgOptions(packages.Options{}, nil))
}

// GetPackageCommand liefert den genauen Befehl für Bestätigungsdialog und „Befehl kopieren“.
// action: install | upgrade | upgrade-all | uninstall | pin | unpin
func (a *App) GetPackageCommand(action string, ref PackageRef, opts packages.Options) (string, error) {
	args, err := a.pkgMgr().Command(packages.Action(action), ref.ID, a.pkgOptions(opts, &ref))
	if err != nil {
		return "", err
	}
	return execx.QuoteArgs(args), nil
}

// ── Verändernde Methoden (Bestätigung erfolgt im Frontend) ──────────────────

// InstallPackages installiert die Pakete nacheinander. Fehler brechen nicht ab.
func (a *App) InstallPackages(refs []PackageRef, opts packages.Options) ([]packages.Result, error) {
	if err := a.requirePackagesOnline(); err != nil {
		return nil, err
	}
	return a.runPkgBatch(refs, func(ctx context.Context, ref PackageRef) packages.Result {
		r := a.pkgMgr().Install(ctx, ref.ID, a.pkgOptions(opts, &ref), a.emitPkgLine)
		r.After = ref.Version
		return r
	})
}

// UpgradePackages aktualisiert die angegebenen Pakete; leere Liste = alle.
func (a *App) UpgradePackages(refs []PackageRef, opts packages.Options) ([]packages.Result, error) {
	if err := a.requirePackagesOnline(); err != nil {
		return nil, err
	}
	if len(refs) == 0 {
		ctx, done, err := a.startPkgOp()
		if err != nil {
			return nil, err
		}
		defer done()
		runtime.EventsEmit(a.ctx, "packages:progress", map[string]any{"index": 1, "total": 1, "id": ""})
		r := a.pkgMgr().UpgradeAll(ctx, a.pkgOptions(opts, nil), a.emitPkgLine)
		a.logPkgChange(r, PackageRef{})
		runtime.EventsEmit(a.ctx, "packages:done", r)
		return []packages.Result{r}, nil
	}
	return a.runPkgBatch(refs, func(ctx context.Context, ref PackageRef) packages.Result {
		r := a.pkgMgr().Upgrade(ctx, ref.ID, a.pkgOptions(opts, &ref), a.emitPkgLine)
		r.Before = ref.Version
		if r.Success {
			r.After = ref.Available
		}
		return r
	})
}

// UninstallPackage entfernt ein Paket (offline möglich).
func (a *App) UninstallPackage(ref PackageRef, opts packages.Options) (packages.Result, error) {
	res, err := a.runPkgBatch([]PackageRef{ref}, func(ctx context.Context, ref PackageRef) packages.Result {
		r := a.pkgMgr().Uninstall(ctx, ref.ID, a.pkgOptions(opts, &ref), a.emitPkgLine)
		r.Before = ref.Version
		return r
	})
	if err != nil || len(res) == 0 {
		return packages.Result{}, err
	}
	return res[0], nil
}

// SetPackagePinned nimmt ein Paket von Updates aus (pin) oder gibt es frei.
func (a *App) SetPackagePinned(ref PackageRef, pinned bool) (packages.Result, error) {
	res, err := a.runPkgBatch([]PackageRef{ref}, func(ctx context.Context, ref PackageRef) packages.Result {
		r := a.pkgMgr().Pin(ctx, ref.ID, pinned, a.pkgOptions(packages.Options{}, &ref))
		r.Before = ref.Version
		return r
	})
	if err != nil || len(res) == 0 {
		return packages.Result{}, err
	}
	return res[0], nil
}

// CancelPackageOperation bricht den laufenden Paketvorgang ab.
func (a *App) CancelPackageOperation() {
	a.pkg.mu.Lock()
	defer a.pkg.mu.Unlock()
	if a.pkg.cancel != nil {
		logging.Info("Pakete", "Vorgang abgebrochen")
		a.pkg.cancel()
	}
}

// runPkgBatch führt eine Aktion für mehrere Pakete nacheinander aus und meldet
// Fortschritt (packages:progress) und Einzelergebnisse (packages:done).
func (a *App) runPkgBatch(refs []PackageRef, fn func(context.Context, PackageRef) packages.Result) ([]packages.Result, error) {
	ctx, done, err := a.startPkgOp()
	if err != nil {
		return nil, err
	}
	defer done()
	results := make([]packages.Result, 0, len(refs))
	for i, ref := range refs {
		if ctx.Err() != nil {
			results = append(results, packages.Result{ID: ref.ID, Canceled: true, Message: "Abgebrochen"})
			continue
		}
		runtime.EventsEmit(a.ctx, "packages:progress", map[string]any{"index": i + 1, "total": len(refs), "id": ref.ID, "name": ref.Name})
		r := fn(ctx, ref)
		a.logPkgChange(r, ref)
		runtime.EventsEmit(a.ctx, "packages:done", r)
		results = append(results, r)
	}
	return results, nil
}

// GetPackageInfo liefert Beschreibung, Einordnung und Hinweise zu einem Paket.
// known: weitere IDs (z. B. aus der Suche) für Varianten-Hinweise.
// Ohne Online-Freigabe kommen die Infos nur aus dem Cache bzw. (Mac) aus brew.
func (a *App) GetPackageInfo(ref PackageRef, known []string) (*packages.Info, error) {
	ctx, cancel := context.WithTimeout(a.ctx, 90*time.Second)
	defer cancel()
	opt := packages.InfoOptions{Known: known, CacheDays: 30}
	if a.cfg != nil {
		opt.Online = a.cfg.Online.Allowed("packages")
		opt.GitHubStats = a.cfg.Online.Allowed("github_stats")
		opt.GitHubToken = a.cfg.APIKeys.GitHub
		opt.CacheDays = a.cfg.Packages.InfoCacheDays
	}
	if a.vault != nil {
		opt.CacheDir = a.vault.DataPath("packages", "cache")
		notes, err := packages.LoadNotes(a.vault.RootPath)
		if err != nil {
			logging.Warnf("Pakete", "notes.yaml: %v", err)
		}
		opt.Notes = notes
	}
	p := packages.Package{ID: ref.ID, Name: ref.Name, Source: ref.Source, Version: ref.Version, Available: ref.Available}
	info, err := packages.GetInfo(ctx, a.pkgMgr(), p, opt)
	if err != nil {
		logging.Warnf("Pakete", "Infos zu %s: %v", ref.ID, err)
	}
	return info, err
}
