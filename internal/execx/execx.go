// Package execx kapselt das Starten externer Programme für AdminKit.
//
// Ziele:
//   - Nie eine Shell: Programme werden immer mit einzelnen Argumenten gestartet.
//   - Jeder Aufruf hat einen Timeout und lässt sich über einen Context abbrechen.
//   - Ausgabe kann zeilenweise live weitergereicht werden (z. B. an Wails-Events).
//   - Unter Windows öffnet sich kein Konsolenfenster.
package execx

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// DefaultTimeout gilt für Run/Output, wenn Options.Timeout nicht gesetzt ist.
const DefaultTimeout = 2 * time.Minute

// Options steuert einen Programmaufruf.
type Options struct {
	// Timeout: 0 = DefaultTimeout, <0 = kein eigener Timeout (nur Context).
	Timeout time.Duration
	// Dir: Arbeitsverzeichnis (leer = aktuelles).
	Dir string
	// Env: zusätzliche Umgebungsvariablen ("KEY=VALUE"), ergänzt die Prozessumgebung.
	Env []string
	// Stdin: optionale Eingabe.
	Stdin io.Reader
	// OnLine: wird für jede Ausgabezeile (stdout und stderr) aufgerufen.
	// Fortschrittszeilen mit \r werden als einzelne Zeilen gemeldet.
	OnLine func(line string)
}

// Result beschreibt das Ergebnis eines Programmaufrufs.
type Result struct {
	Command  []string      `json:"command"`
	ExitCode int           `json:"exit_code"`
	Stdout   string        `json:"stdout"`
	Stderr   string        `json:"stderr"`
	Duration time.Duration `json:"duration"`
	TimedOut bool          `json:"timed_out"`
	Canceled bool          `json:"canceled"`
}

// Combined liefert stdout und stderr zusammen (stderr nur, falls nicht leer).
func (r *Result) Combined() string {
	out := strings.TrimRight(r.Stdout, "\r\n")
	if e := strings.TrimRight(r.Stderr, "\r\n"); e != "" {
		if out != "" {
			out += "\n"
		}
		out += e
	}
	return out
}

// ErrNotFound wird zurückgegeben, wenn das Programm nicht existiert.
var ErrNotFound = errors.New("programm nicht gefunden")

// Run startet name mit args und wartet auf das Ende.
// Ein Exit-Code ungleich 0 ist KEIN Fehler – er steht in Result.ExitCode.
// err ist nur gesetzt, wenn das Programm nicht gestartet werden konnte,
// abgebrochen wurde oder in den Timeout lief.
func Run(ctx context.Context, opts Options, name string, args ...string) (*Result, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	timeout := opts.Timeout
	if timeout == 0 {
		timeout = DefaultTimeout
	}
	var cancel context.CancelFunc = func() {}
	if timeout > 0 {
		ctx, cancel = context.WithTimeout(ctx, timeout)
	}
	defer cancel()

	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = opts.Dir
	if len(opts.Env) > 0 {
		cmd.Env = append(cmd.Environ(), opts.Env...)
	}
	cmd.Stdin = opts.Stdin
	hideWindow(cmd)
	// Kindprozesse nach dem Kill nicht ewig auf offene Pipes warten lassen.
	cmd.WaitDelay = 3 * time.Second

	res := &Result{Command: append([]string{name}, args...), ExitCode: -1}

	var stdout, stderr bytes.Buffer
	var wg sync.WaitGroup
	if opts.OnLine != nil {
		var mu sync.Mutex
		emit := func(line string) {
			mu.Lock()
			defer mu.Unlock()
			opts.OnLine(line)
		}
		outPipe, err := cmd.StdoutPipe()
		if err != nil {
			return res, err
		}
		errPipe, err := cmd.StderrPipe()
		if err != nil {
			return res, err
		}
		wg.Add(2)
		go func() { defer wg.Done(); scanLines(outPipe, &stdout, emit) }()
		go func() { defer wg.Done(); scanLines(errPipe, &stderr, emit) }()
	} else {
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr
	}

	start := time.Now()
	if err := cmd.Start(); err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return res, fmt.Errorf("%s: %w", name, ErrNotFound)
		}
		return res, err
	}
	wg.Wait()
	waitErr := cmd.Wait()
	res.Duration = time.Since(start)
	res.Stdout = stdout.String()
	res.Stderr = stderr.String()
	if cmd.ProcessState != nil {
		res.ExitCode = cmd.ProcessState.ExitCode()
	}

	switch {
	case errors.Is(ctx.Err(), context.DeadlineExceeded):
		res.TimedOut = true
		return res, fmt.Errorf("%s: Zeitüberschreitung nach %s", name, timeout)
	case errors.Is(ctx.Err(), context.Canceled):
		res.Canceled = true
		return res, fmt.Errorf("%s: abgebrochen", name)
	}
	var exitErr *exec.ExitError
	if waitErr != nil && !errors.As(waitErr, &exitErr) {
		return res, waitErr
	}
	return res, nil
}

