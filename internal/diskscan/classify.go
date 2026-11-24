// Package diskscan ist der Disk-Analyzer von AdminKit (#97): rekursiver
// Speicher-Scan in Go (kein du), Baum im Speicher, Lazy-Abfragen fürs
// Frontend, Top-Dateien und Einordnung in Kategorien.
package diskscan

import (
	"path/filepath"
	"strings"
)

// Category ordnet einen Pfad ein. Leer = vom Elternordner erben.
type Category string

const (
	CatSystem Category = "system" // Betriebssystem – nicht anfassen
	CatApp    Category = "app"    // installierte Programme
	CatCache  Category = "cache"  // Caches, Temp, Logs, Paket-Caches – meist löschbar
	CatUser   Category = "user"   // Benutzerdaten (Dokumente, Bilder, Downloads …)
	CatOther  Category = "other"
)

type rule struct {
	prefix string
	cat    Category
}

// rulesFor liefert die Präfix-Regeln (längster Treffer gewinnt).
// ~ steht für das Benutzerverzeichnis, %LOCALAPPDATA% usw. werden über home gebildet.
func rulesFor(goos, home string) []rule {
	h := func(p string) string { return joinFor(goos, home, p) }
	switch goos {
	case "windows":
		sys := []rule{
			{`C:\Windows`, CatSystem}, {`C:\Windows\Temp`, CatCache}, {`C:\Windows\SoftwareDistribution\Download`, CatCache},
			{`C:\Windows\Logs`, CatCache}, {`C:\Recovery`, CatSystem}, {`C:\System Volume Information`, CatSystem},
			{`C:\$Recycle.Bin`, CatCache}, {`C:\pagefile.sys`, CatSystem}, {`C:\hiberfil.sys`, CatSystem}, {`C:\swapfile.sys`, CatSystem},
			{`C:\Program Files`, CatApp}, {`C:\Program Files (x86)`, CatApp}, {`C:\ProgramData`, CatApp},
			{`C:\ProgramData\Package Cache`, CatCache}, {`C:\ProgramData\Microsoft\Windows\WER`, CatCache},
			{`C:\Users`, CatUser},
		}
		// Systemlaufwerk aus dem Benutzerverzeichnis ableiten (nicht immer C:)
		if len(home) >= 2 && home[1] == ':' && !strings.EqualFold(home[:2], "C:") {
			for i := range sys {
				sys[i].prefix = home[:2] + sys[i].prefix[2:]
			}
		}
		return append(sys,
			rule{h(`AppData\Local\Temp`), CatCache}, rule{h(`AppData\Local\Microsoft\Windows\INetCache`), CatCache},
			rule{h(`AppData\Local\Google\Chrome\User Data\Default\Cache`), CatCache}, rule{h(`AppData\Local\Microsoft\Edge\User Data\Default\Cache`), CatCache},
			rule{h(`AppData\Local\CrashDumps`), CatCache}, rule{h(`AppData\Local\npm-cache`), CatCache},
			rule{h(`AppData\Local\Programs`), CatApp}, rule{h(`AppData\Local\Microsoft\WindowsApps`), CatApp},
			rule{h(`AppData`), CatApp},
			rule{h(`Downloads`), CatUser}, rule{h(`Documents`), CatUser}, rule{h(`Desktop`), CatUser},
			rule{h(`Pictures`), CatUser}, rule{h(`Videos`), CatUser}, rule{h(`Music`), CatUser}, rule{h(`OneDrive`), CatUser},
		)
	default: // darwin (und linux als Annäherung)
		return []rule{
			{"/System", CatSystem}, {"/usr", CatSystem}, {"/bin", CatSystem}, {"/sbin", CatSystem}, {"/private", CatSystem},
			{"/private/var/folders", CatCache}, {"/private/var/log", CatCache}, {"/private/tmp", CatCache}, {"/private/var/vm", CatSystem},
			{"/Library", CatApp}, {"/Library/Caches", CatCache}, {"/Library/Logs", CatCache},
			{"/usr/local", CatApp}, {"/opt", CatApp}, {"/opt/homebrew", CatApp}, {"/Applications", CatApp},
			{"/Users", CatUser},
			{h("Library"), CatApp}, {h("Library/Caches"), CatCache}, {h("Library/Logs"), CatCache},
			{h("Library/Containers"), CatApp}, {h("Library/Application Support"), CatApp},
			{h("Library/Developer/Xcode/DerivedData"), CatCache}, {h("Library/Developer/CoreSimulator/Caches"), CatCache},
			{h("Library/Mobile Documents"), CatUser}, {h("Library/CloudStorage"), CatUser},
			{h(".Trash"), CatCache}, {h(".npm"), CatCache}, {h(".cache"), CatCache}, {h(".gradle/caches"), CatCache},
			{h("Applications"), CatApp},
		}
	}
}

func joinFor(goos, base, rel string) string {
	if goos == "windows" {
		return strings.TrimRight(base, `\`) + `\` + rel
	}
	return strings.TrimRight(base, "/") + "/" + rel
}

// Classifier ordnet Pfade nach den Regeln einer Plattform ein.
type Classifier struct {
	goos  string
	rules []rule
}

// NewClassifier baut die Regeln für goos und das Benutzerverzeichnis home.
func NewClassifier(goos, home string) *Classifier {
	return &Classifier{goos: goos, rules: rulesFor(goos, home)}
}

// Of liefert die Kategorie für path oder "" (dann gilt die des Elternordners).
// Windows: Groß-/Kleinschreibung egal; Laufwerksbuchstabe C: steht für das Systemlaufwerk.
func (c *Classifier) Of(path string) Category {
	p := path
	if c.goos == "windows" {
		p = strings.ToLower(filepath.Clean(p))
	}
	best, bestLen := Category(""), -1
	for _, r := range c.rules {
		rp := r.prefix
		if c.goos == "windows" {
			rp = strings.ToLower(rp)
		}
		if (p == rp || strings.HasPrefix(p, rp+sepFor(c.goos))) && len(rp) > bestLen {
			best, bestLen = r.cat, len(rp)
		}
	}
	return best
}

func sepFor(goos string) string {
	if goos == "windows" {
		return `\`
	}
	return "/"
}
