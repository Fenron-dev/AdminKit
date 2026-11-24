package werkzeug

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestImportFolder(t *testing.T) {
	root, src := t.TempDir(), t.TempDir()
	must := func(p, c string) { _ = os.MkdirAll(filepath.Dir(p), 0o755); _ = os.WriteFile(p, []byte(c), 0o644) }
	must(filepath.Join(src, "Netzwerk", "Router tauschen.md"), "---\ntags: [router]\n---\n# Schritte\n![[skizze.png|Plan]]\n![Bild](bilder/foto%20eins.jpg)\nSiehe [[Drucker einrichten|Drucker]] und [[run:ipconfig|IP]].\n![[Andere Notiz]]")
	must(filepath.Join(src, "attachments", "skizze.png"), "png")
	must(filepath.Join(src, "Netzwerk", "bilder", "foto eins.jpg"), "jpg")
	must(filepath.Join(src, "Ohne Ordner.md"), "Text")
	must(filepath.Join(src, ".obsidian", "x.md"), "intern")
	must(filepath.Join(src, "leer.md"), "  ")
	rep, err := ImportFolder(root, src, "T", false)
	if err != nil {
		t.Fatal(err)
	}
	if len(rep.Imported) != 2 || rep.Media != 2 {
		t.Fatalf("%+v", rep)
	}
	a, err := GetArticle(root, "router-tauschen")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"![[skizze.png|Plan]]", "![[foto-eins.jpg|Bild]]", "[Drucker](#/wiki/a/drucker-einrichten)", "[[run:ipconfig|IP]]", "![[Andere Notiz]]"} {
		if !strings.Contains(a.Body, want) {
			t.Errorf("fehlt %q in:\n%s", want, a.Body)
		}
	}
	if a.Kategorie != "Netzwerk" || len(a.Tags) != 1 {
		t.Errorf("Meta: %+v", a.ArticleMeta)
	}
	if b, _ := GetArticle(root, "ohne-ordner"); b == nil || b.Kategorie != "Import" {
		t.Error("Kategorie Import")
	}
	// zweiter Import überschreibt nicht
	rep2, _ := ImportFolder(root, src, "T", false)
	if len(rep2.Imported) != 0 || len(rep2.Skipped) < 2 {
		t.Errorf("zweiter Import: %+v", rep2)
	}
	rep3, _ := ImportFolder(root, src, "T", true)
	if len(rep3.Imported) != 2 {
		t.Errorf("Kopien: %+v", rep3)
	}
}
