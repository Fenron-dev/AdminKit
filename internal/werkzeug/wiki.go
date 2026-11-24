package werkzeug

import (
	"bytes"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// Wiki-Artikel liegen als Markdown mit YAML-Frontmatter im Vault
// (vault/wiki/<slug>.md), Bilder als Dateien unter wiki/_bilder/<slug>/.
// Obsidian-kompatibel: Obsidian zeigt Text und Bilder ebenfalls an.

//go:embed wiki_seeds/*.md
var wikiSeedFS embed.FS

// ArticleMeta ist der Listeneintrag eines Artikels.
type ArticleMeta struct {
	Slug      string    `json:"slug"`
	Titel     string    `json:"titel"`
	Kategorie string    `json:"kategorie"`
	Tags      []string  `json:"tags"`
	Autor     string    `json:"autor"`
	Geaendert time.Time `json:"geaendert"`
	Auszug    string    `json:"auszug"`
	Vorgabe   bool      `json:"vorgabe"` // mitgelieferter Startartikel
}

// Article ist ein vollständiger Artikel. Images: relativer Pfad → data:-URI.
type Article struct {
	ArticleMeta
	Erstellt time.Time         `json:"erstellt"`
	Body     string            `json:"body"`
	Images   map[string]string `json:"images,omitempty"`
}

type frontmatter struct {
	Titel     string    `yaml:"titel"`
	Kategorie string    `yaml:"kategorie"`
	Tags      []string  `yaml:"tags,omitempty"`
	Autor     string    `yaml:"autor,omitempty"`
	Erstellt  time.Time `yaml:"erstellt,omitempty"`
	Geaendert time.Time `yaml:"geaendert,omitempty"`
	Revision  int       `yaml:"revision,omitempty"` // nur bei Startartikeln
}

var reSlug = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,80}$`)

// Slugify erzeugt einen Dateinamen aus einem Titel.
func Slugify(t string) string {
	t = strings.ToLower(t)
	t = strings.NewReplacer("ä", "ae", "ö", "oe", "ü", "ue", "ß", "ss").Replace(t)
	t = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(t, "-")
	t = strings.Trim(t, "-")
	if len(t) > 70 {
		t = strings.Trim(t[:70], "-")
	}
	if t == "" {
		t = "artikel"
	}
	return t
}

func wikiDir(vaultRoot string) string { return filepath.Join(vaultRoot, "wiki") }

func splitFrontmatter(data []byte) (frontmatter, string) {
	var fm frontmatter
	s := strings.ReplaceAll(string(data), "\r\n", "\n")
	if strings.HasPrefix(s, "---\n") {
		if end := strings.Index(s[4:], "\n---"); end >= 0 {
			_ = yaml.Unmarshal([]byte(s[4:4+end]), &fm)
			rest := s[4+end+4:]
			return fm, strings.TrimLeft(rest, "\n")
		}
	}
	return fm, s
}

func joinFrontmatter(fm frontmatter, body string) []byte {
	head, _ := yaml.Marshal(fm)
	return []byte("---\n" + string(head) + "---\n\n" + strings.TrimRight(body, "\n") + "\n")
}

var reMDNoise = regexp.MustCompile("(?s)```.*?```|!\\[[^\\]]*\\]\\([^)]*\\)|[#>*`|_~\\[\\]]")

func excerpt(body string) string {
	t := reMDNoise.ReplaceAllString(body, " ")
	t = regexp.MustCompile(`\(https?:[^)]+\)`).ReplaceAllString(t, "")
	t = strings.Join(strings.Fields(t), " ")
	if r := []rune(t); len(r) > 180 {
		t = string(r[:180]) + "…"
	}
	return t
}

// ── Startartikel ────────────────────────────────────────────────────────────

type seedState struct {
	Artikel  map[string]seedEntry `yaml:"artikel"`
	Entfernt []string             `yaml:"entfernt,omitempty"`
}

type seedEntry struct {
	Revision int    `yaml:"revision"`
	Hash     string `yaml:"hash"` // Inhalt beim Schreiben – zeigt, ob jemand den Artikel geändert hat
}

func seedStatePath(vaultRoot string) string {
	return filepath.Join(wikiDir(vaultRoot), ".startartikel.yaml")
}

func hashBytes(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:8]) }

