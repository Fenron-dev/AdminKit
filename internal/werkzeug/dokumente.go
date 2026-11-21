package werkzeug

// Dokumente (#96): Vorlagen, Anschreiben, Kundendienstzettel … liegen als
// normale Dateien im Vault unter dokumente/ – in Unterordnern, die das Team
// selbst anlegt. Markdown-Vorlagen mit {{Platzhaltern}} lassen sich in der App
// ausfüllen und als gebrandetes Dokument drucken; alle anderen Dateien öffnen
// mit dem Standardprogramm des Systems.

import (
	"embed"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

//go:embed all:dokumente_seeds
var docSeedFS embed.FS

const docSeedRoot = "dokumente_seeds"

// DocFile ist eine Datei im Dokumente-Ordner.
type DocFile struct {
	Path     string    `json:"path"`   // relativ zu dokumente/, mit „/“
	Folder   string    `json:"folder"` // "" = oberste Ebene
	Name     string    `json:"name"`
	Ext      string    `json:"ext"` // klein, ohne Punkt
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
	Editable bool      `json:"editable"` // .md/.txt: in der App bearbeiten/ausfüllen
}

// DocTree ist der Inhalt von dokumente/.
type DocTree struct {
	Root    string    `json:"root"`    // absoluter Pfad (für „Im Finder zeigen“)
	Folders []string  `json:"folders"` // alle Unterordner, relativ, sortiert
	Files   []DocFile `json:"files"`
}

// DocsDir liefert vault/dokumente.
func DocsDir(vaultRoot string) string { return filepath.Join(vaultRoot, "dokumente") }

func docSeedStatePath(vaultRoot string) string {
	return filepath.Join(DocsDir(vaultRoot), ".adminkit-vorlagen.yaml")
}

// EditableExt: Textformate, die die App selbst bearbeitet.
func EditableExt(ext string) bool { return ext == "md" || ext == "txt" }

// DocPath prüft einen relativen Pfad und liefert den absoluten Pfad in dokumente/.
// Erlaubt keine absoluten Pfade, „..“ und versteckte Einträge.
func DocPath(vaultRoot, rel string) (string, error) {
	rel = strings.TrimSpace(strings.ReplaceAll(rel, "\\", "/"))
	if path.IsAbs(rel) || strings.Contains(rel, ":") {
		return "", fmt.Errorf("ungültiger Pfad")
	}
	rel = strings.TrimRight(rel, "/")
	if rel == "" {
		return DocsDir(vaultRoot), nil
	}
	for _, seg := range strings.Split(rel, "/") {
		if seg == "" || seg == "." || seg == ".." || strings.HasPrefix(seg, ".") {
			return "", fmt.Errorf("ungültiger Pfad %q", rel)
		}
	}
	base := DocsDir(vaultRoot)
	p := filepath.Join(base, filepath.FromSlash(rel))
	r, err := filepath.Rel(base, p)
	if err != nil || r == ".." || strings.HasPrefix(r, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("Pfad außerhalb von dokumente/")
	}
	return p, nil
}

// CheckDocName prüft einen Datei- oder Ordnernamen (ohne Pfad).
func CheckDocName(name string) (string, error) {
	n := strings.TrimSpace(name)
	if n == "" || len([]rune(n)) > 100 {
		return "", fmt.Errorf("Name fehlt oder ist zu lang (max. 100 Zeichen)")
	}
	if strings.HasPrefix(n, ".") || strings.ContainsAny(n, `/\:*?"<>|`) || strings.ContainsAny(n, "\n\r\t") {
		return "", fmt.Errorf(`Name „%s“ ist nicht erlaubt (keine / \ : * ? " < > | und nicht mit Punkt beginnen)`, n)
	}
	return n, nil
}

// SyncDocSeeds legt die mitgelieferten Beispielvorlagen an – jede nur einmal.
// Gelöschte oder geänderte Vorlagen werden nie wiederhergestellt/überschrieben.
func SyncDocSeeds(vaultRoot string) (int, error) {
	if err := os.MkdirAll(DocsDir(vaultRoot), 0o755); err != nil {
		return 0, err
	}
	var st struct {
		Angelegt []string `yaml:"angelegt"`
	}
	if b, err := os.ReadFile(docSeedStatePath(vaultRoot)); err == nil {
		_ = yaml.Unmarshal(b, &st)
	}
	done := map[string]bool{}
	for _, p := range st.Angelegt {
		done[p] = true
	}
	n := 0
	err := fs.WalkDir(docSeedFS, docSeedRoot, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		rel := strings.TrimPrefix(p, docSeedRoot+"/")
		if done[rel] {
			return nil
		}
		dst, err := DocPath(vaultRoot, rel)
		if err != nil {
			return err
		}
		if _, err := os.Stat(dst); err == nil {
			done[rel] = true // existiert schon (z. B. selbst angelegt)
			st.Angelegt = append(st.Angelegt, rel)
			return nil
		}
		data, err := docSeedFS.ReadFile(p)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(dst, data, 0o644); err != nil {
			return err
		}
		st.Angelegt = append(st.Angelegt, rel)
		n++
		return nil
	})
	if err != nil {
		return n, err
	}
	if n > 0 || len(st.Angelegt) != len(done) {
		sort.Strings(st.Angelegt)
		out, _ := yaml.Marshal(st)
		_ = os.WriteFile(docSeedStatePath(vaultRoot), append([]byte("# Bereits angelegte Beispielvorlagen – werden nicht erneut erzeugt.\n"), out...), 0o644)
	}
	return n, nil
}

