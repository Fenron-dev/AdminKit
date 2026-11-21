package werkzeug

import (
	"fmt"
	"html"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// DocOptions beschreibt ein Kundendokument (Ratgeber, WLAN-Karte …).
type DocOptions struct {
	Title      string
	BodyHTML   string // vom Werkzeug erzeugt (Nutzereingaben dort bereits escaped)
	Company    string
	Technician string
	LogoURI    string // data:image/…;base64,… oder leer
	Customer   string
	// Card: kleines Format (z. B. WLAN-Karte) statt A4-Dokument.
	Card bool
}

var reNoScript = regexp.MustCompile(`(?is)<\s*/?\s*(script|iframe|object|embed)[^>]*>`)

// BuildDocument erzeugt ein eigenständiges HTML-Dokument mit Branding-Kopf,
// Druck-CSS und einem Knopf „Drucken / Als PDF speichern“.
func BuildDocument(o DocOptions, now time.Time) string {
	body := reNoScript.ReplaceAllString(o.BodyHTML, "")
	var head strings.Builder
	if o.LogoURI != "" && strings.HasPrefix(o.LogoURI, "data:image/") {
		head.WriteString(`<img class="logo" src="` + html.EscapeString(o.LogoURI) + `" alt="">`)
	}
	meta := []string{}
	if o.Company != "" {
		meta = append(meta, "<b>"+html.EscapeString(o.Company)+"</b>")
	}
	if o.Technician != "" {
		meta = append(meta, "Ansprechpartner: "+html.EscapeString(o.Technician))
	}
	if o.Customer != "" {
		meta = append(meta, "Für: "+html.EscapeString(o.Customer))
	}
	meta = append(meta, now.Format("02.01.2006"))
	head.WriteString(`<div class="meta">` + strings.Join(meta, "<br>") + `</div>`)
	cls := "doc"
	if o.Card {
		cls = "card"
	}
	return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>` + html.EscapeString(o.Title) + `</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#EEF2F6;font-family:Arial,Helvetica,sans-serif;color:#13202E}
.sheet{max-width:820px;margin:24px auto;background:#fff;padding:34px 40px;border-radius:10px;box-shadow:0 10px 30px -12px rgba(0,0,0,.25)}
.sheet.card{max-width:440px;text-align:center}
.brand{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:1px solid #D5DEE8;padding-bottom:12px;margin-bottom:18px}
.brand .logo{max-height:56px;max-width:220px}
.brand .meta{font-size:12.5px;color:#3C4E62;text-align:right;line-height:1.5;margin-left:auto}
.card .brand{justify-content:center;flex-direction:column;align-items:center}
.card .brand .meta{text-align:center;margin:0}
.bar{max-width:820px;margin:16px auto 0;text-align:right}
.bar button{font:inherit;padding:9px 16px;border-radius:8px;border:1px solid #2563EB;background:#2563EB;color:#fff;cursor:pointer}
a{color:#0B6E8C}
svg{max-width:100%;height:auto}
@media print{body{background:#fff}.sheet{box-shadow:none;margin:0 auto;padding:0;max-width:none}.bar{display:none}}
</style></head><body>
<div class="bar"><button onclick="window.print()">Drucken / Als PDF speichern</button></div>
<div class="sheet ` + cls + `"><div class="brand">` + head.String() + `</div>
` + body + `
</div></body></html>`
}

var reFileUnsafe = regexp.MustCompile(`[^A-Za-z0-9_-]+`)

// WriteDocument schreibt das Dokument nach dir/<kind>_<titel>_<zeit>.html.
func WriteDocument(dir, kind string, o DocOptions, now time.Time) (string, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	name := reFileUnsafe.ReplaceAllString(strings.ReplaceAll(strings.ToLower(o.Title), " ", "-"), "")
	if len(name) > 40 {
		name = name[:40]
	}
	kind = reFileUnsafe.ReplaceAllString(kind, "")
	if kind == "" {
		kind = "dokument"
	}
	p := filepath.Join(dir, fmt.Sprintf("%s_%s_%s.html", kind, name, now.Format("20060102_150405")))
	return p, os.WriteFile(p, []byte(BuildDocument(o, now)), 0644)
}