// SyncWikiSeeds legt fehlende Startartikel an und aktualisiert unveränderte,
// wenn eine neuere Revision mitgeliefert wird. Geänderte oder gelöschte
// Artikel werden nie angefasst. Liefert die Zahl der geschriebenen Artikel.
func SyncWikiSeeds(vaultRoot string) (int, error) {
	dir := wikiDir(vaultRoot)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return 0, err
	}
	var st seedState
	if b, err := os.ReadFile(seedStatePath(vaultRoot)); err == nil {
		_ = yaml.Unmarshal(b, &st)
	}
	if st.Artikel == nil {
		st.Artikel = map[string]seedEntry{}
	}
	removed := map[string]bool{}
	for _, s := range st.Entfernt {
		removed[s] = true
	}
	entries, err := wikiSeedFS.ReadDir("wiki_seeds")
	if err != nil {
		return 0, err
	}
	written := 0
	now := time.Now().UTC().Truncate(time.Second)
	for _, e := range entries {
		slug := strings.TrimSuffix(e.Name(), ".md")
		if removed[slug] {
			continue
		}
		raw, _ := wikiSeedFS.ReadFile(path.Join("wiki_seeds", e.Name()))
		fm, body := splitFrontmatter(raw)
		p := filepath.Join(dir, slug+".md")
		cur, curErr := os.ReadFile(p)
		known, isKnown := st.Artikel[slug]
		switch {
		case os.IsNotExist(curErr) && !isKnown:
			// neu
		case curErr == nil && isKnown && hashBytes(cur) == known.Hash && fm.Revision > known.Revision:
			// unverändert und neuere Vorgabe → aktualisieren
		default:
			continue
		}
		fm.Erstellt, fm.Geaendert = now, now
		out := joinFrontmatter(fm, body)
		if err := os.WriteFile(p, out, 0644); err != nil {
			return written, err
		}
		st.Artikel[slug] = seedEntry{Revision: fm.Revision, Hash: hashBytes(out)}
		written++
	}
	if written > 0 {
		b, _ := yaml.Marshal(st)
		_ = os.WriteFile(seedStatePath(vaultRoot), append([]byte("# Verwaltet von AdminKit: mitgelieferte Startartikel. Nicht von Hand ändern.\n"), b...), 0644)
	}
	return written, nil
}

func seedSlugs(vaultRoot string) map[string]bool {
	var st seedState
	if b, err := os.ReadFile(seedStatePath(vaultRoot)); err == nil {
		_ = yaml.Unmarshal(b, &st)
	}
	m := map[string]bool{}
	for k := range st.Artikel {
		m[k] = true
	}
	return m
}

// ── Lesen & Schreiben ───────────────────────────────────────────────────────

// ListArticles liefert alle Artikel, zuletzt geänderte zuerst.
func ListArticles(vaultRoot string) ([]ArticleMeta, error) {
	entries, err := os.ReadDir(wikiDir(vaultRoot))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	seeds := seedSlugs(vaultRoot)
	var out []ArticleMeta
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		slug := strings.TrimSuffix(e.Name(), ".md")
		b, err := os.ReadFile(filepath.Join(wikiDir(vaultRoot), e.Name()))
		if err != nil {
			continue
		}
		fm, body := splitFrontmatter(b)
		m := metaFrom(slug, fm, body)
		m.Vorgabe = seeds[slug]
		if m.Geaendert.IsZero() {
			if info, err := e.Info(); err == nil {
				m.Geaendert = info.ModTime()
			}
		}
		out = append(out, m)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Geaendert.After(out[j].Geaendert) })
	return out, nil
}

func metaFrom(slug string, fm frontmatter, body string) ArticleMeta {
	t := fm.Titel
	if t == "" {
		t = slug
	}
	k := fm.Kategorie
	if k == "" {
		k = "Allgemein"
	}
	return ArticleMeta{Slug: slug, Titel: t, Kategorie: k, Tags: fm.Tags, Autor: fm.Autor, Geaendert: fm.Geaendert, Auszug: excerpt(body)}
}

var reImgRef = regexp.MustCompile(`!\[[^\]]*\]\((_bilder/[A-Za-z0-9._/-]+)\)`)

// GetArticle liest einen Artikel samt referenzierter Bilder (als data:-URI).
func GetArticle(vaultRoot, slug string) (*Article, error) {
	if !reSlug.MatchString(slug) {
		return nil, fmt.Errorf("ungültiger Artikelname")
	}
	b, err := os.ReadFile(filepath.Join(wikiDir(vaultRoot), slug+".md"))
	if err != nil {
		return nil, err
	}
	fm, body := splitFrontmatter(b)
	a := &Article{ArticleMeta: metaFrom(slug, fm, body), Erstellt: fm.Erstellt, Body: body, Images: map[string]string{}}
	a.Vorgabe = seedSlugs(vaultRoot)[slug]
	for _, m := range reImgRef.FindAllStringSubmatch(body, -1) {
		rel := m[1]
		if strings.Contains(rel, "..") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(wikiDir(vaultRoot), filepath.FromSlash(rel)))
		if err != nil || len(data) > 8<<20 {
			continue
		}
		a.Images[rel] = "data:" + imageMime(rel) + ";base64," + base64.StdEncoding.EncodeToString(data)
	}
	return a, nil
}

func imageMime(p string) string {
	switch strings.ToLower(filepath.Ext(p)) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	}
	return "image/webp"
}

