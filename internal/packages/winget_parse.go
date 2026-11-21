package packages

import (
	"encoding/json"
	"regexp"
	"strings"
)

// winget gibt Tabellen sprachabhängig aus („Name Id Version Available Source“
// bzw. „Name ID Version Verfügbar Quelle“) und kürzt lange Werte mit „…“.
// Der Parser arbeitet deshalb nur mit Spaltenpositionen, nie mit Spaltennamen.

const ellipsis = "…"

var (
	reANSI      = regexp.MustCompile(`\x1b\[[0-9;?]*[A-Za-z]`)
	reDashLine  = regexp.MustCompile(`^-{8,}$`)
	reProgress  = regexp.MustCompile(`[█▒░]`)
	reSpinnerLn = regexp.MustCompile(`^[\s\-\\|/]*$`)
)

// wgTable ist eine von winget ausgegebene Tabelle.
type wgTable struct {
	Title   string     // Textzeile direkt vor der Tabelle (z. B. Hinweis auf „explicit targeting“)
	Columns int        // Anzahl Spalten
	Rows    [][]string // Zellen je Zeile (getrimmt)
}

// cleanWingetOutput entfernt ANSI-Sequenzen, Fortschrittsbalken und
// mit \r überschriebene Zwischenstände.
func cleanWingetOutput(s string) []string {
	s = reANSI.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "\r\n", "\n")
	raw := strings.Split(s, "\n")
	lines := make([]string, 0, len(raw))
	for _, l := range raw {
		if i := strings.LastIndex(l, "\r"); i >= 0 {
			l = l[i+1:]
		}
		l = strings.TrimRight(l, " \t")
		if reProgress.MatchString(l) {
			continue
		}
		if l != "" && reSpinnerLn.MatchString(l) && !reDashLine.MatchString(l) {
			continue
		}
		lines = append(lines, l)
	}
	return lines
}

// cellWidth liefert die Anzeigebreite eines Zeichens (ostasiatische Zeichen = 2).
func cellWidth(r rune) int {
	switch {
	case r >= 0x1100 && r <= 0x115F,
		r >= 0x2E80 && r <= 0xA4CF,
		r >= 0xAC00 && r <= 0xD7A3,
		r >= 0xF900 && r <= 0xFAFF,
		r >= 0xFE30 && r <= 0xFE4F,
		r >= 0xFF00 && r <= 0xFF60,
		r >= 0xFFE0 && r <= 0xFFE6:
		return 2
	}
	return 1
}

// cells zerlegt eine Zeile in Zeichen mit Startspalte.
type cellRune struct {
	r   rune
	pos int
}

func toCells(line string) ([]cellRune, int) {
	out := make([]cellRune, 0, len(line))
	pos := 0
	for _, r := range line {
		out = append(out, cellRune{r, pos})
		pos += cellWidth(r)
	}
	return out, pos
}

// columnStarts ermittelt die Startspalten aus der Kopfzeile.
func columnStarts(header string) []int {
	cs, _ := toCells(header)
	var starts []int
	prevSpace := true
	for _, c := range cs {
		isSpace := c.r == ' '
		if !isSpace && prevSpace {
			starts = append(starts, c.pos)
		}
		prevSpace = isSpace
	}
	return starts
}

// sliceCells schneidet die Zellen [from, to) (to<0 = Zeilenende) aus.
func sliceCells(cs []cellRune, from, to int) string {
	var b strings.Builder
	for _, c := range cs {
		if c.pos >= from && (to < 0 || c.pos < to) {
			b.WriteRune(c.r)
		}
	}
	return strings.TrimSpace(b.String())
}

// parseWingetTables findet alle Tabellen (Kopfzeile + Strichlinie) in der Ausgabe.
func parseWingetTables(out string) []wgTable {
	lines := cleanWingetOutput(out)
	var tables []wgTable
	for i := 1; i < len(lines); i++ {
		if !reDashLine.MatchString(lines[i]) || strings.TrimSpace(lines[i-1]) == "" {
			continue
		}
		starts := columnStarts(lines[i-1])
		if len(starts) < 3 {
			continue
		}
		t := wgTable{Columns: len(starts)}
		// Titel: letzte nicht-leere Zeile vor der Kopfzeile (falls vorhanden)
		if i >= 2 && strings.TrimSpace(lines[i-2]) != "" {
			t.Title = strings.TrimSpace(lines[i-2])
		} else if i >= 3 && strings.TrimSpace(lines[i-3]) != "" {
			t.Title = strings.TrimSpace(lines[i-3])
		}
		j := i + 1
		for ; j < len(lines); j++ {
			row, ok := splitRow(lines[j], starts)
			if !ok {
				break
			}
			t.Rows = append(t.Rows, row)
		}
		tables = append(tables, t)
		i = j
	}
	return tables
}

