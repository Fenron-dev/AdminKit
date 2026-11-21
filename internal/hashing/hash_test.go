package hashing

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestFileHashes(t *testing.T) {
	p := filepath.Join(t.TempDir(), "x.txt")
	os.WriteFile(p, []byte("abc"), 0644)
	var last int64
	got, err := File(context.Background(), p, nil, func(d, _ int64) { last = d })
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"SHA-256": "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		"SHA-1":   "a9993e364706816aba3e25717850c26c9cd0d89d",
		"MD5":     "900150983cd24fb0d6963f7d28e17f72",
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %s, want %s", k, got[k], v)
		}
	}
	if len(got["SHA-512"]) != 128 || last != 3 {
		t.Errorf("SHA-512/Fortschritt: %d %d", len(got["SHA-512"]), last)
	}
	if _, err := File(context.Background(), p, []string{"CRC"}, nil); err == nil {
		t.Error("unbekanntes Verfahren muss Fehler liefern")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := File(ctx, p, nil, nil); err == nil {
		t.Error("Abbruch erwartet")
	}
}
