package diskscan

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func write(t *testing.T, p string, n int) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(strings.Repeat("x", n)), 0o644); err != nil {
		t.Fatal(err)
	}
}

func scanSync(t *testing.T, s *Scanner, root string) Status {
	t.Helper()
	done := make(chan Status, 1)
	if err := s.Start(root, func(st Status) { done <- st }); err != nil {
		t.Fatal(err)
	}
	select {
	case st := <-done:
		return st
	case <-time.After(30 * time.Second):
		t.Fatal("Scan hängt")
	}
	return Status{}
}

func TestScanAggregatesAndSorts(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "gross", "a.bin"), 300_000)
	write(t, filepath.Join(root, "gross", "tief", "b.bin"), 200_000)
	write(t, filepath.Join(root, "klein", "c.txt"), 10_000)
	write(t, filepath.Join(root, "datei.iso"), 400_000)
	os.Symlink(filepath.Join(root, "gross"), filepath.Join(root, "link")) // darf nicht doppelt zählen

	s := New()
	st := scanSync(t, s, root)
	if !st.Done || st.Files != 4 {
		t.Fatalf("Status: %+v", st)
	}
	d, err := s.Children(root, false, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Items) != 3 {
		t.Fatalf("Einträge: %+v", d.Items)
	}
	// datei.iso (400k) > gross (500k gesamt)? gross ist größer
	if d.Items[0].Name != "gross" || !d.Items[0].IsDir || d.Items[1].Name != "datei.iso" {
		t.Errorf("Sortierung: %v, %v", d.Items[0].Name, d.Items[1].Name)
	}
	if d.Items[0].Files != 2 || d.Items[0].Size < 500_000 {
		t.Errorf("Aggregation gross: %+v", d.Items[0])
	}
	sub, err := s.Children(filepath.Join(root, "gross"), false, 0)
	if err != nil || sub.Parent != root || len(sub.Items) != 2 {
		t.Fatalf("Drill-down: %+v %v", sub, err)
	}
	top, _ := s.TopFiles(2, false)
	if len(top) != 2 || top[0].Name != "datei.iso" || top[1].Name != "a.bin" {
		t.Errorf("Top-Dateien: %+v", top)
	}
	// Limit fasst Rest zusammen
	lim, _ := s.Children(root, false, 2)
	if n := len(lim.Items); n != 2 {
		t.Errorf("Limit: %d", n)
	}
	if last := lim.Items[1]; last.Rest != 2 {
		t.Errorf("Rest-Eintrag: %+v", last)
	}
}

func TestCancel(t *testing.T) {
	root := t.TempDir()
	for i := 0; i < 200; i++ {
		write(t, filepath.Join(root, "d", strings.Repeat("x", i%7+1), "f"+string(rune('a'+i%26))), 10)
	}
	s := New()
	done := make(chan Status, 1)
	if err := s.Start(root, func(st Status) { done <- st }); err != nil {
		t.Fatal(err)
	}
	if err := s.Start(root, nil); err != ErrBusy && err != nil {
		t.Errorf("zweiter Start: %v", err)
	}
	s.Cancel()
	st := <-done
	if st.Running {
		t.Error("läuft nach Abbruch weiter")
	}
}

func TestClassifier(t *testing.T) {
	mac := NewClassifier("darwin", "/Users/dennis")
	cases := map[string]Category{
		"/System/Library":                        CatSystem,
		"/Applications/Xcode.app":                CatApp,
		"/Users/dennis/Library/Caches/com.x":     CatCache,
		"/Users/dennis/Library/Mobile Documents": CatUser,
		"/Users/dennis/Downloads":                CatUser,
		"/private/var/folders/ab":                CatCache,
		"/private/etc":                           CatSystem,
		"/Systemfremd":                           "",
	}
	for p, want := range cases {
		if got := mac.Of(p); got != want {
			t.Errorf("mac %s: %q, erwartet %q", p, got, want)
		}
	}
	win := NewClassifier("windows", `D:\Users\Dennis`)
	wcases := map[string]Category{
		`d:\windows\system32`:                    CatSystem,
		`D:\Windows\Temp\x.tmp`:                  CatCache,
		`D:\Program Files\Foo`:                   CatApp,
		`D:\Users\Dennis\AppData\Local\Temp\a`:   CatCache,
		`D:\Users\Dennis\AppData\Roaming\Foo`:    CatApp,
		`D:\Users\Dennis\Documents\Rechnung.pdf`: CatUser,
	}
	for p, want := range wcases {
		if got := win.Of(p); got != want {
			t.Errorf("win %s: %q, erwartet %q", p, got, want)
		}
	}
}

func TestCacheByName(t *testing.T) {
	s := New()
	s.cls = NewClassifier("darwin", "/Users/dennis")
	if c := s.catOf("/Users/dennis/Library/Application Support/obsidian/Cache", CatApp); c != CatCache {
		t.Errorf("Cache in App-Daten: %q", c)
	}
	if c := s.catOf("/System/Library/Caches2/Cache", CatSystem); c != CatSystem {
		t.Errorf("System darf System bleiben: %q", c)
	}
}

func TestProtectedAndHotspots(t *testing.T) {
	s := New()
	s.rootPath = "/Users/dennis"
	s.home = "/Users/dennis"
	s.goos = "darwin"
	s.cls = NewClassifier("darwin", "/Users/dennis")
	for p, want := range map[string]bool{
		"/Users/dennis": true, "/Users": true, "/": true, "/Users/dennis/Downloads": true,
		"/Users/dennis/Downloads/setup.dmg": false, "/Users/dennis/Library/Caches/com.app": false,
	} {
		if got := s.protected(p, s.cls.Of(p)); got != want {
			t.Errorf("protected(%s) = %v", p, got)
		}
	}

	// Hotspots: großer Ordner mit vielen gleich großen Kindern wird gemeldet,
	// ein Ordner mit einem dominanten Kind wird übersprungen
	mb := int64(1 << 20)
	root := &node{name: "/Users/dennis", cat: CatUser}
	lib := &node{name: "Library", parent: root, cat: CatApp}
	caches := &node{name: "Caches", parent: lib, cat: CatCache}
	for i := 0; i < 5; i++ {
		caches.children = append(caches.children, &node{name: string(rune('a' + i)), parent: caches, cat: CatCache, own: 100 * mb})
	}
	lib.children = []*node{caches}
	movies := &node{name: "Movies", parent: root, cat: CatUser, own: 300 * mb}
	root.children = []*node{lib, movies}
	finalize(root)
	s.root = root
	hs, err := s.Hotspots(10)
	if err != nil {
		t.Fatal(err)
	}
	if len(hs) != 2 || hs[0].Path != "/Users/dennis/Library/Caches" || hs[1].Path != "/Users/dennis/Movies" {
		t.Errorf("Hotspots: %+v", hs)
	}
}
