package packages

import (
	"os/exec"
	"strings"
)

var lookPath = exec.LookPath

// filterProgress reicht nur sinnvolle Zeilen weiter: keine Fortschrittsbalken,
// keine Spinner, keine Leerzeilen-Serien.
func filterProgress(out func(string)) func(string) {
	return func(line string) {
		line = reANSI.ReplaceAllString(line, "")
		t := strings.TrimSpace(line)
		if t == "" || reProgress.MatchString(t) || reSpinnerLn.MatchString(t) {
			return
		}
		out(strings.TrimRight(line, " "))
	}
}

// cleanOutput bereinigt eine komplette Ausgabe für Anzeige und Protokoll.
func cleanOutput(s string) string {
	lines := cleanWingetOutput(s)
	var b []string
	for _, l := range lines {
		if strings.TrimSpace(l) == "" && (len(b) == 0 || b[len(b)-1] == "") {
			continue
		}
		b = append(b, l)
	}
	return strings.TrimSpace(strings.Join(b, "\n"))
}

func lastLine(s string) string {
	s = strings.TrimRight(s, "\r\n ")
	if i := strings.LastIndexAny(s, "\r\n"); i >= 0 {
		return s[i+1:]
	}
	return s
}
