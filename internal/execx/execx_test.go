//go:build !windows

package execx

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestRunExitCodeIsNotError(t *testing.T) {
	res, err := Run(context.Background(), Options{}, "sh", "-c", "echo hallo; echo fehler >&2; exit 3")
	if err != nil {
		t.Fatalf("unerwarteter Fehler: %v", err)
	}
	if res.ExitCode != 3 {
		t.Errorf("ExitCode = %d, want 3", res.ExitCode)
	}
	if strings.TrimSpace(res.Stdout) != "hallo" || strings.TrimSpace(res.Stderr) != "fehler" {
		t.Errorf("stdout=%q stderr=%q", res.Stdout, res.Stderr)
	}
}

func TestRunStreamsLinesIncludingCR(t *testing.T) {
	var lines []string
	res, err := Run(context.Background(), Options{OnLine: func(l string) { lines = append(lines, l) }},
		"sh", "-c", `printf 'a\r\nb\rc\nd'`)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(lines, "|") != "a|b|c|d" {
		t.Errorf("lines = %q", lines)
	}
	if res.Stdout != "a\r\nb\rc\nd" {
		t.Errorf("Stdout = %q", res.Stdout)
	}
}

func TestRunTimeout(t *testing.T) {
	res, err := Run(context.Background(), Options{Timeout: 200 * time.Millisecond}, "sleep", "5")
	if err == nil || !res.TimedOut {
		t.Fatalf("Timeout erwartet, err=%v res=%+v", err, res)
	}
}

func TestRunCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(100 * time.Millisecond); cancel() }()
	res, err := Run(ctx, Options{OnLine: func(string) {}}, "sleep", "5")
	if err == nil || !res.Canceled {
		t.Fatalf("Abbruch erwartet, err=%v res=%+v", err, res)
	}
}

func TestRunNotFound(t *testing.T) {
	_, err := Run(context.Background(), Options{}, "gibt-es-nicht-adminkit")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("ErrNotFound erwartet, got %v", err)
	}
}

func TestOutputNonZero(t *testing.T) {
	_, err := Output(context.Background(), 0, "sh", "-c", "echo kaputt >&2; exit 1")
	if err == nil || !strings.Contains(err.Error(), "kaputt") {
		t.Fatalf("Fehler mit stderr erwartet, got %v", err)
	}
}

func TestQuoteArgs(t *testing.T) {
	got := QuoteArgs([]string{"winget", "install", "--id", "Mozilla.Firefox.de", "-e", "C:\\Program Files\\x"})
	want := `winget install --id Mozilla.Firefox.de -e "C:\Program Files\x"`
	if got != want {
		t.Errorf("got %q want %q", got, want)
	}
}
