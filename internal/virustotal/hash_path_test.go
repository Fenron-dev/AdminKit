package virustotal

import (
	"os"
	"path/filepath"
	"testing"
)

// #96: Dateinamen mit Leerzeichen/„#“ dürfen nicht abgeschnitten werden.
func TestSHA256FileKeepsSpaces(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"Craft Docs 2.dmg", "# notiz.txt"} {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
		if _, err := SHA256File(p); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestSHA256FileAppBundle(t *testing.T) {
	app := filepath.Join(t.TempDir(), "My Tool.app")
	exeDir := filepath.Join(app, "Contents", "MacOS")
	os.MkdirAll(exeDir, 0o755)
	os.WriteFile(filepath.Join(exeDir, "My Tool"), []byte("bin"), 0o755)
	if _, err := SHA256File(app); err != nil {
		t.Fatalf("App-Paket: %v", err)
	}
	if _, err := SHA256File(t.TempDir()); err == nil {
		t.Error("normaler Ordner sollte einen Fehler liefern")
	}
}
