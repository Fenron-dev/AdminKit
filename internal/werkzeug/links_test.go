package werkzeug

import (
	"os"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// seedCounts liefert die Größe des mitgelieferten Startbestands.
func seedCounts(t *testing.T) (bereiche, links, rev int) {
	t.Helper()
	var s seedLinks
	if err := yaml.Unmarshal(defaultLinksYAML, &s); err != nil {
		t.Fatal(err)
	}
	return len(s.Bereiche), len(s.Links), s.Revision
}

func TestLinksSeedAndMerge(t *testing.T) {
	dir := t.TempDir()
	l, changed, err := LoadLinks(dir)
	if err != nil || !changed {
		t.Fatalf("Startbestand: changed=%v err=%v", changed, err)
	}
	nb, nl, rev := seedCounts(t)
	if len(l.Bereiche) != nb || len(l.Links) != nl || l.Revision != rev || nb < 10 || nl < 45 {
		t.Fatalf("Startbestand unvollständig: %d Bereiche, %d Links, rev %d", len(l.Bereiche), len(l.Links), l.Revision)
	}
	if _, err := os.Stat(LinksPath(dir)); err != nil {
		t.Fatal("links.yaml fehlt im Vault")
	}
	// Eigene Änderung + Löschen + eigener Link
	l.Links[0].Name = "Unsere Cloud"
	removedID := l.Links[1].ID
	l.Links = append(l.Links[:1], l.Links[2:]...)
	l.Entfernt = append(l.Entfernt, removedID)
	l.Links = append(l.Links, Link{ID: "kundenportal", Name: "Kundenportal", URL: "https://portal.example.org/", Bereiche: []string{"su"}, Eigen: true})
	if err := SaveLinks(dir, l); err != nil {
		t.Fatal(err)
	}
	l2, changed, err := LoadLinks(dir)
	if err != nil || changed {
		t.Fatalf("Zweiter Start darf nichts ändern: changed=%v err=%v", changed, err)
	}
	if l2.Links[0].Name != "Unsere Cloud" {
		t.Error("eigene Änderung wurde überschrieben")
	}
	for _, x := range l2.Links {
		if x.ID == removedID {
			t.Error("gelöschter Vorgabe-Link ist zurückgekommen")
		}
	}
	if l2.Links[len(l2.Links)-1].ID != "kundenportal" {
		t.Error("eigener Link fehlt")
	}
}

func TestLinksNewSeedEntriesAreAdded(t *testing.T) {
	dir := t.TempDir()
	// Simuliert einen älteren Stand mit nur einem Link
	os.MkdirAll(dir+"/links", 0755)
	os.WriteFile(LinksPath(dir), []byte("version: 1\nrevision: 0\nbereiche:\n  - {id: it, name: IT}\nlinks:\n  - {id: seafile, name: Cloud, url: 'https://x.example/', bereiche: [it]}\n"), 0644)
	l, changed, err := LoadLinks(dir)
	nb, nl, _ := seedCounts(t)
	if err != nil || !changed || len(l.Links) != nl || len(l.Bereiche) != nb {
		t.Fatalf("Abgleich: changed=%v err=%v links=%d bereiche=%d", changed, err, len(l.Links), len(l.Bereiche))
	}
	if l.Links[0].Name != "Cloud" || l.Bereiche[0].Name != "IT" {
		t.Error("bestehende Einträge wurden überschrieben")
	}
}

func TestLinksValidate(t *testing.T) {
	base := func() *Links {
		return &Links{Bereiche: []Bereich{{ID: "su", Name: "Support"}}, Links: []Link{{ID: "a", Name: "A", URL: "https://a.example/", Bereiche: []string{"su"}}}}
	}
	if err := base().Validate(); err != nil {
		t.Fatal(err)
	}
	cases := map[string]func(*Links){
		"javascript-URL":   func(l *Links) { l.Links[0].URL = "javascript:alert(1)" },
		"file-URL":         func(l *Links) { l.Links[0].URL = "file:///etc/passwd" },
		"ohne Bereich":     func(l *Links) { l.Links[0].Bereiche = nil },
		"falscher Bereich": func(l *Links) { l.Links[0].Bereiche = []string{"xx"} },
		"doppelte ID":      func(l *Links) { l.Links = append(l.Links, l.Links[0]) },
		"ungültige ID":     func(l *Links) { l.Links[0].ID = "Ä b" },
	}
	for name, mutate := range cases {
		l := base()
		mutate(l)
		if err := l.Validate(); err == nil {
			t.Errorf("%s: Fehler erwartet", name)
		} else if strings.TrimSpace(err.Error()) == "" {
			t.Errorf("%s: leere Fehlermeldung", name)
		}
	}
}
