package werkzeug

// Wiki-Medien (#117): Videos, Audio, GIFs und Anhänge liegen als Dateien unter
// wiki/_medien/<slug>/ und werden über den Asset-Server der App gestreamt
// (/vaultmedia/wiki/…), nicht als data:-URI in den Artikel geladen.

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// MaxMediaSize begrenzt eine Mediendatei.
const MaxMediaSize = 500 << 20

// MediaExt: erlaubte Endungen → MIME-Typ.
var MediaExt = map[string]string{
	".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
	".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".oga": "audio/ogg", ".opus": "audio/ogg", ".wav": "audio/wav",
	".gif": "image/gif", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
	".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".log": "text/plain; charset=utf-8", ".zip": "application/zip",
}

func mediaDir(vaultRoot, slug string) string {
	return filepath.Join(wikiDir(vaultRoot), "_medien", slug)
}

// mediaName bildet einen sicheren, eindeutigen Dateinamen im Medienordner.
func mediaName(dir, name string) (string, error) {
	ext := strings.ToLower(filepath.Ext(name))
	if _, ok := MediaExt[ext]; !ok {
		return "", fmt.Errorf("Dateityp %q wird nicht unterstützt", ext)
	}
	base := Slugify(strings.TrimSuffix(filepath.Base(name), filepath.Ext(name)))
	if base == "" {
		base = "datei"
	}
	file := base + ext
	for n := 2; ; n++ {
		if _, err := os.Stat(filepath.Join(dir, file)); os.IsNotExist(err) {
			return file, nil
		}
		file = fmt.Sprintf("%s-%d%s", base, n, ext)
	}
}

// ImportMedia kopiert eine Datei (z. B. aus dem Dateidialog) in den Medienordner.
func ImportMedia(vaultRoot, slug, src string) (string, error) {
	if !reSlug.MatchString(slug) {
		return "", fmt.Errorf("ungültiger Artikelname")
	}
	st, err := os.Stat(src)
	if err != nil {
		return "", err
	}
	if st.Size() > MaxMediaSize {
		return "", fmt.Errorf("Datei größer als %d MB", MaxMediaSize>>20)
	}
	dir := mediaDir(vaultRoot, slug)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	file, err := mediaName(dir, filepath.Base(src))
	if err != nil {
		return "", err
	}
	in, err := os.Open(src)
	if err != nil {
		return "", err
	}
	defer in.Close()
	tmp := filepath.Join(dir, "."+file+".tmp")
	out, err := os.Create(tmp)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(tmp)
		return "", err
	}
	if err := out.Close(); err != nil {
		os.Remove(tmp)
		return "", err
	}
	if err := os.Rename(tmp, filepath.Join(dir, file)); err != nil {
		return "", err
	}
	return "_medien/" + slug + "/" + file, nil
}

// ── Hochladen in Stücken (Drag & Drop, Bildschirmaufnahmen) ─────────────────

type upload struct {
	dir, name, tmp string
	f              *os.File
	size           int64
	started        time.Time
}

// Uploads verwaltet laufende Uploads.
type Uploads struct {
	mu sync.Mutex
	m  map[string]*upload
}

// NewUploads legt die Verwaltung an.
func NewUploads() *Uploads { return &Uploads{m: map[string]*upload{}} }

// Begin startet einen Upload und liefert eine Kennung.
func (u *Uploads) Begin(vaultRoot, slug, name string) (string, error) {
	if !reSlug.MatchString(slug) {
		return "", fmt.Errorf("ungültiger Artikelname")
	}
	if _, ok := MediaExt[strings.ToLower(filepath.Ext(name))]; !ok {
		return "", fmt.Errorf("Dateityp %q wird nicht unterstützt", filepath.Ext(name))
	}
	dir := mediaDir(vaultRoot, slug)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	id := hex.EncodeToString(b)
	tmp := filepath.Join(dir, ".upload-"+id)
	f, err := os.Create(tmp)
	if err != nil {
		return "", err
	}
	u.mu.Lock()
	defer u.mu.Unlock()
	u.cleanup()
	u.m[id] = &upload{dir: dir, name: name, tmp: tmp, f: f, started: time.Now()}
	return id, nil
}

