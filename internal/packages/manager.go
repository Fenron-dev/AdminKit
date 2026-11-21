package packages

import (
	"context"
	"fmt"
	"runtime"
)

// New liefert den Paketmanager für die aktuelle Plattform.
func New() Manager {
	switch runtime.GOOS {
	case "windows":
		return NewWinget()
	case "darwin":
		return NewBrew()
	}
	return unsupported{}
}

// unsupported ist der Platzhalter für Linux (apt/flatpak bewusst nicht umgesetzt).
type unsupported struct{}

var errUnsupported = fmt.Errorf("Paketverwaltung ist auf diesem Betriebssystem nicht verfügbar")

func (unsupported) Name() string { return "" }
func (unsupported) Status(context.Context) Status {
	return Status{Hint: "Die Paketverwaltung unterstützt Windows (winget) und macOS (Homebrew)."}
}
func (unsupported) Installed(context.Context) ([]Package, error)         { return nil, errUnsupported }
func (unsupported) Outdated(context.Context, Options) ([]Package, error) { return nil, errUnsupported }
func (unsupported) Search(context.Context, string, Options) ([]Package, error) {
	return nil, errUnsupported
}
func (unsupported) Install(_ context.Context, id string, _ Options, _ func(string)) Result {
	return Result{ID: id, Message: errUnsupported.Error()}
}
func (unsupported) Upgrade(_ context.Context, id string, _ Options, _ func(string)) Result {
	return Result{ID: id, Message: errUnsupported.Error()}
}
func (unsupported) UpgradeAll(context.Context, Options, func(string)) Result {
	return Result{Message: errUnsupported.Error()}
}
func (unsupported) Uninstall(_ context.Context, id string, _ Options, _ func(string)) Result {
	return Result{ID: id, Message: errUnsupported.Error()}
}
func (unsupported) Pin(_ context.Context, id string, _ bool, _ Options) Result {
	return Result{ID: id, Message: errUnsupported.Error()}
}
func (unsupported) Command(Action, string, Options) ([]string, error) { return nil, errUnsupported }
