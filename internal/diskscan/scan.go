package diskscan

import (
	"container/heap"
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// node ist ein Verzeichnis im Scan-Baum. Dateien werden nicht einzeln
// gespeichert (Speicher!), sondern bei Bedarf frisch gelesen.
type node struct {
	name       string
	parent     *node
	children   []*node
	cat        Category
	own        int64 // Bytes der Dateien direkt in diesem Ordner
	ownFiles   int64
	size       int64 // gesamt (nach finalize)
	files      int64
	dirs       int64
	unreadable bool
}

// Item ist ein Eintrag in einer Ordnerliste (Ordner, Datei oder „weitere“).
type Item struct {
	Name     string   `json:"name"`
	Path     string   `json:"path"`
	Size     int64    `json:"size"`
	Files    int64    `json:"files"`
	Dirs     int64    `json:"dirs"`
	IsDir    bool     `json:"is_dir"`
	Category Category `json:"category"`
	Pct      float64  `json:"pct"`  // Anteil am angezeigten Ordner
	Rest     int      `json:"rest"` // >0: zusammengefasste weitere Einträge
	Locked   bool     `json:"locked,omitempty"`
}

// Dir ist der Inhalt eines Ordners für die Anzeige.
type Dir struct {
	Path       string   `json:"path"`
	Name       string   `json:"name"`
	Parent     string   `json:"parent"` // "" = Wurzel des Scans
	Size       int64    `json:"size"`
	Files      int64    `json:"files"`
	Dirs       int64    `json:"dirs"`
	Category   Category `json:"category"`
	Unreadable bool     `json:"unreadable"`
	Items      []Item   `json:"items"`
}

// FileEntry ist eine große Datei (Top-Liste).
type FileEntry struct {
	Path     string   `json:"path"`
	Name     string   `json:"name"`
	Size     int64    `json:"size"`
	Category Category `json:"category"`
}

// Status beschreibt den laufenden bzw. letzten Scan.
type Status struct {
	Running   bool   `json:"running"`
	Done      bool   `json:"done"`
	Canceled  bool   `json:"canceled"`
	Root      string `json:"root"`
	Bytes     int64  `json:"bytes"`
	Files     int64  `json:"files"`
	Dirs      int64  `json:"dirs"`
	Errors    int64  `json:"errors"` // nicht lesbare Ordner (Rechte)
	ElapsedMs int64  `json:"elapsed_ms"`
	// Volume des Scan-Ordners (für die Fortschrittsanzeige beim ganzen Laufwerk)
	VolumeTotal int64  `json:"volume_total"`
	VolumeFree  int64  `json:"volume_free"`
	WholeVolume bool   `json:"whole_volume"`
	Error       string `json:"error,omitempty"`
}

// Scanner hält einen Scan (einer zur Zeit) samt Ergebnis.
type Scanner struct {
	mu       sync.RWMutex
	cls      *Classifier
	home     string
	goos     string
	rootPath string
	root     *node
	status   Status
	cancel   context.CancelFunc
	started  time.Time

	bytes, files, dirs, errs atomic.Int64

	topMu  sync.Mutex
	top    fileHeap
	topMin atomic.Int64
	topN   int
}

// New erzeugt einen Scanner für das aktuelle System.
func New() *Scanner {
	home, _ := os.UserHomeDir()
	return &Scanner{cls: NewClassifier(runtime.GOOS, home), home: home, goos: runtime.GOOS, topN: 200}
}

// ErrBusy: es läuft bereits ein Scan.
var ErrBusy = errors.New("es läuft bereits eine Analyse")

// Start beginnt einen Scan von root im Hintergrund. done wird nach dem Ende
// (auch nach Abbruch) aufgerufen.
func (s *Scanner) Start(root string, done func(Status)) error {
	root = filepath.Clean(root)
	fi, err := os.Stat(root)
	if err != nil || !fi.IsDir() {
		return fmt.Errorf("Ordner nicht gefunden: %s", root)
	}
	s.mu.Lock()
	if s.status.Running {
		s.mu.Unlock()
		return ErrBusy
	}
	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	s.rootPath = root
	s.root = &node{name: root, cat: s.catOf(root, CatOther)}
	s.bytes.Store(0)
	s.files.Store(0)
	s.dirs.Store(0)
	s.errs.Store(0)
	s.top = nil
	s.topMin.Store(0)
	s.started = time.Now()
	s.status = Status{Running: true, Root: root}
	if t, f, err := VolumeSpace(root); err == nil {
		s.status.VolumeTotal, s.status.VolumeFree = t, f
	}
	s.status.WholeVolume = isVolumeRoot(root)
	rootNode := s.root
	s.mu.Unlock()

	go func() {
		var wg sync.WaitGroup
		sem := make(chan struct{}, 2*runtime.NumCPU())
		s.walk(ctx, rootNode, root, 0, sem, &wg)
		wg.Wait()
		finalize(rootNode)
		s.mu.Lock()
		s.status.Running = false
		s.status.Canceled = ctx.Err() != nil
		s.status.Done = !s.status.Canceled
		s.fillCounters(&s.status)
		st := s.status
		s.mu.Unlock()
		cancel()
		if done != nil {
			done(st)
		}
	}()
	return nil
}

func (s *Scanner) catOf(path string, inherit Category) Category {
	c := s.cls.Of(path)
	// Typische Cache-Ordner in App-Daten (Chromium/Electron, Shader, Temp …) –
	// nie innerhalb von Systembereichen
	if c != CatSystem && inherit != CatSystem && cacheNames[strings.ToLower(filepath.Base(path))] {
		return CatCache
	}
	if c != "" {
		return c
	}
	return inherit
}

var cacheNames = map[string]bool{"cache": true, "caches": true, "cache_data": true, "code cache": true, "gpucache": true,
	"cacheddata": true, "shadercache": true, "dawncache": true, "grshadercache": true, "temp": true, "tmp": true, "crashpad": true}

// skipDir: Pfade, die doppelt zählen oder keine echten Dateien sind.
func (s *Scanner) skipDir(path string) bool {
	switch s.goos {
	case "darwin":
		// /System/Volumes/Data ist über Firmlinks schon unter /Users, /Applications … enthalten
		switch path {
		case "/System/Volumes", "/Volumes", "/dev", "/net", "/home", "/automount":
			return true
		}
	case "linux":
		switch path {
		case "/proc", "/sys", "/dev", "/run":
			return true
		}
	}
	return false
}

func (s *Scanner) walk(ctx context.Context, n *node, path string, depth int, sem chan struct{}, wg *sync.WaitGroup) {
	if ctx.Err() != nil {
		return
	}
	entries, err := os.ReadDir(path)
	if err != nil {
		n.unreadable = true
		s.errs.Add(1)
		if len(entries) == 0 {
			return
		}
	}
	s.dirs.Add(1)
	for _, e := range entries {
		if ctx.Err() != nil {
			return
		}
		t := e.Type()
		// Symlinks, Windows-Junctions (ModeIrregular), Geräte usw. nicht verfolgen
		if t&(fs.ModeSymlink|fs.ModeIrregular|fs.ModeDevice|fs.ModeNamedPipe|fs.ModeSocket) != 0 {
			continue
		}
		full := filepath.Join(path, e.Name())
		if e.IsDir() {
			if s.skipDir(full) {
				continue
			}
			child := &node{name: e.Name(), parent: n, cat: s.catOf(full, n.cat)}
			n.children = append(n.children, child)
			// Obere Ebenen parallel, solange Worker frei sind
			if depth < 4 {
				select {
				case sem <- struct{}{}:
					wg.Add(1)
					go func(c *node, p string) {
						defer wg.Done()
						s.walk(ctx, c, p, depth+1, sem, wg)
						<-sem
					}(child, full)
					continue
				default:
				}
			}
			s.walk(ctx, child, full, depth+1, sem, wg)
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		sz := allocSize(info)
		n.own += sz
		n.ownFiles++
		s.bytes.Add(sz)
		s.files.Add(1)
		if sz > s.topMin.Load() {
			s.pushTop(FileEntry{Path: full, Name: e.Name(), Size: sz, Category: s.catOf(full, n.cat)})
		}
	}
}

// finalize summiert Größen von unten nach oben und sortiert die Kinder.
func finalize(n *node) {
	n.size, n.files, n.dirs = n.own, n.ownFiles, int64(len(n.children))
	for _, c := range n.children {
		finalize(c)
		n.size += c.size
		n.files += c.files
		n.dirs += c.dirs
	}
	sort.Slice(n.children, func(i, j int) bool { return n.children[i].size > n.children[j].size })
}

func (s *Scanner) fillCounters(st *Status) {
	st.Bytes, st.Files, st.Dirs, st.Errors = s.bytes.Load(), s.files.Load(), s.dirs.Load(), s.errs.Load()
	st.ElapsedMs = time.Since(s.started).Milliseconds()
}

// Cancel bricht einen laufenden Scan ab.
func (s *Scanner) Cancel() {
	s.mu.RLock()
	c := s.cancel
	s.mu.RUnlock()
	if c != nil {
		c()
	}
}

// Status liefert den aktuellen Stand (während des Scans live).
func (s *Scanner) Status() Status {
	s.mu.RLock()
	st := s.status
	s.mu.RUnlock()
	if st.Running {
		s.fillCounters(&st)
	}
	return st
}

// ── Abfragen (nur nach dem Scan) ───────────────────────────────────────────

func (s *Scanner) ready() error {
	if s.status.Running {
		return errors.New("Analyse läuft noch")
	}
	if s.root == nil {
		return errors.New("noch keine Analyse durchgeführt")
	}
	return nil
}

// find sucht den Knoten zu path; liefert auch den Pfad der Wurzel zurück.
func (s *Scanner) find(path string) (*node, error) {
	if path == "" || filepath.Clean(path) == s.rootPath {
		return s.root, nil
	}
	rel, err := filepath.Rel(s.rootPath, filepath.Clean(path))
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return nil, fmt.Errorf("Pfad liegt außerhalb der Analyse")
	}
	n := s.root
	for _, part := range strings.Split(rel, string(filepath.Separator)) {
		var next *node
		for _, c := range n.children {
			if c.name == part {
				next = c
				break
			}
		}
		if next == nil {
			return nil, fmt.Errorf("Ordner nicht (mehr) in der Analyse: %s", path)
		}
		n = next
	}
	return n, nil
}

func (s *Scanner) pathOf(n *node) string {
	var parts []string
	for x := n; x != nil && x.parent != nil; x = x.parent {
		parts = append(parts, x.name)
	}
	p := s.rootPath
	for i := len(parts) - 1; i >= 0; i-- {
		p = filepath.Join(p, parts[i])
	}
	return p
}

// Children liefert den Inhalt eines Ordners: Unterordner aus dem Scan plus
// die Dateien direkt darin (frisch gelesen), absteigend nach Größe, höchstens
// limit Einträge – der Rest wird zusammengefasst.
func (s *Scanner) Children(path string, hideSystem bool, limit int) (*Dir, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if err := s.ready(); err != nil {
		return nil, err
	}
	n, err := s.find(path)
	if err != nil {
		return nil, err
	}
	full := s.pathOf(n)
	d := &Dir{Path: full, Name: filepath.Base(full), Size: n.size, Files: n.files, Dirs: n.dirs, Category: n.cat, Unreadable: n.unreadable}
	if n.parent != nil {
		d.Parent = s.pathOf(n.parent)
	}
	var items []Item
	for _, c := range n.children {
		if hideSystem && c.cat == CatSystem {
			continue
		}
		p := filepath.Join(full, c.name)
		items = append(items, Item{Name: c.name, Path: p, Size: c.size, Files: c.files, Dirs: c.dirs, IsDir: true, Category: c.cat, Locked: s.protected(p, c.cat)})
	}
	if entries, err := os.ReadDir(full); err == nil {
		for _, e := range entries {
			if e.IsDir() || e.Type()&(fs.ModeSymlink|fs.ModeIrregular|fs.ModeDevice|fs.ModeNamedPipe|fs.ModeSocket) != 0 {
				continue
			}
			info, err := e.Info()
			if err != nil {
				continue
			}
			p := filepath.Join(full, e.Name())
			cat := s.catOf(p, n.cat)
			if hideSystem && cat == CatSystem {
				continue
			}
			items = append(items, Item{Name: e.Name(), Path: p, Size: allocSize(info), Files: 1, Category: cat, Locked: s.protected(p, cat)})
		}
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].Size > items[j].Size })
	if limit > 0 && len(items) > limit {
		rest := Item{Name: fmt.Sprintf("%d weitere Einträge", len(items)-limit+1), Rest: len(items) - limit + 1, Category: CatOther}
		for _, it := range items[limit-1:] {
			rest.Size += it.Size
			rest.Files += it.Files
		}
		items = append(items[:limit-1], rest)
	}
	for i := range items {
		if n.size > 0 {
			items[i].Pct = float64(items[i].Size) / float64(n.size) * 100
		}
	}
	d.Items = items
	return d, nil
}

