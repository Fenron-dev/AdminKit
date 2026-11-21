package werkzeug

import (
	_ "embed"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

//go:embed links_default.yaml
var defaultLinksYAML []byte

// Bereich gruppiert Links (z. B. „Support“, „Technik“).
type Bereich struct {
	ID           string `yaml:"id"                     json:"id"`
	Name         string `yaml:"name"                   json:"name"`
	Kurz         string `yaml:"kurz,omitempty"         json:"kurz,omitempty"`
	Icon         string `yaml:"icon,omitempty"         json:"icon,omitempty"`
	Beschreibung string `yaml:"beschreibung,omitempty" json:"beschreibung,omitempty"`
}

// Link ist ein Eintrag im Tab „Links“.
type Link struct {
	ID           string   `yaml:"id"                     json:"id"`
	Name         string   `yaml:"name"                   json:"name"`
	URL          string   `yaml:"url"                    json:"url"`
	Icon         string   `yaml:"icon,omitempty"         json:"icon,omitempty"`
	Beschreibung string   `yaml:"beschreibung,omitempty" json:"beschreibung,omitempty"`
	Bereiche     []string `yaml:"bereiche"               json:"bereiche"`
	// Eigen: in der App angelegt (nicht aus den mitgelieferten Links).
	Eigen bool `yaml:"eigen,omitempty" json:"eigen,omitempty"`
}

// Links ist der Inhalt von vault/links/links.yaml.
type Links struct {
	Version int `yaml:"version"  json:"version"`
	// Revision: zuletzt übernommene Revision der mitgelieferten Links.
	Revision int       `yaml:"revision" json:"revision"`
	Bereiche []Bereich `yaml:"bereiche" json:"bereiche"`
	Links    []Link    `yaml:"links"    json:"links"`
	// Entfernt: gelöschte mitgelieferte Links – kommen beim Abgleich nicht zurück.
	Entfernt []string  `yaml:"entfernt,omitempty" json:"entfernt,omitempty"`
	Updated  time.Time `yaml:"updated,omitempty"  json:"updated,omitempty"`
}

type seedLinks struct {
	Revision int       `yaml:"revision"`
	Bereiche []Bereich `yaml:"bereiche"`
	Links    []Link    `yaml:"links"`
}

// LinksPath liefert vault/links/links.yaml.
func LinksPath(vaultRoot string) string { return filepath.Join(vaultRoot, "links", "links.yaml") }

var reLinkID = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)

// LoadLinks lädt die Links und gleicht sie mit den mitgelieferten ab:
// fehlende Bereiche/Links werden ergänzt, bestehende nie überschrieben,
// gelöschte (Entfernt) nicht wiederhergestellt. changed=true → Datei neu geschrieben.
func LoadLinks(vaultRoot string) (l *Links, changed bool, err error) {
	var seed seedLinks
	if err := yaml.Unmarshal(defaultLinksYAML, &seed); err != nil {
		return nil, false, fmt.Errorf("links_default.yaml: %w", err)
	}
	l = &Links{Version: 1}
	data, err := os.ReadFile(LinksPath(vaultRoot))
	switch {
	case os.IsNotExist(err):
		changed = true
	case err != nil:
		return nil, false, err
	default:
		if err := yaml.Unmarshal(data, l); err != nil {
			return nil, false, fmt.Errorf("links.yaml: %w", err)
		}
	}
	if mergeSeed(l, &seed) {
		changed = true
	}
	if changed {
		if err := SaveLinks(vaultRoot, l); err != nil {
			return l, false, err
		}
	}
	return l, changed, nil
}

func mergeSeed(l *Links, seed *seedLinks) bool {
	changed := false
	haveB := map[string]bool{}
	for _, b := range l.Bereiche {
		haveB[b.ID] = true
	}
	for _, b := range seed.Bereiche {
		if !haveB[b.ID] {
			l.Bereiche = append(l.Bereiche, b)
			changed = true
		}
	}
	haveL := map[string]bool{}
	for _, x := range l.Links {
		haveL[x.ID] = true
	}
	removed := map[string]bool{}
	for _, id := range l.Entfernt {
		removed[id] = true
	}
	for _, x := range seed.Links {
		if !haveL[x.ID] && !removed[x.ID] {
			l.Links = append(l.Links, x)
			changed = true
		}
	}
	if l.Revision < seed.Revision {
		l.Revision = seed.Revision
		changed = true
	}
	return changed
}

// Validate prüft IDs, URLs und Bereichszuordnungen.
func (l *Links) Validate() error {
	bs := map[string]bool{}
	for _, b := range l.Bereiche {
		if !reLinkID.MatchString(b.ID) || strings.TrimSpace(b.Name) == "" {
			return fmt.Errorf("Bereich %q: ID oder Name ungültig", b.ID)
		}
		if bs[b.ID] {
			return fmt.Errorf("Bereich %q doppelt", b.ID)
		}
		bs[b.ID] = true
	}
	ids := map[string]bool{}
	for _, x := range l.Links {
		if !reLinkID.MatchString(x.ID) {
			return fmt.Errorf("Link-ID %q ungültig", x.ID)
		}
		if ids[x.ID] {
			return fmt.Errorf("Link-ID %q doppelt", x.ID)
		}
		ids[x.ID] = true
		if strings.TrimSpace(x.Name) == "" {
			return fmt.Errorf("Link %q ohne Namen", x.ID)
		}
		u, err := url.Parse(x.URL)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
			return fmt.Errorf("Link „%s“: nur http(s)-Adressen erlaubt", x.Name)
		}
		if len(x.Bereiche) == 0 {
			return fmt.Errorf("Link „%s“: mindestens einen Bereich wählen", x.Name)
		}
		for _, b := range x.Bereiche {
			if !bs[b] {
				return fmt.Errorf("Link „%s“: unbekannter Bereich %q", x.Name, b)
			}
		}
	}
	return nil
}

// SaveLinks prüft und schreibt links.yaml (atomar).
func SaveLinks(vaultRoot string, l *Links) error {
	if err := l.Validate(); err != nil {
		return err
	}
	l.Version = 1
	l.Updated = time.Now().UTC().Truncate(time.Second)
	data, err := yaml.Marshal(l)
	if err != nil {
		return err
	}
	header := []byte("# AdminKit-Links: Bereiche und Links für den Tab „Links“. Pflege auch direkt in der App.\n" +
		"# Mitgelieferte Links werden ergänzt, aber nie überschrieben. Gelöschte stehen unter „entfernt“.\n")
	p := LinksPath(vaultRoot)
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, append(header, data...), 0644); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

// DefaultLinkIDs liefert die IDs der mitgelieferten Links (für „Entfernt“).
func DefaultLinkIDs() map[string]bool {
	var seed seedLinks
	_ = yaml.Unmarshal(defaultLinksYAML, &seed)
	m := map[string]bool{}
	for _, x := range seed.Links {
		m[x.ID] = true
	}
	return m
}
