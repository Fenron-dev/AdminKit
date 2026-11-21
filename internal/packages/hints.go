package packages

import (
	"regexp"
	"strings"
	"time"
)

// Hint ist ein automatisch erzeugter oder gepflegter Hinweis zu einem Paket.
type Hint struct {
	Level string `json:"level"` // "info" | "warn"
	Title string `json:"title"`
	Text  string `json:"text"`
}

var (
	reLocaleSuffix = regexp.MustCompile(`\.([a-z]{2,3}(-[A-Za-z]{2,4})?)$`)
	reESR          = regexp.MustCompile(`(?i)\.esr(\.|$)`)
	rePrerelease   = regexp.MustCompile(`(?i)beta|nightly|canary|preview|prerelease|insider|alpha|\bdev\b`)
	re32Bit        = regexp.MustCompile(`(?i)32-bit|\bx86\b`)
	reSystemTweak  = regexp.MustCompile(`(?i)privacy|debloat|tweak|optimi[sz]|fixer|cleaner|booster|registry|antispy|shutup`)
)

// HintInput bündelt alles, was die Regeln auswerten.
type HintInput struct {
	ID     string
	Name   string
	Tags   []string
	Source Source
	// Known: weitere bekannte Paket-IDs (z. B. aus der Suche) – für
	// Sprach- und 32-Bit-Varianten.
	Known      []string
	GitHub     *GitHubStats
	HasNote    bool
	Deprecated bool
	Disabled   bool
	// NoChecksum: Installer/Cask ohne Prüfsumme (sha256 no_check).
	NoChecksum bool
	Now        time.Time
}

// BuildHints wendet die Regeln aus dem Konzept an (identisch mit dem Ideler-Portal).
func BuildHints(in HintInput) []Hint {
	var h []Hint
	txt := strings.ToLower(in.ID + " " + in.Name + " " + strings.Join(in.Tags, " "))
	known := map[string]bool{}
	for _, k := range in.Known {
		known[strings.ToLower(k)] = true
	}
	if in.Now.IsZero() {
		in.Now = time.Now()
	}

	if in.Source == SourceWinget || in.Source == SourceMSStore || in.Source == "" {
		if m := reLocaleSuffix.FindStringSubmatch(in.ID); m != nil {
			base := in.ID[:len(in.ID)-len(m[0])]
			if known[strings.ToLower(base)] {
				h = append(h, Hint{"info", "Sprachversion „" + m[1] + "“",
					"Gleiches Programm in einer bestimmten Sprache. Basis-Paket ohne Sprachkürzel: " + base + " (meist Englisch)."})
			}
		}
		if reESR.MatchString(in.ID) {
			h = append(h, Hint{"info", "ESR-Version",
				"Extended Support Release: bekommt lange Sicherheitsupdates, neue Funktionen kommen seltener. Gedacht für Firmen, die Änderungen planbar halten wollen."})
		}
	}
	if rePrerelease.MatchString(in.ID + " " + in.Name) {
		h = append(h, Hint{"warn", "Vorabversion", "Kann Fehler enthalten. Nicht auf Kundengeräten einsetzen."})
	}
	if re32Bit.MatchString(in.ID + " " + in.Name) {
		norm := func(s string) string { return re32Bit.ReplaceAllString(strings.ToLower(s), "") }
		self := norm(in.ID)
		for k := range known {
			if k != strings.ToLower(in.ID) && norm(k) == self {
				h = append(h, Hint{"info", "32-Bit-Variante", "Auf aktuellen Windows-PCs normalerweise die 64-Bit-Variante wählen."})
				break
			}
		}
	}
	if reSystemTweak.MatchString(txt) {
		h = append(h, Hint{"warn", "Greift tief ins System ein",
			"Datenschutz-, Aufräum- und Optimierungswerkzeuge ändern Systemeinstellungen, Dienste oder die Registry. Vorher einen Wiederherstellungspunkt anlegen, nur bewusst einzelne Einstellungen ändern und Herkunft prüfen. Manche Änderungen stören Updates oder Systemfunktionen."})
	}
	if in.GitHub != nil {
		if in.GitHub.Archived || (!in.GitHub.PushedAt.IsZero() && in.Now.Sub(in.GitHub.PushedAt) > 2*365*24*time.Hour) {
			h = append(h, Hint{"warn", "Projekt wirkt verwaist",
				"Seit über zwei Jahren keine Änderungen oder archiviert. Sicherheitsprobleme werden dann eventuell nicht mehr behoben."})
		}
		if in.GitHub.Stars < 50 && !in.HasNote {
			h = append(h, Hint{"info", "Kleines Projekt",
				"Wenig verbreitet. Herkunft und Zweck genau prüfen, bevor es auf Kundengeräte kommt."})
		}
	}
	if in.Deprecated || in.Disabled {
		h = append(h, Hint{"warn", "Veraltet", "Wird von Homebrew nicht mehr gepflegt. Nach einer Alternative suchen."})
	}
	if in.NoChecksum {
		h = append(h, Hint{"info", "Keine Prüfsumme", "Der Download kann nicht per Hash geprüft werden (z. B. weil der Hersteller immer die neueste Version unter derselben Adresse anbietet)."})
	}
	return h
}