// TopFiles liefert die größten Dateien (absteigend).
func (s *Scanner) TopFiles(limit int, hideSystem bool) ([]FileEntry, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if err := s.ready(); err != nil {
		return nil, err
	}
	s.topMu.Lock()
	all := append([]FileEntry(nil), s.top...)
	s.topMu.Unlock()
	sort.Slice(all, func(i, j int) bool { return all[i].Size > all[j].Size })
	out := make([]FileEntry, 0, limit)
	for _, f := range all {
		if hideSystem && f.Category == CatSystem {
			continue
		}
		if len(out) == limit {
			break
		}
		out = append(out, f)
	}
	return out, nil
}

// Hotspot ist ein auffällig großer Ordner (für Bericht und Übersicht).
type Hotspot struct {
	Path     string   `json:"path"`
	Size     int64    `json:"size"`
	Files    int64    `json:"files"`
	Category Category `json:"category"`
}

// Hotspots sucht die Ordner, in denen sich der Speicher tatsächlich ballt:
// groß genug und nicht von einem einzelnen Unterordner dominiert. Systemordner
// werden nie gemeldet, aber durchsucht (z. B. Caches unter /private/var).
func (s *Scanner) Hotspots(limit int) ([]Hotspot, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if err := s.ready(); err != nil {
		return nil, err
	}
	min := s.root.size / 200 // 0,5 %
	if min < 100<<20 {
		min = 100 << 20
	}
	var out []Hotspot
	var visit func(n *node)
	visit = func(n *node) {
		if n.size < min {
			return
		}
		dominated := len(n.children) > 0 && n.children[0].size*10 >= n.size*6
		if n.parent != nil && n.cat != CatSystem && !dominated {
			out = append(out, Hotspot{Path: s.pathOf(n), Size: n.size, Files: n.files, Category: n.cat})
			return
		}
		for _, c := range n.children {
			visit(c)
		}
	}
	visit(s.root)
	sort.Slice(out, func(i, j int) bool { return out[i].Size > out[j].Size })
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

// protected: Pfade, die nie über AdminKit gelöscht werden dürfen – System,
// die Wurzel des Scans, Benutzerordner selbst und bekannte Hauptordner
// (Programme, Dokumente, Library …). Deren Inhalt darf weg, der Ordner nicht.
func (s *Scanner) protected(path string, cat Category) bool {
	if cat == CatSystem {
		return true
	}
	p := filepath.Clean(path)
	eq := func(a, b string) bool {
		if s.goos == "windows" {
			return strings.EqualFold(a, b)
		}
		return a == b
	}
	if eq(p, s.rootPath) || eq(p, filepath.Clean(s.home)) || isVolumeRoot(p) {
		return true
	}
	// Vorfahren des Benutzerordners (z. B. /Users, C:\Users)
	if rel, err := filepath.Rel(p, s.home); err == nil && !strings.HasPrefix(rel, "..") && rel != "." {
		return true
	}
	for _, r := range s.cls.rules {
		if eq(p, r.prefix) {
			return true
		}
	}
	// Standardordner im Benutzerverzeichnis
	for _, name := range homeFolders {
		if eq(p, filepath.Join(s.home, filepath.FromSlash(name))) {
			return true
		}
	}
	return false
}

var homeFolders = []string{"Desktop", "Documents", "Downloads", "Pictures", "Movies", "Music", "Videos", "Public",
	"Library", "Applications", "OneDrive", "AppData", "AppData/Local", "AppData/Roaming", "AppData/LocalLow"}

// MoveToTrash verschiebt einen Eintrag in den Papierkorb und aktualisiert den Baum.
func (s *Scanner) MoveToTrash(path string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ready(); err != nil {
		return err
	}
	p := filepath.Clean(path)
	fi, err := os.Lstat(p)
	if err != nil {
		return err
	}
	var target *node // Ordner-Knoten oder Elternordner einer Datei
	var size, files, dirs int64
	if fi.IsDir() {
		n, err := s.find(p)
		if err != nil {
			return err
		}
		if n == s.root || s.protected(p, n.cat) {
			return fmt.Errorf("%s ist geschützt und kann nicht über AdminKit gelöscht werden", p)
		}
		target, size, files, dirs = n, n.size, n.files, n.dirs+1
	} else {
		parent, err := s.find(filepath.Dir(p))
		if err != nil {
			return err
		}
		if s.protected(p, s.catOf(p, parent.cat)) {
			return fmt.Errorf("%s ist geschützt und kann nicht über AdminKit gelöscht werden", p)
		}
		target, size, files = parent, allocSize(fi), 1
	}
	if err := moveToTrash(p); err != nil {
		return fmt.Errorf("Papierkorb: %w", err)
	}
	// Baum nachführen
	start := target
	if fi.IsDir() {
		par := target.parent
		for i, c := range par.children {
			if c == target {
				par.children = append(par.children[:i], par.children[i+1:]...)
				break
			}
		}
		start = par
	} else {
		target.own -= size
		target.ownFiles--
	}
	for x := start; x != nil; x = x.parent {
		x.size -= size
		x.files -= files
		x.dirs -= dirs
	}
	sort.Slice(start.children, func(i, j int) bool { return start.children[i].size > start.children[j].size })
	s.topMu.Lock()
	kept := s.top[:0]
	for _, f := range s.top {
		if f.Path != p && !strings.HasPrefix(f.Path, p+string(filepath.Separator)) {
			kept = append(kept, f)
		}
	}
	s.top = kept
	heap.Init(&s.top)
	s.topMu.Unlock()
	return nil
}

// isVolumeRoot: „/“, „C:\“ usw.
func isVolumeRoot(p string) bool {
	p = filepath.Clean(p)
	return p == "/" || (len(p) <= 3 && len(p) >= 2 && p[1] == ':')
}

// ── Top-Dateien: Min-Heap der größten N ────────────────────────────────────

type fileHeap []FileEntry

func (h fileHeap) Len() int           { return len(h) }
func (h fileHeap) Less(i, j int) bool { return h[i].Size < h[j].Size }
func (h fileHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *fileHeap) Push(x any)        { *h = append(*h, x.(FileEntry)) }
func (h *fileHeap) Pop() any {
	old := *h
	x := old[len(old)-1]
	*h = old[:len(old)-1]
	return x
}

func (s *Scanner) pushTop(f FileEntry) {
	s.topMu.Lock()
	defer s.topMu.Unlock()
	if len(s.top) < s.topN {
		heap.Push(&s.top, f)
	} else if f.Size > s.top[0].Size {
		s.top[0] = f
		heap.Fix(&s.top, 0)
	}
	if len(s.top) == s.topN {
		s.topMin.Store(s.top[0].Size)
	}
}

// Root ist ein vorgeschlagener Startpunkt für die Analyse.
type Root struct {
	Path  string `json:"path"`
	Label string `json:"label"`
	Total int64  `json:"total"`
	Free  int64  `json:"free"`
}

// Roots schlägt Startpunkte vor: Benutzerordner, Systemlaufwerk, weitere Laufwerke.
func Roots() []Root {
	var out []Root
	add := func(p, label string) {
		r := Root{Path: p, Label: label}
		r.Total, r.Free, _ = VolumeSpace(p)
		out = append(out, r)
	}
	home, _ := os.UserHomeDir()
	if home != "" {
		add(home, "Benutzerordner")
	}
	switch runtime.GOOS {
	case "windows":
		for c := 'C'; c <= 'Z'; c++ {
			p := string(c) + `:\`
			if _, err := os.Stat(p); err == nil {
				add(p, "Laufwerk "+string(c)+":")
			}
		}
	default:
		add("/", "Systemlaufwerk")
		if entries, err := os.ReadDir("/Volumes"); err == nil {
			for _, e := range entries {
				p := filepath.Join("/Volumes", e.Name())
				if real, err := filepath.EvalSymlinks(p); err == nil && real == "/" {
					continue // „Macintosh HD“ zeigt auf /
				}
				if fi, err := os.Stat(p); err == nil && fi.IsDir() {
					add(p, e.Name())
				}
			}
		}
	}
	return out
}
