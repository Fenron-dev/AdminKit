package werkzeug

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStateRoundTrip(t *testing.T) {
	dir := t.TempDir()
	s, err := OpenState(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Set("pwOpts", `{"len":24,"mode":"phrase"}`); err != nil {
		t.Fatal(err)
	}
	if err := s.Set("bad key!", `1`); err == nil {
		t.Error("ungültiger Schlüssel muss abgelehnt werden")
	}
	if err := s.Set("x", `{kein json`); err == nil {
		t.Error("ungültiges JSON muss abgelehnt werden")
	}
	s2, _ := OpenState(dir)
	if string(s2.All()["pwOpts"]) != `{"len":24,"mode":"phrase"}` {
		t.Errorf("nicht gespeichert: %s", s2.All()["pwOpts"])
	}
	if err := s2.Set("pwOpts", "null"); err != nil || len(s2.All()) != 0 {
		t.Errorf("Löschen per null: %v %v", err, s2.All())
	}
}

func TestStateCorruptFileIsKept(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "werkzeug", "state.json")
	os.MkdirAll(filepath.Dir(p), 0755)
	os.WriteFile(p, []byte("{kaputt"), 0644)
	s, err := OpenState(dir)
	if err != nil || len(s.All()) != 0 {
		t.Fatalf("err=%v", err)
	}
	if _, err := os.Stat(p + ".defekt"); err != nil {
		t.Error("defekte Datei sollte beiseitegelegt werden")
	}
}
