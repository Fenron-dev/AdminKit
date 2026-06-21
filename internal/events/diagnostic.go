package events

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

// DiagnosticOptions steuert den Diagnose-Scan.
type DiagnosticOptions struct {
	From          string // "2006-01-02 15:04:05", leer = letzte 7 Tage
	To            string // leer = jetzt
	ProcessFilter string // leer = alle Prozesse
	MaxClusters   int    // Maximalzahl Cluster, 0 = 15
}

// ErrorCluster fasst ähnliche Log-Meldungen zusammen.
type ErrorCluster struct {
	Pattern     string    `json:"pattern"`      // Normalisiertes Muster
	Count       int       `json:"count"`
	ProcessName string    `json:"process_name"`
	Subsystem   string    `json:"subsystem"`
	Example     string    `json:"example"`      // Konkrete Beispiel-Meldung
	FirstSeen   time.Time `json:"first_seen"`
	LastSeen    time.Time `json:"last_seen"`
	RiskScore   int       `json:"risk_score"`
}

// CrashReport beschreibt einen gefundenen Crash-Report.
type CrashReport struct {
	AppName   string    `json:"app_name"`
	Path      string    `json:"path"`
	Timestamp time.Time `json:"timestamp"`
	Summary   string    `json:"summary"` // Erste relevante Zeilen
}

// DiagnosticResult ist das vollständige Ergebnis eines Diagnose-Scans.
type DiagnosticResult struct {
	From          time.Time      `json:"from"`
	To            time.Time      `json:"to"`
	ProcessFilter string         `json:"process_filter"`
	TotalEvents   int            `json:"total_events"`
	Clusters      []ErrorCluster `json:"clusters"`
	CrashReports  []CrashReport  `json:"crash_reports"`
	MarkdownReport string        `json:"markdown_report"`
}

// clusterKey normalisiert eine Log-Meldung zu einem Cluster-Schlüssel.
// Ziel: gleiche Meldungen mit unterschiedlichen PIDs/Pfaden werden zusammengeführt.
func clusterKey(msg, processName string) string {
	key := msg
	// Pfade entfernen
	if idx := strings.Index(key, "file://"); idx >= 0 {
		end := strings.IndexAny(key[idx:], " '\"\n")
		if end > 0 {
			key = key[:idx] + "<path>" + key[idx+end:]
		}
	}
	// PIDs entfernen: [12345]
	for {
		start := strings.Index(key, "[")
		end := strings.Index(key, "]")
		if start < 0 || end < 0 || end <= start {
			break
		}
		inner := key[start+1 : end]
		allDigits := true
		for _, c := range inner {
			if c < '0' || c > '9' {
				allDigits = false
				break
			}
		}
		if allDigits && len(inner) > 2 {
			key = key[:start] + "[PID]" + key[end+1:]
		} else {
			break
		}
	}
	// Hex-Adressen normalisieren: 0x7f3a4b2c → 0x<addr>
	for {
		idx := strings.Index(key, "0x")
		if idx < 0 {
			break
		}
		end := idx + 2
		for end < len(key) && isHexChar(key[end]) {
			end++
		}
		if end-idx > 4 {
			key = key[:idx] + "0x<addr>" + key[end:]
		} else {
			break
		}
	}
	// Erste 120 Zeichen als Cluster-Key
	if len(key) > 120 {
		key = key[:120]
	}
	return processName + ":" + strings.TrimSpace(key)
}

