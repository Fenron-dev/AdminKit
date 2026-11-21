package packages

import (
	"bufio"
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

//go:embed favorites_default.yaml
var defaultFavoritesYAML []byte

// Favorite beschreibt ein PROGRAMM mit der passenden Paket-ID je Plattform.
type Favorite struct {
	Name     string   `yaml:"name"                json:"name"`
	Winget   string   `yaml:"winget,omitempty"    json:"winget,omitempty"`
	Brew     string   `yaml:"brew,omitempty"      json:"brew,omitempty"`
	BrewCask string   `yaml:"brew_cask,omitempty" json:"brew_cask,omitempty"`
	Tags     []string `yaml:"tags,omitempty"      json:"tags,omitempty"`
	// Notiz: eigene Notiz, ersetzt die Vorgabe aus notes.yaml.
	Notiz string `yaml:"notiz,omitempty"     json:"notiz,omitempty"`
}

// Profile installiert mehrere Favoriten nacheinander – feste Liste und/oder über Tags.
type Profile struct {
	Name  string   `yaml:"name"            json:"name"`
	Items []string `yaml:"items,omitempty" json:"items,omitempty"` // Favoriten-Namen
	Tags  []string `yaml:"tags,omitempty"  json:"tags,omitempty"`
}

// Favorites ist der Inhalt von vault/packages/favorites.yaml.
type Favorites struct {
	Version   int        `yaml:"version"   json:"version"`
	Favorites []Favorite `yaml:"favorites" json:"favorites"`
	Profiles  []Profile  `yaml:"profiles"  json:"profiles"`
	// Updated: Zeitpunkt der letzten Änderung (für späteren Hub-Abgleich).
	Updated time.Time `yaml:"updated,omitempty" json:"updated,omitempty"`
}

// FavoritesPath liefert vault/packages/favorites.yaml.
func FavoritesPath(vaultRoot string) string {
	return filepath.Join(vaultRoot, "packages", "favorites.yaml")
}

// DefaultFavorites liefert den mitgelieferten Startbestand.
func DefaultFavorites() (*Favorites, error) {
	var f Favorites
	if err := yaml.Unmarshal(defaultFavoritesYAML, &f); err != nil {
		return nil, err
	}
	return &f, nil
}

// LoadFavorites liest die Favoriten. Fehlt die Datei, wird der Startbestand
// in den Vault geschrieben (seeded=true), damit alle denselben Stand haben.
func LoadFavorites(vaultRoot string) (f *Favorites, seeded bool, err error) {
	data, err := os.ReadFile(FavoritesPath(vaultRoot))
	if os.IsNotExist(err) {
		f, err = DefaultFavorites()
		if err != nil {
			return nil, false, err
		}
		return f, true, SaveFavorites(vaultRoot, f)
	}
	if err != nil {
		return nil, false, err
	}
	f = &Favorites{}
	if err := yaml.Unmarshal(data, f); err != nil {
		return nil, false, fmt.Errorf("favorites.yaml: %w", err)
	}
	return f, false, nil
}

// Validate prüft alle IDs und Namen.
func (f *Favorites) Validate() error {
	names := map[string]bool{}
	for i, fav := range f.Favorites {
		if strings.TrimSpace(fav.Name) == "" {
			return fmt.Errorf("Favorit %d hat keinen Namen", i+1)
		}
		if names[fav.Name] {
			return fmt.Errorf("Favorit „%s“ ist doppelt", fav.Name)
		}
		names[fav.Name] = true
		if fav.Winget == "" && fav.Brew == "" && fav.BrewCask == "" {
			return fmt.Errorf("Favorit „%s“: mindestens eine Paket-ID angeben", fav.Name)
		}
		if fav.Winget != "" {
			if err := ValidateID("winget", fav.Winget); err != nil {
				return fmt.Errorf("Favorit „%s“: %w", fav.Name, err)
			}
		}
		for _, id := range []string{fav.Brew, fav.BrewCask} {
			if id != "" {
				if err := ValidateID("brew", id); err != nil {
					return fmt.Errorf("Favorit „%s“: %w", fav.Name, err)
				}
			}
		}
	}
	for _, p := range f.Profiles {
		if strings.TrimSpace(p.Name) == "" {
			return fmt.Errorf("Profil ohne Namen")
		}
	}
	return nil
}

// SaveFavorites prüft und schreibt favorites.yaml (atomar über eine Temp-Datei).
func SaveFavorites(vaultRoot string, f *Favorites) error {
	if err := f.Validate(); err != nil {
		return err
	}
	f.Version = 1
	f.Updated = time.Now().UTC().Truncate(time.Second)
	for i := range f.Favorites {
		f.Favorites[i].Tags = cleanTags(f.Favorites[i].Tags)
		f.Favorites[i].Notiz = strings.TrimSpace(f.Favorites[i].Notiz)
	}
	data, err := yaml.Marshal(f)
	if err != nil {
		return err
	}
	header := []byte("# AdminKit-Favoriten: ein Eintrag = ein Programm, mit Paket-ID je Plattform.\n" +
		"# winget = Windows, brew = Homebrew-Formel, brew_cask = Mac-App. Pflege auch direkt in der App.\n")
	p := FavoritesPath(vaultRoot)
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, append(header, data...), 0644); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

func cleanTags(tags []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, t := range tags {
		t = strings.TrimSpace(t)
		if t != "" && !seen[strings.ToLower(t)] {
			seen[strings.ToLower(t)] = true
			out = append(out, t)
		}
	}
	return out
}

// IDFor liefert Paket-ID und Quelle für eine Plattform ("winget" | "brew").
func (fav Favorite) IDFor(manager string) (string, Source) {
	switch manager {
	case "winget":
		if fav.Winget != "" {
			return fav.Winget, SourceWinget
		}
	case "brew":
		if fav.BrewCask != "" {
			return fav.BrewCask, SourceBrewCask
		}
		if fav.Brew != "" {
			return fav.Brew, SourceBrew
		}
	}
	return "", ""
}

// ProfileFavorites löst ein Profil in Favoriten auf (Liste + Tags, ohne Doppelte).
func (f *Favorites) ProfileFavorites(name string) ([]Favorite, error) {
	var prof *Profile
	for i := range f.Profiles {
		if f.Profiles[i].Name == name {
			prof = &f.Profiles[i]
		}
	}
	if prof == nil {
		return nil, fmt.Errorf("Profil „%s“ nicht gefunden", name)
	}
	byName := map[string]Favorite{}
	for _, fav := range f.Favorites {
		byName[fav.Name] = fav
	}
	seen := map[string]bool{}
	var out []Favorite
	for _, n := range prof.Items {
		if fav, ok := byName[n]; ok && !seen[n] {
			seen[n] = true
			out = append(out, fav)
		}
	}
	tagSet := map[string]bool{}
	for _, t := range prof.Tags {
		tagSet[strings.ToLower(t)] = true
	}
	if len(tagSet) > 0 {
		for _, fav := range f.Favorites {
			for _, t := range fav.Tags {
				if tagSet[strings.ToLower(t)] && !seen[fav.Name] {
					seen[fav.Name] = true
					out = append(out, fav)
				}
			}
		}
	}
	return out, nil
}

// ── Import ──────────────────────────────────────────────────────────────────

// ImportResult beschreibt das Ergebnis eines Imports.
type ImportResult struct {
	Format  string `json:"format"`
	Added   int    `json:"added"`
	Updated int    `json:"updated"`
}

type portalFavorites struct {
	App       string `json:"app"`
	Type      string `json:"type"`
	Favorites []struct {
		ID   string   `json:"id"`
		Name string   `json:"name"`
		Tags []string `json:"tags"`
		Note string   `json:"note"`
	} `json:"favorites"`
}

var reBrewfileLine = regexp.MustCompile(`^\s*(brew|cask)\s+"([^"]+)"`)

// Import liest Portal-JSON, winget-Import-JSON oder ein Brewfile und führt die
// Einträge mit den vorhandenen Favoriten zusammen: Tags werden vereinigt,
// eine mitgebrachte Notiz ersetzt die vorhandene.
func (f *Favorites) Import(data []byte) (ImportResult, error) {
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	type item struct {
		winget, brew, cask, name, note string
		tags                           []string
	}
	var items []item
	res := ImportResult{}

	trim := bytes.TrimSpace(data)
	switch {
	case len(trim) > 0 && trim[0] == '{':
		var pf portalFavorites
		if err := json.Unmarshal(trim, &pf); err == nil && pf.Type == "winget-favoriten" {
			res.Format = "Ideler-Portal (mit Notizen und Tags)"
			for _, x := range pf.Favorites {
				items = append(items, item{winget: x.ID, name: x.Name, note: x.Note, tags: x.Tags})
			}
			break
		}
		ex, err := parseWingetExport(trim)
		if err != nil {
			return res, fmt.Errorf("unbekanntes JSON-Format: %w", err)
		}
		res.Format = "winget-Importdatei"
		for _, p := range ex {
			items = append(items, item{winget: p.ID})
		}
	default:
		sc := bufio.NewScanner(bytes.NewReader(data))
		for sc.Scan() {
			m := reBrewfileLine.FindStringSubmatch(sc.Text())
			if m == nil {
				continue
			}
			name := m[2] // Tap-Formeln (user/tap/name) behalten ihren vollen Namen
			if m[1] == "cask" {
				items = append(items, item{cask: name})
			} else {
				items = append(items, item{brew: name})
			}
		}
		if len(items) == 0 {
			return res, fmt.Errorf("keine Pakete erkannt (unterstützt: Ideler-Portal-JSON, winget-Importdatei, Brewfile)")
		}
		res.Format = "Brewfile"
	}

	for _, it := range items {
		idx := -1
		for i, fav := range f.Favorites {
			if (it.winget != "" && strings.EqualFold(fav.Winget, it.winget)) ||
				(it.brew != "" && fav.Brew == it.brew) || (it.cask != "" && fav.BrewCask == it.cask) {
				idx = i
				break
			}
		}
		if idx >= 0 {
			fav := &f.Favorites[idx]
			fav.Tags = cleanTags(append(fav.Tags, it.tags...))
			if strings.TrimSpace(it.note) != "" {
				fav.Notiz = strings.TrimSpace(it.note)
			}
			res.Updated++
			continue
		}
		name := it.name
		if name == "" {
			name = firstNonEmpty(it.winget, it.cask, it.brew)
		}
		name = f.uniqueName(name)
		f.Favorites = append(f.Favorites, Favorite{Name: name, Winget: it.winget, Brew: it.brew, BrewCask: it.cask,
			Tags: cleanTags(it.tags), Notiz: strings.TrimSpace(it.note)})
		res.Added++
	}
	return res, nil
}

func (f *Favorites) uniqueName(name string) string {
	used := map[string]bool{}
	for _, fav := range f.Favorites {
		used[fav.Name] = true
	}
	if !used[name] {
		return name
	}
	for i := 2; ; i++ {
		n := fmt.Sprintf("%s (%d)", name, i)
		if !used[n] {
			return n
		}
	}
}

func firstNonEmpty(v ...string) string {
	for _, s := range v {
		if s != "" {
			return s
		}
	}
	return ""
}

// ── Export ──────────────────────────────────────────────────────────────────

// ExportWingetJSON erzeugt eine Datei für `winget import`.
func (f *Favorites) ExportWingetJSON(now time.Time) ([]byte, error) {
	type pkg struct {
		PackageIdentifier string `json:"PackageIdentifier"`
	}
	var pkgs []pkg
	seen := map[string]bool{}
	for _, fav := range f.Favorites {
		if fav.Winget != "" && !seen[strings.ToLower(fav.Winget)] {
			seen[strings.ToLower(fav.Winget)] = true
			pkgs = append(pkgs, pkg{fav.Winget})
		}
	}
	sort.Slice(pkgs, func(i, j int) bool {
		return strings.ToLower(pkgs[i].PackageIdentifier) < strings.ToLower(pkgs[j].PackageIdentifier)
	})
	out := map[string]any{
		"$schema":      "https://aka.ms/winget-packages.schema.2.0.json",
		"CreationDate": now.Format("2006-01-02T15:04:05.000-07:00"),
		"Sources": []any{map[string]any{
			"Packages": pkgs,
			"SourceDetails": map[string]string{
				"Argument": "https://cdn.winget.microsoft.com/cache", "Identifier": "Microsoft.Winget.Source_8wekyb3d8bbwe",
				"Name": "winget", "Type": "Microsoft.PreIndexed.Package",
			},
		}},
		"WinGetVersion": "1.9.0",
	}
	return json.MarshalIndent(out, "", "  ")
}

// ExportBrewfile erzeugt ein Brewfile für `brew bundle`.
func (f *Favorites) ExportBrewfile() []byte {
	var b strings.Builder
	b.WriteString("# Brewfile aus AdminKit – installieren mit: brew bundle --file=Brewfile\n")
	for _, fav := range f.Favorites {
		if fav.Brew != "" {
			fmt.Fprintf(&b, "brew %q  # %s\n", fav.Brew, fav.Name)
		}
	}
	for _, fav := range f.Favorites {
		if fav.BrewCask != "" {
			fmt.Fprintf(&b, "cask %q  # %s\n", fav.BrewCask, fav.Name)
		}
	}
	return []byte(b.String())
}
