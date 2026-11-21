package packages

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ChangeEntry ist eine Zeile im Session-Protokoll der Paketänderungen.
type ChangeEntry struct {
	Time    time.Time `json:"time"`
	Action  string    `json:"action"` // Installation, Update, Deinstallation, Pin, Pin gelöst
	Package string    `json:"package"`
	Before  string    `json:"before"`
	After   string    `json:"after"`
	Success bool      `json:"success"`
	Message string    `json:"message"`
}

const changelogHeader = "## Paketänderungen\n\n| Zeit | Aktion | Paket | Vorher | Nachher | Ergebnis |\n|---|---|---|---|---|---|\n"

// ChangelogPath liefert data/<Session>/software/changes.md.
func ChangelogPath(sessionPath string) string {
	return filepath.Join(sessionPath, "software", "changes.md")
}

// ActionLabel übersetzt eine Aktion für Protokoll und Bericht.
func ActionLabel(a Action) string {
	switch a {
	case ActionInstall:
		return "Installation"
	case ActionUpgrade, ActionUpgradeAll:
		return "Update"
	case ActionUninstall:
		return "Deinstallation"
	case ActionPin:
		return "Pin"
	case ActionUnpin:
		return "Pin gelöst"
	}
	return string(a)
}

// mdCell macht einen Wert tabellentauglich (keine Pipes, keine Umbrüche).
func mdCell(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "–"
	}
	s = strings.ReplaceAll(s, "|", "/")
	s = strings.ReplaceAll(s, "\r", " ")
	return strings.ReplaceAll(s, "\n", " ")
}

// AppendChange hängt eine Zeile an changes.md der Session an (Obsidian-kompatibel).
func AppendChange(sessionPath string, e ChangeEntry) error {
	if sessionPath == "" {
		return nil
	}
	p := ChangelogPath(sessionPath)
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}
	_, statErr := os.Stat(p)
	f, err := os.OpenFile(p, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer f.Close()
	if os.IsNotExist(statErr) {
		if _, err := f.WriteString(changelogHeader); err != nil {
			return err
		}
	}
	result := "✓"
	if !e.Success {
		result = "✗ " + e.Message
	} else if e.Message != "" && e.Message != "Erfolgreich" {
		result = "✓ " + e.Message
	}
	_, err = fmt.Fprintf(f, "| %s | %s | %s | %s | %s | %s |\n",
		e.Time.Format("15:04"), mdCell(e.Action), mdCell(e.Package), mdCell(e.Before), mdCell(e.After), mdCell(result))
	return err
}

// ReadChanges liest die Tabelle aus changes.md (für den HTML-Export).
func ReadChanges(sessionPath string) ([][]string, error) {
	f, err := os.Open(ChangelogPath(sessionPath))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	defer f.Close()
	var rows [][]string
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		l := strings.TrimSpace(sc.Text())
		if !strings.HasPrefix(l, "|") || strings.HasPrefix(l, "|---") || strings.HasPrefix(l, "| Zeit ") {
			continue
		}
		cells := strings.Split(strings.Trim(l, "|"), "|")
		for i := range cells {
			cells[i] = strings.TrimSpace(cells[i])
		}
		if len(cells) == 6 {
			rows = append(rows, cells)
		}
	}
	return rows, sc.Err()
}
