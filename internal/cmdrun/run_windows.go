//go:build windows

package cmdrun

import (
	"bytes"
	"context"
	"errors"
	"os/exec"
	"strings"
	"syscall"

	"adminkit/internal/execx"

	"golang.org/x/sys/windows"
)

// Elevated meldet, ob AdminKit mit Administratorrechten läuft.
func Elevated() bool { return windows.GetCurrentProcessToken().IsElevated() }

func psScript(cmd string) string {
	return "[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue'; " + cmd
}

func run(ctx context.Context, r Request, res *Result) {
	res.Elevated = Elevated()
	shell := r.Shell
	if shell == "" || shell == "sh" {
		shell = "cmd"
	}
	if r.Admin && !res.Elevated {
		// Eigenes Fenster mit UAC-Abfrage; Ausgabe bleibt dort sichtbar
		var inner string
		if shell == "powershell" {
			inner = "Start-Process -Verb RunAs -FilePath powershell.exe -ArgumentList '-NoExit','-NoProfile','-EncodedCommand','" + encodePS(psScript(r.Command)) + "'"
		} else {
			inner = "Start-Process -Verb RunAs -FilePath cmd.exe -ArgumentList '/k chcp 65001>nul & " + strings.ReplaceAll(r.Command, "'", "''") + "'"
		}
		c := execx.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodePS(inner))
		out, err := c.CombinedOutput()
		res.External = err == nil
		if err != nil {
			res.Error = "Start mit Administratorrechten abgebrochen oder fehlgeschlagen"
			res.Output = strings.TrimSpace(string(out))
			res.ExitCode = exitCode(err)
		} else {
			res.Output = "Befehl in einem eigenen Fenster mit Administratorrechten gestartet. Die Ausgabe steht dort."
		}
		return
	}
	var c *exec.Cmd
	if shell == "powershell" {
		c = execx.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodePS(psScript(r.Command)))
	} else {
		c = execx.CommandContext(ctx, "cmd.exe")
		// Befehlszeile unverändert an cmd übergeben (sonst zerlegt Go die Anführungszeichen)
		c.SysProcAttr.CmdLine = `cmd.exe /d /s /c "chcp 65001>nul & ` + r.Command + `"`
	}
	var buf bytes.Buffer
	c.Stdout, c.Stderr = &buf, &buf
	err := c.Run()
	res.Output = strings.TrimRight(decodeOutput(buf.Bytes()), "\r\n")
	res.ExitCode = exitCode(err)
	if err != nil && res.ExitCode == -1 && ctx.Err() == nil {
		res.Error = err.Error()
	}
}

func exitCode(err error) int {
	if err == nil {
		return 0
	}
	var ee *exec.ExitError
	if errors.As(err, &ee) {
		if st, ok := ee.Sys().(syscall.WaitStatus); ok {
			return int(st.ExitCode)
		}
		return ee.ExitCode()
	}
	return -1
}

// Open startet ein erlaubtes Ziel (Einstellungsseite, Konsole, Systemsteuerung).
func Open(target string, args []string) error {
	if !ValidOpen(target, args) {
		return ErrNotAllowed
	}
	t := strings.TrimSpace(target)
	lt := strings.ToLower(t)
	// Kein execx.Command: dessen HideWindow würde grafische Programme unsichtbar starten
	var c *exec.Cmd
	switch {
	case reURI.MatchString(t):
		c = exec.Command("explorer.exe", t)
	case reMSC.MatchString(lt):
		c = exec.Command("mmc.exe", lt)
	case reCPL.MatchString(lt):
		c = exec.Command("control.exe", lt)
	default:
		c = exec.Command(strings.TrimSuffix(lt, ".exe")+".exe", args...)
	}
	return c.Start()
}