// ListDocs liest den Ordnerbaum unter dokumente/ (versteckte Einträge ausgenommen).
func ListDocs(vaultRoot string) (*DocTree, error) {
	base := DocsDir(vaultRoot)
	t := &DocTree{Root: base, Folders: []string{}, Files: []DocFile{}}
	err := filepath.WalkDir(base, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			if os.IsNotExist(err) && p == base {
				return fs.SkipDir
			}
			return nil // unlesbare Einträge überspringen
		}
		if p == base {
			return nil
		}
		if strings.HasPrefix(d.Name(), ".") || strings.HasPrefix(d.Name(), "~$") {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		rel, _ := filepath.Rel(base, p)
		rel = filepath.ToSlash(rel)
		if d.IsDir() {
			t.Folders = append(t.Folders, rel)
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(d.Name())), ".")
		folder := path.Dir(rel)
		if folder == "." {
			folder = ""
		}
		t.Files = append(t.Files, DocFile{Path: rel, Folder: folder, Name: d.Name(), Ext: ext, Size: info.Size(), Modified: info.ModTime(), Editable: EditableExt(ext)})
		return nil
	})
	sort.Slice(t.Folders, func(i, j int) bool { return strings.ToLower(t.Folders[i]) < strings.ToLower(t.Folders[j]) })
	sort.Slice(t.Files, func(i, j int) bool { return strings.ToLower(t.Files[i].Path) < strings.ToLower(t.Files[j].Path) })
	return t, err
}

// CreateDocFolder legt parent/name an.
func CreateDocFolder(vaultRoot, parent, name string) (string, error) {
	n, err := CheckDocName(name)
	if err != nil {
		return "", err
	}
	rel := strings.Trim(path.Join(strings.Trim(parent, "/"), n), "/")
	p, err := DocPath(vaultRoot, rel)
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(p); err == nil {
		return "", fmt.Errorf("„%s“ gibt es schon", n)
	}
	return rel, os.MkdirAll(p, 0o755)
}

// RenameDoc benennt eine Datei oder einen Ordner im selben Ordner um.
func RenameDoc(vaultRoot, rel, newName string) (string, error) {
	n, err := CheckDocName(newName)
	if err != nil {
		return "", err
	}
	src, err := DocPath(vaultRoot, rel)
	if err != nil || src == DocsDir(vaultRoot) {
		return "", fmt.Errorf("ungültiger Pfad")
	}
	dir := path.Dir(strings.Trim(rel, "/"))
	if dir == "." {
		dir = ""
	}
	nrel := strings.Trim(path.Join(dir, n), "/")
	dst, err := DocPath(vaultRoot, nrel)
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(dst); err == nil && !strings.EqualFold(src, dst) {
		return "", fmt.Errorf("„%s“ gibt es schon", n)
	}
	return nrel, os.Rename(src, dst)
}

