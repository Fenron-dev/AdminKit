// Package packages verwaltet Software-Pakete über winget (Windows) und
// Homebrew (macOS) – Updates anzeigen/ausführen, suchen, installieren,
// entfernen und von Updates ausnehmen (Pin).
//
// Grundregeln (siehe Konzept „Paketverwaltung“):
//   - Keine Shell. Argumentlisten entstehen ausschließlich in Command().
//     Ausführung, Bestätigungsdialog und „Befehl kopieren“ nutzen dieselbe
//     Liste – es kann nie etwas anderes laufen als angezeigt.
//   - Paket-IDs werden vor jedem Aufruf per Regex geprüft.
//   - Online-Aktionen nur auf Klick, nie automatisch.
package packages

import "context"

// Source bezeichnet die Herkunft eines Pakets.
type Source string

const (
	SourceWinget   Source = "winget"
	SourceMSStore  Source = "msstore"
	SourceBrew     Source = "brew"      // Homebrew-Formel
	SourceBrewCask Source = "brew-cask" // Homebrew-Cask (Mac-App)
	SourceMAS      Source = "mas"       // Mac App Store
	SourceUnknown  Source = ""
)

// Action ist eine Paketaktion, für die Command() eine Argumentliste baut.
type Action string

const (
	ActionInstall    Action = "install"
	ActionUpgrade    Action = "upgrade"
	ActionUpgradeAll Action = "upgrade-all"
	ActionUninstall  Action = "uninstall"
	ActionPin        Action = "pin"
	ActionUnpin      Action = "unpin"
	ActionSearch     Action = "search"
	ActionOutdated   Action = "outdated"
)

// Package ist ein installiertes, aktualisierbares oder gefundenes Paket.
type Package struct {
	ID        string `json:"id"` // winget-ID bzw. brew-Name/-Token
	Name      string `json:"name"`
	Version   string `json:"version"`
	Available string `json:"available,omitempty"` // neuere Version, falls vorhanden
	Source    Source `json:"source"`
	Pinned    bool   `json:"pinned,omitempty"`
	// Truncated: winget hat die ID in der Tabelle mit „…“ gekürzt und sie
	// konnte nicht aufgelöst werden. Solche Pakete lassen sich nicht gezielt ansprechen.
	Truncated bool `json:"truncated,omitempty"`
	// AutoUpdates: Cask aktualisiert sich selbst (nur mit --greedy in der Update-Liste).
	AutoUpdates bool `json:"auto_updates,omitempty"`
	// ExplicitOnly: winget meldet ein Update, das nur gezielt (nicht per --all)
	// installiert werden kann, z. B. wegen Pin oder geänderter Installationstechnik.
	ExplicitOnly bool `json:"explicit_only,omitempty"`
}

// Status beschreibt den Paketmanager auf diesem Gerät.
type Status struct {
	Manager   string `json:"manager"`   // "winget" | "brew" | ""
	Available bool   `json:"available"` // Paketmanager gefunden und lauffähig
	Version   string `json:"version"`
	Path      string `json:"path"`
	// Hint: Erklärung, falls nicht verfügbar (inkl. Lösungsweg).
	Hint string `json:"hint,omitempty"`
	// InstallCommand: offizieller Installationsbefehl zum Kopieren (z. B. Homebrew).
	InstallCommand string `json:"install_command,omitempty"`
	// SupportsPin: Pin-Funktion verfügbar (winget ab 1.5, brew nur für Formeln).
	SupportsPin bool `json:"supports_pin"`
	// HasMAS: Mac-App-Store-CLI „mas“ vorhanden.
	HasMAS bool `json:"has_mas,omitempty"`
}

// Options steuert eine Paketaktion.
type Options struct {
	Silent bool   `json:"silent"`
	Scope  string `json:"scope"`  // "", "machine", "user" (winget)
	Greedy bool   `json:"greedy"` // brew: auch selbstaktualisierende Casks
	Cask   bool   `json:"cask"`   // brew: Paket ist ein Cask
	// Sources: erlaubte winget-Quellen (Standard: nur "winget").
	Sources []string `json:"sources,omitempty"`
}

// Result ist das Ergebnis einer einzelnen Paketaktion.
type Result struct {
	ID      string `json:"id"`
	Action  Action `json:"action"`
	Success bool   `json:"success"`
	Code    int64  `json:"code"`
	Message string `json:"message"` // verständliche Meldung
	Reboot  bool   `json:"reboot"`
	// NeedsTerminal: Aktion braucht eine Passworteingabe (brew-Cask mit .pkg)
	// und muss im Terminal laufen. Command enthält den Befehl zum Kopieren.
	NeedsTerminal bool   `json:"needs_terminal"`
	Canceled      bool   `json:"canceled"`
	Output        string `json:"output"`
	Command       string `json:"command"` // genau ausgeführter Befehl
	// Before/After: Versionen vor und nach der Aktion (sofern bekannt).
	Before string `json:"before,omitempty"`
	After  string `json:"after,omitempty"`
}

// Manager ist die gemeinsame Schnittstelle für winget und Homebrew.
type Manager interface {
	Name() string
	Status(ctx context.Context) Status
	Installed(ctx context.Context) ([]Package, error)
	Outdated(ctx context.Context, o Options) ([]Package, error)
	Search(ctx context.Context, query string, o Options) ([]Package, error)
	Install(ctx context.Context, id string, o Options, out func(string)) Result
	Upgrade(ctx context.Context, id string, o Options, out func(string)) Result
	UpgradeAll(ctx context.Context, o Options, out func(string)) Result
	Uninstall(ctx context.Context, id string, o Options, out func(string)) Result
	Pin(ctx context.Context, id string, pin bool, o Options) Result
	// Command liefert die Argumentliste (inkl. Programmpfad) für eine Aktion.
	Command(a Action, id string, o Options) ([]string, error)
}
