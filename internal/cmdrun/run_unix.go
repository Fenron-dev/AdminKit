//go:build !windows

package cmdrun

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"runtime"
	"strings"

	"adminkit/internal/execx"
)

// Elevated meldet, ob AdminKit als root läuft.
func Elevated() bool { return os.Geteuid() == 0 }

func run(ctx context.Context, r Request, res *Result) {
	res.Elevated = Elevated()
	var c *exec.Cmd
	switch {
	case r.Admin && !res.Elevated && runtime.GOOS == "darwin":
		// macOS fragt selbst nach dem Administratorkennwort; Ausgabe kommt zurück
		c = execx.CommandContext(ctx, "osascript", "-e", "do shell script "+appleScriptQuote(r.Command+" 2>&1")+" with administrator privileges")
	case r.Admin && !res.Elevated:
		res.Error = "Befehle mit Administratorrechten werden auf diesem System nicht unterstützt"
		return
	default:
		c = execx.CommandContext(ctx, "/bin/sh", "-c", r.Command)
	}
	var buf bytes.Buffer
	c.Stdout, c.Stderr = &buf, &buf
	err := c.Run()
	res.Output = strings.TrimRight(buf.String(), "\n")
	var ee *exec.ExitError
	switch {
	case err == nil:
	case errors.As(err, &ee):
		res.ExitCode = ee.ExitCode()
		if strings.Contains(res.Output, "(-128)") {
			res.Error = "Anmeldung als Administrator abgebrochen"
		}
	default:
		res.ExitCode = -1
		if ctx.Err() == nil {
			res.Error = err.Error()
		}
	}
}

// Open startet ein erlaubtes Ziel (Systemeinstellungen, App).
func Open(target string, args []string) error {
	if !ValidOpen(target, args) || runtime.GOOS != "darwin" {
		if runtime.GOOS != "darwin" {
			return errors.New("Öffnen wird nur unter Windows und macOS unterstützt")
		}
		return ErrNotAllowed
	}
	t := strings.TrimSpace(target)
	if strings.HasPrefix(t, "app:") {
		return execx.Command("open", "-a", strings.TrimPrefix(t, "app:")).Start()
	}
	if !strings.HasPrefix(t, "x-apple.systempreferences:") {
		return ErrNotAllowed
	}
	return execx.Command("open", t).Start()
}