// DeleteDoc löscht eine Datei oder einen LEEREN Ordner.
func DeleteDoc(vaultRoot, rel string) error {
	p, err := DocPath(vaultRoot, rel)
	if err != nil || p == DocsDir(vaultRoot) {
		return fmt.Errorf("ungültiger Pfad")
	}
	fi, err := os.Stat(p)
	if err != nil {
		return err
	}
	if fi.IsDir() {
		entries, err := os.ReadDir(p)
		if err != nil {
			return err
		}
		for _, e := range entries {
			if e.Name() != ".DS_Store" {
				return fmt.Errorf("Ordner ist nicht leer – erst die Dateien darin verschieben oder löschen")
			}
		}
		return os.RemoveAll(p) // nur noch .DS_Store drin
	}
	return os.Remove(p)
}

// ReadDocText liest eine .md/.txt-Datei (max. 1 MB).
func ReadDocText(vaultRoot, rel string) (string, error) {
	p, err := DocPath(vaultRoot, rel)
	if err != nil {
		return "", err
	}
	if !EditableExt(strings.TrimPrefix(strings.ToLower(filepath.Ext(p)), ".")) {
		return "", fmt.Errorf("nur .md- und .txt-Dateien lassen sich in der App öffnen")
	}
	fi, err := os.Stat(p)
	if err != nil {
		return "", err
	}
	if fi.Size() > 1<<20 {
		return "", fmt.Errorf("Datei zu groß für die Vorschau")
	}
	b, err := os.ReadFile(p)
	return string(b), err
}

// SaveDocText schreibt eine .md/.txt-Datei (neu oder überschreiben).
func SaveDocText(vaultRoot, rel, content string) error {
	p, err := DocPath(vaultRoot, rel)
	if err != nil || p == DocsDir(vaultRoot) {
		return fmt.Errorf("ungültiger Pfad")
	}
	if _, err := CheckDocName(filepath.Base(p)); err != nil {
		return err
	}
	if !EditableExt(strings.TrimPrefix(strings.ToLower(filepath.Ext(p)), ".")) {
		return fmt.Errorf("nur .md- und .txt-Dateien lassen sich in der App bearbeiten")
	}
	if len(content) > 1<<20 {
		return fmt.Errorf("Text zu lang")
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, []byte(content), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

// ImportDocs kopiert Dateien in einen Ordner. Vorhandene werden nie
// überschrieben, sondern als „Name (2).ext“ abgelegt. Liefert die neuen Pfade.
func ImportDocs(vaultRoot, folder string, srcs []string) ([]string, error) {
	dir, err := DocPath(vaultRoot, folder)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	var out []string
	for _, src := range srcs {
		fi, err := os.Stat(src)
		if err != nil || fi.IsDir() {
			return out, fmt.Errorf("%s: keine Datei", filepath.Base(src))
		}
		if fi.Size() > 200<<20 {
			return out, fmt.Errorf("%s: größer als 200 MB", filepath.Base(src))
		}
		name, err := CheckDocName(filepath.Base(src))
		if err != nil {
			return out, err
		}
		dst := uniquePath(filepath.Join(dir, name))
		if err := copyFile(src, dst); err != nil {
			return out, err
		}
		rel, _ := filepath.Rel(DocsDir(vaultRoot), dst)
		out = append(out, filepath.ToSlash(rel))
	}
	return out, nil
}

func uniquePath(p string) string {
	if _, err := os.Stat(p); os.IsNotExist(err) {
		return p
	}
	ext := filepath.Ext(p)
	stem := strings.TrimSuffix(p, ext)
	for i := 2; ; i++ {
		c := fmt.Sprintf("%s (%d)%s", stem, i, ext)
		if _, err := os.Stat(c); os.IsNotExist(err) {
			return c
		}
	}
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(dst)
		return err
	}
	return out.Close()
}
