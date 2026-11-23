package netcheck

// Verbindungs-Langzeittest (#124): dauerhaft laufende ping-Prozesse je Ziel und
// ein DNS-Test (Zufallsname, damit kein Cache antwortet). Läuft im Hintergrund,
// bis Stop() oder die Höchstdauer erreicht ist. Nur lesend.

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"adminkit/internal/execx"
)

// MonTarget ist ein Messziel. Kind: "ping" oder "dns".
type MonTarget struct {
	ID    string `json:"id"`
	Kind  string `json:"kind"`
	Host  string `json:"host"`
	Label string `json:"label"`
}

// Sample ist eine Messung (T in Unix-Millisekunden).
type Sample struct {
	T  int64   `json:"t"`
	OK bool    `json:"ok"`
	Ms float64 `json:"ms"`
}

// MonitorStatus liefert Zustand und neue Messungen.
type MonitorStatus struct {
	Running bool                `json:"running"`
	Started int64               `json:"started"`
	Stopped int64               `json:"stopped"`
	Targets []MonTarget         `json:"targets"`
	Samples map[string][]Sample `json:"samples"`
	Error   string              `json:"error,omitempty"`
}

const maxSamples = 90000 // ~25 h bei 1/s

// Monitor verwaltet einen laufenden Test.
type Monitor struct {
	mu      sync.Mutex
	running bool
	started time.Time
	stopped time.Time
	targets []MonTarget
	samples map[string][]Sample
	cancel  context.CancelFunc
	lastErr string
}

var (
	reMs      = regexp.MustCompile(`(?i)(?:zeit|time)\s*[=<]\s*([\d.,]+)\s*ms`)
	reFail    = regexp.MustCompile(`(?i)zeit.{1,2}berschreitung|timed out|request timeout|nicht erreichbar|unreachable|allgemeiner fehler|general failure|.{1,2}bertragung fehlgeschlagen|transmit failed|no route|sendto:`)
	reHostArg = regexp.MustCompile(`^[A-Za-z0-9.:-]{1,253}$`)
)

// ParsePingLine wertet eine Ausgabezeile von ping aus (Windows/macOS, de/en).
func ParsePingLine(l string) (ok bool, ms float64, matched bool) {
	if m := reMs.FindStringSubmatch(l); m != nil && !reFail.MatchString(l) {
		v, _ := strconv.ParseFloat(strings.Replace(m[1], ",", ".", 1), 64)
		return true, v, true
	}
	if reFail.MatchString(l) {
		return false, 0, true
	}
	return false, 0, false
}

func (m *Monitor) add(id string, s Sample) {
	m.mu.Lock()
	defer m.mu.Unlock()
	l := append(m.samples[id], s)
	if len(l) > maxSamples {
		l = l[len(l)-maxSamples:]
	}
	m.samples[id] = l
}

// Start beginnt die Messung (maxMinutes 0 = 24 h).
func (m *Monitor) Start(targets []MonTarget, maxMinutes int) error {
	if len(targets) == 0 || len(targets) > 6 {
		return errors.New("1 bis 6 Ziele angeben")
	}
	for _, t := range targets {
		if t.Kind == "ping" && !reHostArg.MatchString(t.Host) {
			return errors.New("ungültiges Ziel: " + t.Host)
		}
	}
	if maxMinutes <= 0 || maxMinutes > 24*60 {
		maxMinutes = 24 * 60
	}
	m.mu.Lock()
	if m.running {
		m.mu.Unlock()
		return errors.New("Es läuft bereits ein Test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(maxMinutes)*time.Minute)
	m.running, m.started, m.stopped, m.targets, m.samples, m.cancel, m.lastErr = true, time.Now(), time.Time{}, targets, map[string][]Sample{}, cancel, ""
	m.mu.Unlock()
	var wg sync.WaitGroup
	for _, t := range targets {
		wg.Add(1)
		go func(t MonTarget) {
			defer wg.Done()
			if t.Kind == "dns" {
				m.runDNS(ctx, t)
			} else {
				m.runPing(ctx, t)
			}
		}(t)
	}
	go func() {
		wg.Wait()
		m.mu.Lock()
		m.running, m.stopped = false, time.Now()
		m.mu.Unlock()
	}()
	return nil
}

func (m *Monitor) runPing(ctx context.Context, t MonTarget) {
	args := []string{"-t", "-w", "1000", t.Host}
	if runtime.GOOS != "windows" {
		args = []string{"-i", "1", "-W", "1000", t.Host}
		if runtime.GOOS == "linux" {
			args = []string{"-i", "1", "-W", "1", t.Host}
		}
	}
	for ctx.Err() == nil {
		_, err := execx.Run(ctx, execx.Options{Timeout: 25 * time.Hour, OnLine: func(l string) {
			if ok, ms, hit := ParsePingLine(l); hit {
				m.add(t.ID, Sample{T: time.Now().UnixMilli(), OK: ok, Ms: ms})
			}
		}}, "ping", args...)
		if ctx.Err() != nil {
			return
		}
		// ping beendet (z. B. Netzwerk weg): als Ausfall zählen und neu starten
		m.add(t.ID, Sample{T: time.Now().UnixMilli()})
		if err != nil {
			m.mu.Lock()
			m.lastErr = err.Error()
			m.mu.Unlock()
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
		}
	}
}

func (m *Monitor) runDNS(ctx context.Context, t MonTarget) {
	domain := t.Host
	if domain == "" {
		domain = "google.de"
	}
	tick := time.NewTicker(5 * time.Second)
	defer tick.Stop()
	for {
		b := make([]byte, 6)
		_, _ = rand.Read(b)
		qctx, cancel := context.WithTimeout(ctx, 3*time.Second)
		start := time.Now()
		_, err := net.DefaultResolver.LookupHost(qctx, "ak"+hex.EncodeToString(b)+"."+domain)
		cancel()
		var de *net.DNSError
		ok := err == nil || (errors.As(err, &de) && de.IsNotFound) // NXDOMAIN = DNS hat geantwortet
		if ctx.Err() != nil {
			return
		}
		m.add(t.ID, Sample{T: time.Now().UnixMilli(), OK: ok, Ms: float64(time.Since(start).Microseconds()) / 1000})
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

// Stop beendet den Test.
func (m *Monitor) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cancel != nil {
		m.cancel()
	}
}

// Status liefert Messungen ab since (Unix-ms).
func (m *Monitor) Status(since int64) MonitorStatus {
	m.mu.Lock()
	defer m.mu.Unlock()
	st := MonitorStatus{Running: m.running, Targets: m.targets, Samples: map[string][]Sample{}, Error: m.lastErr}
	if !m.started.IsZero() {
		st.Started = m.started.UnixMilli()
	}
	if !m.stopped.IsZero() {
		st.Stopped = m.stopped.UnixMilli()
	}
	for id, l := range m.samples {
		i := len(l)
		for i > 0 && l[i-1].T > since {
			i--
		}
		st.Samples[id] = append([]Sample(nil), l[i:]...)
	}
	return st
}