// SaveArticle speichert einen Artikel. Leerer Slug = neuer Artikel (Slug aus Titel).
func SaveArticle(vaultRoot string, a *Article, autor string) (string, error) {
	a.Titel = strings.TrimSpace(a.Titel)
	a.Kategorie = strings.TrimSpace(a.Kategorie)
	if a.Titel == "" || a.Kategorie == "" {
		return "", fmt.Errorf("Titel und Kategorie fehlen noch")
	}
	if strings.TrimSpace(a.Body) == "" {
		return "", fmt.Errorf("der Artikel ist noch leer")
	}
	if len(a.Body) > 2<<20 {
		return "", fmt.Errorf("Artikel zu groß")
	}
	dir := wikiDir(vaultRoot)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	now := time.Now().UTC().Truncate(time.Second)
	fm := frontmatter{Titel: a.Titel, Kategorie: a.Kategorie, Autor: autor, Erstellt: now, Geaendert: now}
	for _, t := range a.Tags {
		if t = strings.TrimSpace(t); t != "" {
			fm.Tags = append(fm.Tags, t)
		}
	}
	slug := a.Slug
	if slug == "" {
		base := Slugify(a.Titel)
		slug = base
		for n := 2; ; n++ {
			if _, err := os.Stat(filepath.Join(dir, slug+".md")); os.IsNotExist(err) {
				break
			}
			slug = fmt.Sprintf("%s-%d", base, n)
		}
	} else {
		if !reSlug.MatchString(slug) {
			return "", fmt.Errorf("ungültiger Artikelname")
		}
		if old, err := os.ReadFile(filepath.Join(dir, slug+".md")); err == nil {
			ofm, _ := splitFrontmatter(old)
			if !ofm.Erstellt.IsZero() {
				fm.Erstellt = ofm.Erstellt
			}
			if ofm.Autor != "" && autor == "" {
				fm.Autor = ofm.Autor
			}
		}
	}
	tmp := filepath.Join(dir, "."+slug+".tmp")
	if err := os.WriteFile(tmp, joinFrontmatter(fm, a.Body), 0644); err != nil {
		return "", err
	}
	return slug, os.Rename(tmp, filepath.Join(dir, slug+".md"))
}

// DeleteArticle löscht Artikel und Bilder. Startartikel kommen danach nicht zurück.
func DeleteArticle(vaultRoot, slug string) error {
	if !reSlug.MatchString(slug) {
		return fmt.Errorf("ungültiger Artikelname")
	}
	if err := os.Remove(filepath.Join(wikiDir(vaultRoot), slug+".md")); err != nil {
		return err
	}
	_ = os.RemoveAll(filepath.Join(wikiDir(vaultRoot), "_bilder", slug))
	_ = os.RemoveAll(mediaDir(vaultRoot, slug))
	if seedSlugs(vaultRoot)[slug] {
		var st seedState
		if b, err := os.ReadFile(seedStatePath(vaultRoot)); err == nil {
			_ = yaml.Unmarshal(b, &st)
		}
		st.Entfernt = append(st.Entfernt, slug)
		delete(st.Artikel, slug)
		b, _ := yaml.Marshal(st)
		_ = os.WriteFile(seedStatePath(vaultRoot), append([]byte("# Verwaltet von AdminKit: mitgelieferte Startartikel. Nicht von Hand ändern.\n"), b...), 0644)
	}
	return nil
}

var reImgData = regexp.MustCompile(`^data:image/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$`)

// SaveImage legt ein Bild für einen Artikel ab und liefert den relativen Pfad
// für das Markdown (z. B. "_bilder/mein-artikel/bild-1.webp").
func SaveImage(vaultRoot, slug, name, dataURL string) (string, error) {
	if !reSlug.MatchString(slug) {
		return "", fmt.Errorf("ungültiger Artikelname")
	}
	m := reImgData.FindStringSubmatch(dataURL)
	if m == nil {
		return "", fmt.Errorf("nur PNG, JPEG, WebP oder GIF")
	}
	data, err := base64.StdEncoding.DecodeString(m[2])
	if err != nil {
		return "", err
	}
	if len(data) > 5<<20 {
		return "", fmt.Errorf("Bild größer als 5 MB")
	}
	ext := map[string]string{"png": ".png", "jpeg": ".jpg", "webp": ".webp", "gif": ".gif"}[m[1]]
	base := Slugify(strings.TrimSuffix(name, filepath.Ext(name)))
	dir := filepath.Join(wikiDir(vaultRoot), "_bilder", slug)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	file := base + ext
	for n := 2; ; n++ {
		existing, err := os.ReadFile(filepath.Join(dir, file))
		if os.IsNotExist(err) || bytes.Equal(existing, data) {
			break
		}
		file = fmt.Sprintf("%s-%d%s", base, n, ext)
	}
	if err := os.WriteFile(filepath.Join(dir, file), data, 0644); err != nil {
		return "", err
	}
	return "_bilder/" + slug + "/" + file, nil
}
