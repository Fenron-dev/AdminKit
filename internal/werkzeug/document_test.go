package werkzeug

import (
	"os"
	"strings"
	"testing"
	"time"
)

func TestBuildDocumentBrandingAndSanitizing(t *testing.T) {
	now := time.Date(2026, 11, 21, 10, 0, 0, 0, time.UTC)
	doc := BuildDocument(DocOptions{Title: "Sicher <im> Internet", BodyHTML: "<h2>Tipps</h2><script>alert(1)</script>",
		Company: "Muster & Co", Technician: "Dennis", Customer: "Frau Meyer", LogoURI: "javascript:x"}, now)
	for _, want := range []string{"Sicher &lt;im&gt; Internet", "Muster &amp; Co", "Für: Frau Meyer", "21.11.2026", "<h2>Tipps</h2>"} {
		if !strings.Contains(doc, want) {
			t.Errorf("fehlt: %s", want)
		}
	}
	if strings.Contains(doc, "<script>alert") || strings.Contains(doc, "javascript:x") {
		t.Error("Skript bzw. ungültiges Logo nicht entfernt")
	}
	p, err := WriteDocument(t.TempDir(), "ratgeber", DocOptions{Title: "Sicher im Internet!"}, now)
	if err != nil || !strings.HasSuffix(p, "ratgeber_sicher-im-internet_20261121_100000.html") {
		t.Errorf("Dateiname: %s %v", p, err)
	}
}

func TestWorklog(t *testing.T) {
	dir := t.TempDir()
	if err := AppendWork(dir, WorkItem{Time: time.Now(), Title: "Ratgeber übergeben", Detail: "Phishing, Passwörter"}); err != nil {
		t.Fatal(err)
	}
	AppendWork(dir, WorkItem{Title: "Einsatzdauer", Detail: "47 Min. = 5 AE"})
	items, err := ReadWork(dir)
	if err != nil || len(items) != 2 || items[1].Detail != "47 Min. = 5 AE" {
		t.Fatalf("%v %+v", err, items)
	}
	if AppendWork("", WorkItem{Title: "x"}) != nil {
		t.Error("ohne Session kein Fehler erwartet")
	}
	if _, err := os.Stat(dir + "/werkzeug/arbeiten.json"); err != nil {
		t.Error(err)
	}
}