// Output ist eine Kurzform von Run, die stdout liefert und einen Exit-Code
// ungleich 0 als Fehler behandelt (mit stderr in der Fehlermeldung).
func Output(ctx context.Context, timeout time.Duration, name string, args ...string) (string, error) {
	res, err := Run(ctx, Options{Timeout: timeout}, name, args...)
	if err != nil {
		return res.Stdout, err
	}
	if res.ExitCode != 0 {
		msg := strings.TrimSpace(res.Stderr)
		if msg == "" {
			msg = lastLine(res.Stdout)
		}
		return res.Stdout, fmt.Errorf("%s beendet mit Code %d: %s", name, res.ExitCode, msg)
	}
	return res.Stdout, nil
}

// QuoteArgs setzt eine Argumentliste für die Anzeige („Befehl kopieren“) zusammen.
// Argumente mit Leerzeichen oder Sonderzeichen werden in Anführungszeichen gesetzt.
func QuoteArgs(args []string) string {
	parts := make([]string, len(args))
	for i, a := range args {
		if a == "" || strings.ContainsAny(a, " \t\"'&|<>()$`;") {
			parts[i] = `"` + strings.ReplaceAll(a, `"`, `\"`) + `"`
		} else {
			parts[i] = a
		}
	}
	return strings.Join(parts, " ")
}

// scanLines liest r, schreibt alles in buf und meldet jede Zeile an emit.
// \r wird wie ein Zeilenende behandelt, damit Fortschrittsanzeigen nicht
// zu einer einzigen Riesenzeile verschmelzen.
func scanLines(r io.Reader, buf *bytes.Buffer, emit func(string)) {
	sc := bufio.NewScanner(io.TeeReader(r, buf))
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	sc.Split(splitCRLF)
	for sc.Scan() {
		emit(sc.Text())
	}
	// Bricht der Scanner ab (z. B. Zeile > 1 MB), Rest trotzdem in buf übernehmen.
	_, _ = io.Copy(buf, r)
}

// splitCRLF trennt an \n, \r\n und einzelnem \r.
func splitCRLF(data []byte, atEOF bool) (advance int, token []byte, err error) {
	if atEOF && len(data) == 0 {
		return 0, nil, nil
	}
	if i := bytes.IndexAny(data, "\r\n"); i >= 0 {
		adv := i + 1
		if data[i] == '\r' && i+1 < len(data) && data[i+1] == '\n' {
			adv++
		} else if data[i] == '\r' && i+1 == len(data) && !atEOF {
			// Möglicherweise folgt noch \n – mehr Daten anfordern.
			return 0, nil, nil
		}
		return adv, data[:i], nil
	}
	if atEOF {
		return len(data), data, nil
	}
	return 0, nil, nil
}

func lastLine(s string) string {
	s = strings.TrimRight(s, "\r\n ")
	if i := strings.LastIndexAny(s, "\r\n"); i >= 0 {
		return s[i+1:]
	}
	return s
}