// splitRow zerlegt eine Datenzeile anhand der Spaltenstarts. ok=false, wenn
// die Zeile nicht zur Tabelle passt (Leerzeile, Zusammenfassung o. Ä.).
func splitRow(line string, starts []int) ([]string, bool) {
	if strings.TrimSpace(line) == "" {
		return nil, false
	}
	cs, width := toCells(line)
	// Die Zeile muss mindestens bis in die Versions-Spalte reichen.
	if width <= starts[2] {
		return nil, false
	}
	// Vor jedem erreichten Spaltenstart muss ein Leerzeichen stehen.
	at := make(map[int]rune, len(cs))
	for _, c := range cs {
		at[c.pos] = c.r
	}
	for k := 1; k < len(starts); k++ {
		if starts[k] >= width {
			break
		}
		if r, ok := at[starts[k]-1]; ok && r != ' ' {
			return nil, false
		}
	}
	row := make([]string, len(starts))
	for k := range starts {
		to := -1
		if k+1 < len(starts) {
			to = starts[k+1]
		}
		row[k] = sliceCells(cs, starts[k], to)
	}
	// ID darf keine Leerzeichen enthalten und Version nicht leer sein.
	if row[1] == "" || strings.Contains(row[1], " ") || row[2] == "" {
		return nil, false
	}
	return row, true
}

// parseWingetUpgrade wertet `winget upgrade` aus.
// Tabellen nach der ersten stammen aus dem Abschnitt „require explicit
// targeting“ (z. B. gepinnte Pakete) und werden entsprechend markiert.
func parseWingetUpgrade(out string) []Package {
	var pkgs []Package
	for ti, t := range parseWingetTables(out) {
		for _, r := range t.Rows {
			p := Package{Name: r[0], ID: r[1], Version: r[2], Source: SourceWinget}
			if t.Columns >= 5 {
				p.Available = r[3]
				p.Source = Source(r[len(r)-1])
			} else if t.Columns == 4 {
				p.Available = r[3]
			}
			p.ExplicitOnly = ti > 0
			if strings.HasSuffix(p.ID, ellipsis) {
				p.Truncated = true
			}
			pkgs = append(pkgs, p)
		}
	}
	return pkgs
}

// parseWingetList wertet `winget list` bzw. `winget search` aus.
// Spalten: Name, ID, Version, [Verfügbar | Treffer], [Quelle].
func parseWingetList(out string, search bool) []Package {
	var pkgs []Package
	for _, t := range parseWingetTables(out) {
		for _, r := range t.Rows {
			p := Package{Name: r[0], ID: r[1], Version: r[2]}
			if t.Columns >= 4 {
				p.Source = Source(r[len(r)-1])
			}
			if !search && t.Columns >= 5 {
				p.Available = r[3]
			}
			if strings.HasSuffix(p.ID, ellipsis) {
				p.Truncated = true
			}
			pkgs = append(pkgs, p)
		}
	}
	return pkgs
}

// wingetExport ist das Format von `winget export -o … --include-versions`.
type wingetExport struct {
	Sources []struct {
		Packages []struct {
			PackageIdentifier string `json:"PackageIdentifier"`
			Version           string `json:"Version"`
		} `json:"Packages"`
		SourceDetails struct {
			Name string `json:"Name"`
		} `json:"SourceDetails"`
	} `json:"Sources"`
}

// parseWingetExport liefert alle Pakete aus einer Export-Datei.
func parseWingetExport(data []byte) ([]Package, error) {
	// winget schreibt die Datei mit UTF-8-BOM.
	data = []byte(strings.TrimPrefix(string(data), "\ufeff"))
	var ex wingetExport
	if err := json.Unmarshal(data, &ex); err != nil {
		return nil, err
	}
	var pkgs []Package
	for _, s := range ex.Sources {
		for _, p := range s.Packages {
			pkgs = append(pkgs, Package{
				ID:      p.PackageIdentifier,
				Version: p.Version,
				Source:  Source(s.SourceDetails.Name),
			})
		}
	}
	return pkgs, nil
}

// resolveTruncated ersetzt mit „…“ gekürzte IDs durch die vollständige ID,
// sofern genau eine bekannte ID mit dem Präfix beginnt.
func resolveTruncated(pkgs []Package, known []string) {
	for i := range pkgs {
		if !strings.HasSuffix(pkgs[i].ID, ellipsis) {
			continue
		}
		prefix := strings.TrimSuffix(pkgs[i].ID, ellipsis)
		match := ""
		n := 0
		for _, k := range known {
			if strings.HasPrefix(k, prefix) {
				match = k
				n++
			}
		}
		if n == 1 {
			pkgs[i].ID = match
			pkgs[i].Truncated = false
		} else {
			pkgs[i].Truncated = true
		}
	}
}

// parseWingetVersion holt die Version aus `winget --version` („v1.9.25200“).
func parseWingetVersion(out string) string {
	for _, l := range cleanWingetOutput(out) {
		l = strings.TrimSpace(l)
		if l != "" {
			return strings.TrimPrefix(l, "v")
		}
	}
	return ""
}

// versionAtLeast vergleicht punktgetrennte Versionen numerisch (a >= b).
func versionAtLeast(a, b string) bool {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var x, y int
		if i < len(pa) {
			x = atoiPrefix(pa[i])
		}
		if i < len(pb) {
			y = atoiPrefix(pb[i])
		}
		if x != y {
			return x > y
		}
	}
	return true
}

func atoiPrefix(s string) int {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			break
		}
		n = n*10 + int(r-'0')
	}
	return n
}
