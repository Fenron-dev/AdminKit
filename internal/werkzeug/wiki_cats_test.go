package werkzeug

import "testing"

func TestWikiCategories(t *testing.T) {
	dir := t.TempDir()
	if err := SaveWikiCategories(dir, []string{" Drucker ", "drucker", "Netzwerk", ""}); err != nil {
		t.Fatal(err)
	}
	if _, err := SaveArticle(dir, &Article{ArticleMeta: ArticleMeta{Titel: "Test", Kategorie: "Hosting"}, Body: "Hallo"}, "x"); err != nil {
		t.Fatal(err)
	}
	cats, err := WikiCategories(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(cats) != 3 || cats[0] != "Drucker" || cats[1] != "Hosting" || cats[2] != "Netzwerk" {
		t.Errorf("Kategorien: %v", cats)
	}
	if err := SaveWikiCategories(dir, []string{"viel zu lang viel zu lang viel zu lang xx"}); err == nil {
		t.Error("zu lange Kategorie akzeptiert")
	}
}
