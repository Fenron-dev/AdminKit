package werkzeug

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// Wiki-Kategorien (#96): Kategorien ergeben sich aus den Artikeln, lassen
// sich aber auch vorab anlegen. Die selbst angelegten stehen in
// vault/wiki/_kategorien.yaml (bleibt auch ohne Artikel erhalten).

func wikiCatsPath(vaultRoot string) string { return filepath.Join(wikiDir(vaultRoot), "_kategorien.yaml") }

type wikiCatsFile struct {
	Kategorien []string `yaml:"kategorien"`
}

// WikiCategories liefert alle Kategorien (angelegte ∪ benutzte), sortiert.
func WikiCategories(vaultRoot string) ([]string, error) {
	set := map[string]bool{}
	if b, err := os.ReadFile(wikiCatsPath(vaultRoot)); err == nil {
		var f wikiCatsFile
		if err := yaml.Unmarshal(b, &f); err != nil {
			return nil, fmt.Errorf("_kategorien.yaml: %w", err)
		}
		for _, c := range f.Kategorien {
			if c = strings.TrimSpace(c); c != "" {
				set[c] = true
			}
		}
	}
	arts, err := ListArticles(vaultRoot)
	if err != nil {
		return nil, err
	}
	for _, a := range arts {
		if a.Kategorie != "" {
			set[a.Kategorie] = true
		}
	}
	out := make([]string, 0, len(set))
	for c := range set {
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i]) < strings.ToLower(out[j]) })
	return out, nil
}

// SaveWikiCategories speichert die angelegten Kategorien (1–40 Zeichen, ohne Doppelte).
func SaveWikiCategories(vaultRoot string, cats []string) error {
	seen := map[string]bool{}
	var clean []string
	for _, c := range cats {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if len([]rune(c)) > 40 || strings.ContainsAny(c, "\n\r") {
			return fmt.Errorf("Kategorie %q ungültig (1–40 Zeichen)", c)
		}
		if k := strings.ToLower(c); !seen[k] {
			seen[k] = true
			clean = append(clean, c)
		}
	}
	sort.Slice(clean, func(i, j int) bool { return strings.ToLower(clean[i]) < strings.ToLower(clean[j]) })
	if err := os.MkdirAll(wikiDir(vaultRoot), 0o755); err != nil {
		return err
	}
	data, err := yaml.Marshal(wikiCatsFile{Kategorien: clean})
	if err != nil {
		return err
	}
	p := wikiCatsPath(vaultRoot)
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, append([]byte("# Wiki-Kategorien, die auch ohne Artikel angezeigt werden (AdminKit).\n"), data...), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}