// Chunk hängt Base64-Daten an.
func (u *Uploads) Chunk(id, b64 string) error {
	u.mu.Lock()
	up := u.m[id]
	u.mu.Unlock()
	if up == nil {
		return fmt.Errorf("Upload unbekannt oder abgelaufen")
	}
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return err
	}
	if up.size+int64(len(data)) > MaxMediaSize {
		u.Abort(id)
		return fmt.Errorf("Datei größer als %d MB", MaxMediaSize>>20)
	}
	n, err := up.f.Write(data)
	up.size += int64(n)
	return err
}

// End schließt den Upload ab und liefert den relativen Pfad.
func (u *Uploads) End(id string) (string, error) {
	u.mu.Lock()
	up := u.m[id]
	delete(u.m, id)
	u.mu.Unlock()
	if up == nil {
		return "", fmt.Errorf("Upload unbekannt oder abgelaufen")
	}
	if err := up.f.Close(); err != nil {
		os.Remove(up.tmp)
		return "", err
	}
	if up.size == 0 {
		os.Remove(up.tmp)
		return "", fmt.Errorf("leere Datei")
	}
	file, err := mediaName(up.dir, up.name)
	if err != nil {
		os.Remove(up.tmp)
		return "", err
	}
	if err := os.Rename(up.tmp, filepath.Join(up.dir, file)); err != nil {
		return "", err
	}
	return "_medien/" + filepath.Base(up.dir) + "/" + file, nil
}

// Abort verwirft einen Upload.
func (u *Uploads) Abort(id string) {
	u.mu.Lock()
	up := u.m[id]
	delete(u.m, id)
	u.mu.Unlock()
	if up != nil {
		up.f.Close()
		os.Remove(up.tmp)
	}
}

// cleanup verwirft Uploads, die älter als eine Stunde sind (mu gehalten).
func (u *Uploads) cleanup() {
	for id, up := range u.m {
		if time.Since(up.started) > time.Hour {
			up.f.Close()
			os.Remove(up.tmp)
			delete(u.m, id)
		}
	}
}

// ── Ausliefern ──────────────────────────────────────────────────────────────

// MediaPrefix ist der URL-Pfad, unter dem Medien ausgeliefert werden.
const MediaPrefix = "/vaultmedia/wiki/"

// ResolveMedia prüft einen relativen Pfad (_medien/… oder _bilder/…) und liefert den Dateipfad.
func ResolveMedia(vaultRoot, rel string) (string, bool) {
	rel = path.Clean("/" + rel)[1:]
	if !(strings.HasPrefix(rel, "_medien/") || strings.HasPrefix(rel, "_bilder/")) || strings.Contains(rel, "..") {
		return "", false
	}
	if _, ok := MediaExt[strings.ToLower(path.Ext(rel))]; !ok {
		return "", false
	}
	if strings.HasPrefix(path.Base(rel), ".") {
		return "", false
	}
	return filepath.Join(wikiDir(vaultRoot), filepath.FromSlash(rel)), true
}

// MediaHandler liefert Medien des Wikis aus (mit Range-Anfragen für Video/Audio).
// root wird bei jeder Anfrage gelesen, da sich der Vault ändern kann.
func MediaHandler(root func() string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, MediaPrefix) || (r.Method != http.MethodGet && r.Method != http.MethodHead) {
			http.NotFound(w, r)
			return
		}
		vr := root()
		if vr == "" {
			http.NotFound(w, r)
			return
		}
		p, ok := ResolveMedia(vr, strings.TrimPrefix(r.URL.Path, MediaPrefix))
		if !ok {
			http.NotFound(w, r)
			return
		}
		f, err := os.Open(p)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer f.Close()
		st, err := f.Stat()
		if err != nil || st.IsDir() {
			http.NotFound(w, r)
			return
		}
		ct := MediaExt[strings.ToLower(filepath.Ext(p))]
		if ct == "" {
			ct = mime.TypeByExtension(filepath.Ext(p))
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		http.ServeContent(w, r, st.Name(), st.ModTime(), f)
	})
}
