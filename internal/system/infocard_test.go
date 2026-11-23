package system

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAnyDeskID(t *testing.T) {
	p := filepath.Join(t.TempDir(), "system.conf")
	_ = os.WriteFile(p, []byte("ad.x=1\nad.anynet.id=123456789\n"), 0o644)
	if got := anyDeskID(p); got != "123456789" {
		t.Errorf("ID: %q", got)
	}
	if anyDeskID(filepath.Join(t.TempDir(), "fehlt")) != "" {
		t.Error("fehlende Datei")
	}
}
