package cmdrun

import (
	"context"
	"encoding/base64"
	"runtime"
	"strings"
	"testing"
)

func TestValidOpen(t *testing.T) {
	ok := map[string][]string{"ms-settings:windowsupdate": nil, "devmgmt.msc": nil, "ncpa.cpl": nil, "perfmon": {"/rel"}, "control": {"/name", "Microsoft.CredentialManager"},
		"x-apple.systempreferences:com.apple.Sound-Settings.extension": nil, "app:Disk Utility": nil, "windowsdefender:": nil}
	for tgt, a := range ok {
		if !ValidOpen(tgt, a) {
			t.Errorf("%q %v abgelehnt", tgt, a)
		}
	}
	bad := map[string][]string{"cmd": {"/c", "del"}, "powershell": nil, "c:\\x\\evil.exe": nil, "devmgmt.msc": {"x"}, "perfmon": {"/rel & calc"},
		"ms-settings:x & calc": nil, "app:Terminal; rm": nil, "file:///etc/passwd": nil, "http://x": nil}
	for tgt, a := range bad {
		if ValidOpen(tgt, a) {
			t.Errorf("%q %v angenommen", tgt, a)
		}
	}
}

func TestEncodeAndQuote(t *testing.T) {
	b, _ := base64.StdEncoding.DecodeString(encodePS("ä"))
	if len(b) != 2 || b[0] != 0xE4 || b[1] != 0 {
		t.Errorf("UTF-16LE falsch: %v", b)
	}
	if got := appleScriptQuote(`echo "a\b"`); got != `"echo \"a\\b\""` {
		t.Errorf("AppleScript: %s", got)
	}
}

func TestRunShell(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix-Test")
	}
	r := Run(context.Background(), Request{Command: "echo hallo; echo fehler 1>&2; exit 3"})
	if !strings.Contains(r.Output, "hallo") || !strings.Contains(r.Output, "fehler") || r.ExitCode != 3 {
		t.Errorf("Ergebnis: %+v", r)
	}
	r = Run(context.Background(), Request{Command: "sleep 3", TimeoutSec: 1})
	if !r.TimedOut {
		t.Errorf("Zeitlimit nicht erkannt: %+v", r)
	}
	if Run(context.Background(), Request{Command: "  "}).Error == "" {
		t.Error("leerer Befehl angenommen")
	}
}

func TestDecodeOutput(t *testing.T) {
	if got := decodeOutput([]byte{0xFF, 0xFE, 'O', 0, 'K', 0, 0xE4, 0}); got != "OKä" {
		t.Errorf("UTF-16: %q", got)
	}
	if got := decodeOutput([]byte("plain")); got != "plain" {
		t.Errorf("UTF-8: %q", got)
	}
}
