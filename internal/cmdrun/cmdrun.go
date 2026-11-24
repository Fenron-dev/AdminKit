// Package cmdrun führt Befehle des Befehle-Starters (#110) aus: Einstellungen
// und Konsolen öffnen (nur erlaubte Ziele) sowie Befehle mit Ausgabe ausführen.
// Die Bestätigung verändernder Befehle erfolgt im Frontend.
package cmdrun

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf16"
)

// Request beschreibt einen auszuführenden Befehl.
type Request struct {
	Command    string `json:"command"`
	Shell      string `json:"shell"` // cmd, powershell, sh (leer = Standard der Plattform)
	Admin      bool   `json:"admin"`
	TimeoutSec int    `json:"timeout_sec"`
}

// Result ist das Ergebnis.
type Result struct {
	Output   string `json:"output"`
	ExitCode int    `json:"exit_code"`
	Millis   int64  `json:"millis"`
	TimedOut bool   `json:"timed_out"`
	External bool   `json:"external"` // in eigenem (Admin-)Fenster gestartet, keine Ausgabe
	Elevated bool   `json:"elevated"`
	Error    string `json:"error,omitempty"`
}

const maxOutput = 1 << 20

func timeout(sec int) time.Duration {
	switch {
	case sec <= 0:
		return 60 * time.Second
	case sec > 900:
		return 900 * time.Second
	}
	return time.Duration(sec) * time.Second
}

// Run führt den Befehl aus (plattformabhängig, siehe run_*.go).
func Run(ctx context.Context, r Request) *Result {
	res := &Result{}
	if strings.TrimSpace(r.Command) == "" {
		res.Error = "leerer Befehl"
		return res
	}
	if len(r.Command) > 8000 {
		res.Error = "Befehl zu lang"
		return res
	}
	ctx, cancel := context.WithTimeout(ctx, timeout(r.TimeoutSec))
	defer cancel()
	start := time.Now()
	run(ctx, r, res)
	res.Millis = time.Since(start).Milliseconds()
	if ctx.Err() == context.DeadlineExceeded {
		res.TimedOut = true
	}
	if len(res.Output) > maxOutput {
		res.Output = res.Output[:maxOutput] + "\n… (Ausgabe gekürzt)"
	}
	return res
}

// ── Öffnen ──────────────────────────────────────────────────────────────────

var (
	reURI     = regexp.MustCompile(`^(ms-settings:[a-z0-9-]*|windowsdefender:|x-apple\.systempreferences:[A-Za-z0-9._\-?=&]*)$`)
	reMSC     = regexp.MustCompile(`^[a-z0-9]+\.msc$`)
	reCPL     = regexp.MustCompile(`^[a-z0-9]+\.cpl$`)
	reMacApp  = regexp.MustCompile(`^app:[A-Za-z0-9 .'\-]{1,60}$`)
	reOpenArg = regexp.MustCompile(`^[/\-]?[A-Za-z0-9.:_]{1,60}$`)
	// Programme, die nur etwas anzeigen bzw. eine Verwaltungsoberfläche öffnen
	allowedExe = map[string]bool{
		"control": true, "msinfo32": true, "resmon": true, "perfmon": true, "taskmgr": true, "mstsc": true, "winver": true,
		"dxdiag": true, "cleanmgr": true, "msconfig": true, "optionalfeatures": true, "netplwiz": true, "regedit": true,
		"osk": true, "charmap": true, "rstrui": true, "systempropertiesadvanced": true, "systempropertiesprotection": true,
		"credwiz": true, "quickassist": true, "msra": true, "sndvol": true, "mdsched": true, "powershell": false, "cmd": false,
	}
)

// ErrNotAllowed: Ziel steht nicht auf der Liste der erlaubten Ziele.
var ErrNotAllowed = errors.New("dieses Ziel darf über „Öffnen“ nicht gestartet werden")

// ValidOpen prüft Ziel und Argumente gegen die erlaubten Muster.
func ValidOpen(target string, args []string) bool {
	if len(args) > 4 {
		return false
	}
	for _, a := range args {
		if !reOpenArg.MatchString(a) {
			return false
		}
	}
	t := strings.ToLower(strings.TrimSpace(target))
	switch {
	case reURI.MatchString(strings.TrimSpace(target)), reMacApp.MatchString(strings.TrimSpace(target)):
		return len(args) == 0
	case reMSC.MatchString(t), reCPL.MatchString(t):
		return len(args) == 0
	}
	return allowedExe[strings.TrimSuffix(t, ".exe")]
}

// decodeOutput erkennt UTF-16LE-Ausgaben (z. B. von sfc.exe) an vielen Nullbytes.
func decodeOutput(b []byte) string {
	if len(b) >= 4 && bytes.Count(b, []byte{0})*3 > len(b) {
		if len(b) >= 2 && b[0] == 0xFF && b[1] == 0xFE {
			b = b[2:]
		}
		u := make([]uint16, 0, len(b)/2)
		for i := 0; i+1 < len(b); i += 2 {
			u = append(u, uint16(b[i])|uint16(b[i+1])<<8)
		}
		return string(utf16.Decode(u))
	}
	return string(b)
}

// encodePS kodiert ein PowerShell-Skript für -EncodedCommand (UTF-16LE, Base64).
func encodePS(script string) string {
	u := utf16.Encode([]rune(script))
	b := make([]byte, len(u)*2)
	for i, v := range u {
		b[2*i], b[2*i+1] = byte(v), byte(v>>8)
	}
	return base64.StdEncoding.EncodeToString(b)
}

// appleScriptQuote setzt einen Text als AppleScript-String in Anführungszeichen.
func appleScriptQuote(s string) string {
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(s) + `"`
}
