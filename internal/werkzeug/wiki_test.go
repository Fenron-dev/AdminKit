package werkzeug

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWikiSeedsAndNeverOverwrite(t *testing.T) {
	dir := t.TempDir()
	n, err := SyncWikiSeeds(dir)
	if err != nil || n != 8 {
		t.Fatalf("Startartikel: n=%d err=%v", n, err)
	}
	list, _ := ListArticles(dir)
	if len(list) != 8 || !list[0].Vorgabe {
		t.Fatalf("Liste: %+v", list)
	}
	a, err := GetArticle(dir, "passkeys-einfach-erklaert")
	if err != nil || a.Titel != "Passkeys einfach erklärt" || a.Kategorie != "Sicherheit" || !strings.Contains(a.Body, "```illustration") {
		t.Fatalf("Artikel: %v %+v", err, a.ArticleMeta)
	}
	// Ändern → zweiter Abgleich darf nichts überschreiben
	a.Body += "\nEigene Ergänzung"
	if _, err := SaveArticle(dir, a, "Dennis"); err != nil {
		t.Fatal(err)
	}
	if n, _ := SyncWikiSeeds(dir); n != 0 {
		t.Errorf("zweiter Abgleich schrieb %d Artikel", n)
	}
	b, _ := GetArticle(dir, "passkeys-einfach-erklaert")
	if !strings.Contains(b.Body, "Eigene Ergänzung") {
		t.Error("eigene Änderung überschrieben")
	}
	// Löschen → kommt nicht zurück
	if err := DeleteArticle(dir, "fernwartung-mit-pcvisit-starten"); err != nil {
		t.Fatal(err)
	}
	if n, _ := SyncWikiSeeds(dir); n != 0 {
		t.Error("gelöschter Startartikel ist zurückgekommen")
	}
}

func TestWikiUnchangedSeedGetsUpdated(t *testing.T) {
	dir := t.TempDir()
	SyncWikiSeeds(dir)
	// Simuliert alte Revision: Revision im Status herabsetzen
	p := seedStatePath(dir)
	b, _ := os.ReadFile(p)
	os.WriteFile(p, []byte(strings.Replace(string(b), "revision: 2", "revision: 1", 1)), 0644)
	if n, _ := SyncWikiSeeds(dir); n != 1 {
		t.Errorf("unveränderter Startartikel mit neuer Revision sollte aktualisiert werden, n=%d", n)
	}
}

func TestWikiArticleAndImages(t *testing.T) {
	dir := t.TempDir()
	slug, err := SaveArticle(dir, &Article{ArticleMeta: ArticleMeta{Titel: "Drucker im Büro Müller", Kategorie: "Kunden", Tags: []string{"drucker", " "}}, Body: "Text"}, "Dennis")
	if err != nil || slug != "drucker-im-buero-mueller" {
		t.Fatalf("%s %v", slug, err)
	}
	slug2, _ := SaveArticle(dir, &Article{ArticleMeta: ArticleMeta{Titel: "Drucker im Büro Müller", Kategorie: "Kunden"}, Body: "Text 2"}, "")
	if slug2 != "drucker-im-buero-mueller-2" {
		t.Errorf("eindeutiger Slug erwartet: %s", slug2)
	}
	png := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	rel, err := SaveImage(dir, slug, "Screenshot 1.png", png)
	if err != nil || rel != "_bilder/drucker-im-buero-mueller/screenshot-1.png" {
		t.Fatalf("%s %v", rel, err)
	}
	a, _ := GetArticle(dir, slug)
	a.Body = "![Drucker](" + rel + ")\n![böse](_bilder/../../config.yaml)"
	SaveArticle(dir, a, "")
	a, _ = GetArticle(dir, slug)
	if len(a.Images) != 1 || !strings.HasPrefix(a.Images[rel], "data:image/png;base64,") {
		t.Errorf("Bilder: %v", a.Images)
	}
	if a.Autor != "Dennis" || a.Erstellt.IsZero() {
		t.Errorf("Autor/Erstellt nicht erhalten: %+v", a)
	}
	if _, err := SaveImage(dir, slug, "x", "data:text/html;base64,PGI+"); err == nil {
		t.Error("nur Bilder erlaubt")
	}
	if _, err := GetArticle(dir, "../config"); err == nil {
		t.Error("Pfad-Ausbruch muss abgelehnt werden")
	}
	DeleteArticle(dir, slug)
	if _, err := os.Stat(filepath.Join(dir, "wiki", "_bilder", slug)); !os.IsNotExist(err) {
		t.Error("Bilder wurden nicht mitgelöscht")
	}
}
