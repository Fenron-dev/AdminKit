package werkzeug

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDocPathRejectsEscapes(t *testing.T) {
	dir := t.TempDir()
	for _, bad := range []string{"../x", "a/../../x", "/etc/passwd", `C:\Windows`, ".versteckt", "a/.git/config", "a//b"} {
		if _, err := DocPath(dir, bad); err == nil {
			t.Errorf("%q wurde akzeptiert", bad)
		}
	}
	p, err := DocPath(dir, "Kundendienst/Zettel.md")
	if err != nil || !strings.HasPrefix(p, DocsDir(dir)) {
		t.Errorf("gültiger Pfad abgelehnt: %v", err)
	}
}

func TestDocSeedsOnceAndCRUD(t *testing.T) {
	dir := t.TempDir()
	n, err := SyncDocSeeds(dir)
	if err != nil || n < 5 {
		t.Fatalf("Seeds: n=%d err=%v", n, err)
	}
	tree, err := ListDocs(dir)
	if err != nil || len(tree.Files) != n || len(tree.Folders) < 3 {
		t.Fatalf("Liste: %d Dateien, %d Ordner, err=%v", len(tree.Files), len(tree.Folders), err)
	}
	// Gelöschte Vorlage kommt nicht zurück
	first := tree.Files[0].Path
	if err := DeleteDoc(dir, first); err != nil {
		t.Fatal(err)
	}
	if n2, _ := SyncDocSeeds(dir); n2 != 0 {
		t.Errorf("Seeds erneut angelegt: %d", n2)
	}
	// Ordner anlegen, Datei speichern, umbenennen, nicht-leeren Ordner nicht löschen
	rel, err := CreateDocFolder(dir, "", "Angebote")
	if err != nil {
		t.Fatal(err)
	}
	if err := SaveDocText(dir, rel+"/Test.md", "Hallo {{Kunde}}"); err != nil {
		t.Fatal(err)
	}
	if err := DeleteDoc(dir, rel); err == nil {
		t.Error("nicht-leerer Ordner wurde gelöscht")
	}
	nrel, err := RenameDoc(dir, rel+"/Test.md", "Neu.md")
	if err != nil || nrel != "Angebote/Neu.md" {
		t.Fatalf("Umbenennen: %q %v", nrel, err)
	}
	if _, err := RenameDoc(dir, nrel, "../böse.md"); err == nil {
		t.Error("Name mit / akzeptiert")
	}
	if err := SaveDocText(dir, "Angebote/x.exe", "x"); err == nil {
		t.Error(".exe als Text gespeichert")
	}
	// Import: nie überschreiben
	src := filepath.Join(t.TempDir(), "Neu.md")
	os.WriteFile(src, []byte("x"), 0o644)
	out, err := ImportDocs(dir, "Angebote", []string{src})
	if err != nil || len(out) != 1 || out[0] != "Angebote/Neu (2).md" {
		t.Fatalf("Import: %v %v", out, err)
	}
}