func isHexChar(c byte) bool {
	return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

// BuildClusters gruppiert eine Liste von EventEntries nach Muster.
func BuildClusters(events []EventEntry) []ErrorCluster {
	type clusterData struct {
		cluster ErrorCluster
		key     string
	}
	byKey := map[string]*clusterData{}

	for _, e := range events {
		key := clusterKey(e.Message, e.ProcessName)
		if existing, ok := byKey[key]; ok {
			existing.cluster.Count++
			if e.Time.Before(existing.cluster.FirstSeen) {
				existing.cluster.FirstSeen = e.Time
			}
			if e.Time.After(existing.cluster.LastSeen) {
				existing.cluster.LastSeen = e.Time
				existing.cluster.Example  = e.Message
			}
			if e.RiskScore > existing.cluster.RiskScore {
				existing.cluster.RiskScore = e.RiskScore
			}
		} else {
			byKey[key] = &clusterData{
				key: key,
				cluster: ErrorCluster{
					Pattern:     key,
					Count:       1,
					ProcessName: e.ProcessName,
					Subsystem:   e.Subsystem,
					Example:     e.Message,
					FirstSeen:   e.Time,
					LastSeen:    e.Time,
					RiskScore:   e.RiskScore,
				},
			}
		}
	}

	clusters := make([]ErrorCluster, 0, len(byKey))
	for _, v := range byKey {
		clusters = append(clusters, v.cluster)
	}

	// Sortierung: erst nach Risiko, dann nach Häufigkeit
	sort.Slice(clusters, func(i, j int) bool {
		if clusters[i].RiskScore != clusters[j].RiskScore {
			return clusters[i].RiskScore > clusters[j].RiskScore
		}
		return clusters[i].Count > clusters[j].Count
	})
	return clusters
}

// BuildMarkdownReport erstellt einen strukturierten Bericht für Claude Code / Codex.
func BuildMarkdownReport(res *DiagnosticResult, sysName, sysVersion string) string {
	sb := &strings.Builder{}

	sb.WriteString("# Diagnose-Bericht für Claude Code / Codex\n\n")
	sb.WriteString("> Dieser Bericht wurde von AdminKit generiert.\n")
	sb.WriteString("> Bitte analysiere die folgenden Fehler-Muster und erkläre:\n")
	sb.WriteString("> 1. Welche Fehler durch meinen Code verursacht werden vs. normales System-Rauschen?\n")
	sb.WriteString("> 2. Was sind die wahrscheinlichsten Ursachen für die häufigsten Fehler?\n")
	sb.WriteString("> 3. Welche konkreten Code-Änderungen können die Fehler beheben?\n\n")
	sb.WriteString("---\n\n")

	sb.WriteString("## System-Info\n\n")
	fmt.Fprintf(sb, "- **Betriebssystem:** %s %s\n", sysName, sysVersion)
	fmt.Fprintf(sb, "- **Zeitraum:** %s – %s\n",
		res.From.Format("02.01.2006 15:04"),
		res.To.Format("02.01.2006 15:04"))
	if res.ProcessFilter != "" {
		fmt.Fprintf(sb, "- **Prozess-Filter:** `%s`\n", res.ProcessFilter)
	}
	fmt.Fprintf(sb, "- **Ereignisse gesamt:** %d\n", res.TotalEvents)
	fmt.Fprintf(sb, "- **Fehlermuster gefunden:** %d\n\n", len(res.Clusters))

	if len(res.CrashReports) > 0 {
		sb.WriteString("## Crash-Reports\n\n")
		for _, cr := range res.CrashReports {
			fmt.Fprintf(sb, "### %s — %s\n\n", cr.AppName, cr.Timestamp.Format("02.01.2006 15:04:05"))
			fmt.Fprintf(sb, "**Datei:** `%s`\n\n", cr.Path)
			if cr.Summary != "" {
				sb.WriteString("**Auszug:**\n```\n")
				sb.WriteString(cr.Summary)
				sb.WriteString("\n```\n\n")
			}
		}
	}

	sb.WriteString("## Fehlermuster (nach Risiko und Häufigkeit)\n\n")
	max := 20
	if len(res.Clusters) < max {
		max = len(res.Clusters)
	}
	for i, c := range res.Clusters[:max] {
		riskLabel := "Info"
		switch {
		case c.RiskScore >= 80: riskLabel = "🔴 Kritisch"
		case c.RiskScore >= 50: riskLabel = "🟠 Hoch"
		case c.RiskScore >= 20: riskLabel = "🟡 Mittel"
		case c.RiskScore >= 5:  riskLabel = "🔵 Niedrig"
		default:                riskLabel = "⚪ Info/Rauschen"
		}

		fmt.Fprintf(sb, "### %d. [%d×] %s\n\n", i+1, c.Count, shortenPattern(c.Pattern))
		fmt.Fprintf(sb, "- **Risiko:** %s (%d)\n", riskLabel, c.RiskScore)
		if c.ProcessName != "" {
			fmt.Fprintf(sb, "- **Prozess:** `%s`\n", c.ProcessName)
		}
		if c.Subsystem != "" {
			fmt.Fprintf(sb, "- **Subsystem:** `%s`\n", c.Subsystem)
		}
		fmt.Fprintf(sb, "- **Erste Meldung:** %s\n", c.FirstSeen.Format("02.01.2006 15:04:05"))
		fmt.Fprintf(sb, "- **Letzte Meldung:** %s\n\n", c.LastSeen.Format("02.01.2006 15:04:05"))
		sb.WriteString("**Beispiel-Meldung:**\n```\n")
		example := c.Example
		if len(example) > 500 {
			example = example[:500] + "…"
		}
		sb.WriteString(example)
		sb.WriteString("\n```\n\n")
	}

	if len(res.Clusters) > max {
		fmt.Fprintf(sb, "*… und %d weitere Muster (im vollständigen Bericht)*\n\n", len(res.Clusters)-max)
	}

	return sb.String()
}

func shortenPattern(pattern string) string {
	// Prozessname-Prefix entfernen (vor erstem ":")
	if idx := strings.Index(pattern, ":"); idx >= 0 && idx < 40 {
		pattern = pattern[idx+1:]
	}
	pattern = strings.TrimSpace(pattern)
	if len(pattern) > 80 {
		return pattern[:80] + "…"
	}
	return pattern
}
