package werkzeug

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEntriesRoundtrip(t *testing.T) {
	root := t.TempDir()
	got, err := LoadEntries(root, "tools")
	if err != nil || got != "{}" {
		t.Fatalf("leer: %q %v", got, err)
	}
	if err := SaveEntries(root, "tools", `{"version":1,"entries":[{"id":"a","name":"Ä"}]}`); err != nil {
		t.Fatal(err)
	}
	got, err = LoadEntries(root, "tools")
	if err != nil || !strings.Contains(got, `"name": "Ä"`) {
		t.Fatalf("gelesen: %q %v", got, err)
	}
}

func TestEntriesRejects(t *testing.T) {
	root := t.TempDir()
	for _, k := range []string{"../x", "", "A", "a/b", strings.Repeat("a", 33)} {
		if err := SaveEntries(root, k, `{}`); err == nil {
			t.Errorf("Art %q angenommen", k)
		}
	}
	for _, d := range []string{`[]`, `nope`, `"x"`} {
		if err := SaveEntries(root, "tools", d); err == nil {
			t.Errorf("Daten %q angenommen", d)
		}
	}
	if err := SaveEntries(root, "tools", `{"x":"`+strings.Repeat("a", maxEntriesSize)+`"}`); err == nil {
		t.Error("zu große Sammlung angenommen")
	}
	// Kaputte Datei wird gemeldet, nicht still durch {} ersetzt
	p := filepath.Join(root, "werkzeug", "eintraege", "kaputt.json")
	_ = os.MkdirAll(filepath.Dir(p), 0o755)
	_ = os.WriteFile(p, []byte("{kaputt"), 0o644)
	if _, err := LoadEntries(root, "kaputt"); err == nil {
		t.Error("kaputte Datei nicht gemeldet")
	}
}
