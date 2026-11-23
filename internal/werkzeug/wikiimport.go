package werkzeug

// Wiki-Import (#133): Ordner mit Markdown-Dateien (z. B. Obsidian-Vault)
// übernehmen. Kategorie = erster Unterordner, Bilder/Medien werden zum Artikel
// kopiert, ![[…]] und ![](…) auf die Wiki-Ablage umgeschrieben, [[Notiz]] wird
// zum Wiki-Link. Vorhandene Artikel werden nie überschrieben.

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// ImportReport fasst den Import zusammen.
type ImportReport struct {
	Imported []string `json:"imported"`
	Skipped  []string `json:"skipped"`
	Media    int      `json:"media"`
	Errors   []string `json:"errors"`
}

var (
	reEmbed    = regexp.MustCompile(`!\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]`)
	reMdImg    = regexp.MustCompile(`!\[([^\]]*)\]\((?:<([^>]+)>|([^)\s]+))\)`)
	reWikiLink = regexp.MustCompile(`(^|[^!])\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]`)
)

const maxImportFiles = 2000

// ImportFolder importiert alle .md-Dateien unter dir. copies: bei gleichem Namen
// als Kopie anlegen statt überspringen.
func ImportFolder(vaultRoot, dir, autor string, copies bool) (*ImportReport, error) {
	st, err := os.Stat(dir)
	if err != nil || !st.IsDir() {
		return nil, fmt.Errorf("Ordner nicht gefunden")
	}
	if wr, _ := filepath.Abs(wikiDir(vaultRoot)); strings.HasPrefix(filepath.Clean(dir)+string(os.PathSeparator), wr+string(os.PathSeparator)) {
		return nil, fmt.Errorf("Das ist der Wiki-Ordner selbst")
	}
	var mdFiles []string
	assets := map[string]string{} // Dateiname (klein) → Pfad
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if p != dir && (strings.HasPrefix(d.Name(), ".") || d.Name() == "node_modules") {
				return filepath.SkipDir
			}
			return nil
		}
		ext := strings.ToLower(filepath.Ext(p))
		if ext == ".md" && len(mdFiles) < maxImportFiles {
			mdFiles = append(mdFiles, p)
		} else if _, ok := MediaExt[ext]; ok {
			if _, dup := assets[strings.ToLower(d.Name())]; !dup {
				assets[strings.ToLower(d.Name())] = p
			}
		}
		return nil
	})
	if len(mdFiles) == 0 {
		return nil, fmt.Errorf("Keine Markdown-Dateien (.md) gefunden")
	}
	rep := &ImportReport{}
	for _, f := range mdFiles {
		rel, _ := filepath.Rel(dir, f)
		raw, err := os.ReadFile(f)
		if err != nil || len(raw) > 2<<20 {
			rep.Errors = append(rep.Errors, rel+": nicht lesbar oder zu groß")
			continue
		}
		fm, body := splitFrontmatter(raw)
		title := fm.Titel
		if title == "" {
			title = strings.TrimSuffix(filepath.Base(f), filepath.Ext(f))
		}
		cat := fm.Kategorie
		if parts := strings.Split(filepath.ToSlash(rel), "/"); cat == "" && len(parts) > 1 {
			cat = parts[0]
		}
		if cat == "" {
			cat = "Import"
		}
		if strings.TrimSpace(body) == "" {
			rep.Skipped = append(rep.Skipped, rel+" (leer)")
			continue
		}
		if !copies {
			if _, err := os.Stat(filepath.Join(wikiDir(vaultRoot), Slugify(title)+".md")); err == nil {
				rep.Skipped = append(rep.Skipped, rel+" (gibt es schon)")
				continue
			}
		}
		art := &Article{ArticleMeta: ArticleMeta{Titel: title, Kategorie: cat, Tags: fm.Tags}, Body: body}
		slug, err := SaveArticle(vaultRoot, art, autor)
		if err != nil {
			rep.Errors = append(rep.Errors, rel+": "+err.Error())
			continue
		}
		newBody, n := rewriteImport(body, filepath.Dir(f), assets, func(src string) (string, error) { return ImportMedia(vaultRoot, slug, src) })
		rep.Media += n
		if newBody != body {
			art.Slug, art.Body = slug, newBody
			if _, err := SaveArticle(vaultRoot, art, autor); err != nil {
				rep.Errors = append(rep.Errors, rel+": "+err.Error())
			}
		}
		rep.Imported = append(rep.Imported, slug)
	}
	return rep, nil
}

// rewriteImport kopiert eingebettete Dateien und schreibt die Verweise um.
func rewriteImport(body, baseDir string, assets map[string]string, imp func(string) (string, error)) (string, int) {
	n := 0
	find := func(ref string) string {
		ref = strings.TrimSpace(ref)
		if p := filepath.Join(baseDir, filepath.FromSlash(ref)); fileExists(p) {
			return p
		}
		return assets[strings.ToLower(filepath.Base(filepath.FromSlash(ref)))]
	}
	copyRef := func(ref, alt, frag string) (string, bool) {
		src := find(ref)
		if src == "" {
			return "", false
		}
		rel, err := imp(src)
		if err != nil {
			return "", false
		}
		n++
		out := "![[" + filepath.Base(rel) + frag
		if alt != "" {
			out += "|" + alt
		}
		return out + "]]", true
	}
	body = reEmbed.ReplaceAllStringFunc(body, func(m string) string {
		g := reEmbed.FindStringSubmatch(m)
		if _, ok := MediaExt[strings.ToLower(filepath.Ext(g[1]))]; !ok {
			return m // Einbettung einer Notiz – bleibt als Text
		}
		if r, ok := copyRef(g[1], g[3], g[2]); ok {
			return r
		}
		return m
	})
	body = reMdImg.ReplaceAllStringFunc(body, func(m string) string {
		g := reMdImg.FindStringSubmatch(m)
		ref := g[2] + g[3]
		if strings.Contains(ref, "://") || strings.HasPrefix(ref, "data:") || strings.HasPrefix(ref, "_bilder/") || strings.HasPrefix(ref, "_medien/") {
			return m
		}
		if r, ok := copyRef(strings.ReplaceAll(ref, "%20", " "), g[1], ""); ok {
			return r
		}
		return m
	})
	body = reWikiLink.ReplaceAllStringFunc(body, func(m string) string {
		g := reWikiLink.FindStringSubmatch(m)
		if strings.HasPrefix(g[2], "run:") || strings.HasPrefix(g[2], "open:") || strings.HasPrefix(g[2], "cmd:") {
			return m // Aktionsknöpfe (#118) nicht anfassen
		}
		label := g[3]
		if label == "" {
			label = g[2]
		}
		return g[1] + "[" + label + "](#/wiki/a/" + Slugify(g[2]) + ")"
	})
	return body, n
}

func fileExists(p string) bool { st, err := os.Stat(p); return err == nil && !st.IsDir() }
