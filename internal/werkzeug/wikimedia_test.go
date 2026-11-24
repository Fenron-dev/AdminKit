package werkzeug

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUploadAndServe(t *testing.T) {
	root := t.TempDir()
	u := NewUploads()
	if _, err := u.Begin(root, "artikel", "x.exe"); err == nil {
		t.Error(".exe angenommen")
	}
	if _, err := u.Begin(root, "../x", "a.mp4"); err == nil {
		t.Error("ungültiger Slug angenommen")
	}
	id, err := u.Begin(root, "artikel", "Mein Video.mp4")
	if err != nil {
		t.Fatal(err)
	}
	data := []byte(strings.Repeat("0123456789", 100))
	for i := 0; i < len(data); i += 300 {
		end := i + 300
		if end > len(data) {
			end = len(data)
		}
		if err := u.Chunk(id, base64.StdEncoding.EncodeToString(data[i:end])); err != nil {
			t.Fatal(err)
		}
	}
	rel, err := u.End(id)
	if err != nil || rel != "_medien/artikel/mein-video.mp4" {
		t.Fatalf("End: %q %v", rel, err)
	}
	// zweiter Upload gleichen Namens bekommt -2
	id2, _ := u.Begin(root, "artikel", "Mein Video.mp4")
	_ = u.Chunk(id2, base64.StdEncoding.EncodeToString([]byte("x")))
	if rel2, _ := u.End(id2); rel2 != "_medien/artikel/mein-video-2.mp4" {
		t.Errorf("Name: %q", rel2)
	}
	h := MediaHandler(func() string { return root })
	req := httptest.NewRequest(http.MethodGet, MediaPrefix+rel, nil)
	req.Header.Set("Range", "bytes=10-19")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusPartialContent || w.Body.String() != "0123456789" || w.Header().Get("Content-Type") != "video/mp4" {
		t.Errorf("Range: %d %q %q", w.Code, w.Body.String(), w.Header().Get("Content-Type"))
	}
	for _, bad := range []string{"../config.yaml", "_medien/../../config.yaml", "x.md", "_medien/artikel/.upload-x", "_medien/artikel/a.exe"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, MediaPrefix+bad, nil))
		if w.Code != http.StatusNotFound {
			t.Errorf("%q → %d", bad, w.Code)
		}
	}
	// Löschen des Artikels entfernt Medien
	_ = os.WriteFile(filepath.Join(wikiDir(root), "artikel.md"), []byte("---\ntitel: A\n---\nx"), 0o644)
	if err := DeleteArticle(root, "artikel"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(mediaDir(root, "artikel")); !os.IsNotExist(err) {
		t.Error("Medienordner nicht gelöscht")
	}
}

func TestUploadLimit(t *testing.T) {
	root := t.TempDir()
	u := NewUploads()
	id, _ := u.Begin(root, "a", "x.webm")
	u.m[id].size = MaxMediaSize
	if err := u.Chunk(id, base64.StdEncoding.EncodeToString([]byte("x"))); err == nil {
		t.Error("Grenze nicht geprüft")
	}
	if _, err := u.End(id); err == nil {
		t.Error("abgebrochener Upload abgeschlossen")
	}
}
