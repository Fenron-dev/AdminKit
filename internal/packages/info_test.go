package packages

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// fakeNet ersetzt httpGet durch eine Map URL → Inhalt.
func fakeNet(t *testing.T, files map[string]string) *int {
	t.Helper()
	calls := 0
	old := httpGet
	httpGet = func(_ context.Context, u string, _ map[string]string) ([]byte, int, error) {
		calls++
		if body, ok := files[u]; ok {
			return []byte(body), 200, nil
		}
		return nil, 404, nil
	}
	t.Cleanup(func() { httpGet = old })
	return &calls
}

const avBase = wingetRawBase + "e/ESET/AVRemover/1.6.7.0/"

var avFiles = map[string]string{
	avBase + "ESET.AVRemover.yaml": "PackageIdentifier: ESET.AVRemover\nPackageVersion: 1.6.7.0\nDefaultLocale: en-US\nManifestType: version\n",
	avBase + "ESET.AVRemover.locale.en-US.yaml": `PackageIdentifier: ESET.AVRemover
PackageLocale: en-US
Publisher: ESET
PublisherUrl: https://www.eset.com/
PackageName: ESET AV Remover
PackageUrl: https://support.eset.com/en/kb146
License: Proprietary
ShortDescription: Removes previously installed antivirus software.
Tags:
- antivirus
- remover
`,
	avBase + "ESET.AVRemover.installer.yaml": `PackageIdentifier: ESET.AVRemover
InstallerType: exe
Scope: machine
ElevationRequirement: elevatesSelf
Installers:
- Architecture: x64
  InstallerUrl: https://example.invalid/av_remover_x64.exe
  InstallerSha256: AABBCC
- Architecture: x86
  InstallerType: nullsoft
  InstallerUrl: https://example.invalid/av_remover_x86.exe
  InstallerSha256: DDEEFF
`,
}

func TestManifestMultiFile(t *testing.T) {
	fakeNet(t, avFiles)
	info, err := wingetManifestInfo(context.Background(), Package{ID: "ESET.AVRemover", Version: "1.6.7.0", Source: SourceWinget})
	if err != nil {
		t.Fatal(err)
	}
	if info.Publisher != "ESET" || info.Name != "ESET AV Remover" || info.DescLang != "en" {
		t.Errorf("Kopfdaten: %+v", info)
	}
	if strings.Join(info.InstallerTypes, ",") != "Setup-Programm (EXE),Setup-Programm (NSIS)" {
		t.Errorf("Typen = %q", info.InstallerTypes)
	}
	if !info.NeedsAdmin || strings.Join(info.Scopes, ",") != "für alle Benutzer" || strings.Join(info.Archs, ",") != "x64,x86" {
		t.Errorf("Installer: admin=%v scopes=%q archs=%q", info.NeedsAdmin, info.Scopes, info.Archs)
	}
	if strings.Join(info.SHA256, ",") != "aabbcc,ddeeff" {
		t.Errorf("Hashes = %q", info.SHA256)
	}
	if !strings.HasSuffix(info.ManifestURL, "/manifests/e/ESET/AVRemover") {
		t.Errorf("ManifestURL = %s", info.ManifestURL)
	}
}

func TestManifestGermanLocaleAndLatestVersion(t *testing.T) {
	base := wingetRawBase + "m/Mozilla/Firefox/de/132.0/"
	calls := fakeNet(t, map[string]string{
		wingetAPIBase + "m/Mozilla/Firefox/de":        `[{"name":"131.0","type":"dir"},{"name":"132.0","type":"dir"},{"name":"99.0.1","type":"dir"}]`,
		base + "Mozilla.Firefox.de.yaml":              "DefaultLocale: en-US\nManifestType: version\n",
		base + "Mozilla.Firefox.de.locale.en-US.yaml": "PackageName: Mozilla Firefox (de)\nPublisher: Mozilla\nShortDescription: Fast browser\nLicense: MPL-2.0\n",
		base + "Mozilla.Firefox.de.locale.de-DE.yaml": "ShortDescription: Schneller Browser\nDescription: Ausführlich auf Deutsch\n",
		base + "Mozilla.Firefox.de.installer.yaml":    "Installers:\n- Architecture: x64\n  InstallerType: nullsoft\n  Scope: user\n  InstallerSha256: 11\n- Architecture: x64\n  InstallerType: nullsoft\n  Scope: machine\n  InstallerSha256: 22\n",
	})
	// Version „…“ (gekürzt) → API ermittelt 132.0
	info, err := wingetManifestInfo(context.Background(), Package{ID: "Mozilla.Firefox.de", Available: "13…"})
	if err != nil {
		t.Fatal(err)
	}
	if info.Description != "Schneller Browser" || info.DescLang != "de" || info.LongDescription != "Ausführlich auf Deutsch" {
		t.Errorf("deutsche Beschreibung nicht bevorzugt: %+v", info)
	}
	if info.License != "MPL-2.0" || len(info.Scopes) != 2 {
		t.Errorf("Lizenz/Scopes: %q %q", info.License, info.Scopes)
	}
	if *calls < 5 {
		t.Errorf("erwartet API + 4 Dateien, calls=%d", *calls)
	}
}

func TestManifestSingleton(t *testing.T) {
	base := wingetRawBase + "n/N0deZ3r0/Win11Privacy/2.1.0/"
	fakeNet(t, map[string]string{
		base + "N0deZ3r0.Win11Privacy.yaml": `PackageIdentifier: N0deZ3r0.Win11Privacy
PackageVersion: 2.1.0
PackageLocale: en-US
Publisher: N0deZ3r0
PackageName: Windows 11 Privacy
PackageUrl: https://github.com/N0deZ3r0/win11privacy
License: MIT
ShortDescription: Turns off Microsoft data collection
Tags: [privacy, telemetry, debloat]
InstallerType: inno
Scope: machine
Installers:
- Architecture: x64
  InstallerSha256: ABC
ManifestType: singleton
ManifestVersion: 1.0.0
`,
	})
	info, err := wingetManifestInfo(context.Background(), Package{ID: "N0deZ3r0.Win11Privacy", Version: "2.1.0"})
	if err != nil {
		t.Fatal(err)
	}
	if info.Description != "Turns off Microsoft data collection" || info.InstallerTypes[0] != "Setup-Programm (Inno Setup)" || info.Scopes[0] != "für alle Benutzer" {
		t.Errorf("Singleton: %+v", info)
	}
}

func hintTitles(h []Hint) string {
	var t []string
	for _, x := range h {
		t = append(t, x.Level+":"+x.Title)
	}
	return strings.Join(t, " | ")
}

func TestHints(t *testing.T) {
	now := time.Date(2026, 11, 21, 0, 0, 0, 0, time.UTC)
	cases := []struct {
		in   HintInput
		want string
	}{
		{HintInput{ID: "N0deZ3r0.Win11Privacy", Name: "Windows 11 Privacy", Tags: []string{"privacy"},
			GitHub: &GitHubStats{Stars: 0, PushedAt: now.AddDate(0, -1, 0)}}, "warn:Greift tief ins System ein | info:Kleines Projekt"},
		{HintInput{ID: "Mozilla.Firefox.de", Name: "Firefox", Known: []string{"Mozilla.Firefox"}}, "info:Sprachversion „de“"},
		{HintInput{ID: "Mozilla.Firefox.de", Name: "Firefox"}, ""}, // Basis unbekannt → kein Hinweis
		{HintInput{ID: "Mozilla.Firefox.ESR", Name: "Firefox ESR"}, "info:ESR-Version"},
		{HintInput{ID: "Google.Chrome.Beta", Name: "Chrome Beta"}, "warn:Vorabversion"},
		{HintInput{ID: "Adobe.Acrobat.Reader.32-bit", Name: "Reader", Known: []string{"Adobe.Acrobat.Reader.64-bit", "Adobe.Acrobat.Reader.32-bit"}}, ""},
		{HintInput{ID: "Foo.Tool.x86", Name: "Tool", Known: []string{"Foo.Tool."}}, "info:32-Bit-Variante"},
		{HintInput{ID: "old.thing", Name: "x", GitHub: &GitHubStats{Stars: 500, Archived: true}, HasNote: true}, "warn:Projekt wirkt verwaist"},
		{HintInput{ID: "wget", Source: SourceBrew, Deprecated: true}, "warn:Veraltet"},
		{HintInput{ID: "VideoLAN.VLC", Name: "VLC media player"}, ""},
		{HintInput{ID: "ESET.AVRemover", Name: "ESET AV Remover"}, ""},
	}
	for _, c := range cases {
		c.in.Now = now
		if got := hintTitles(BuildHints(c.in)); got != c.want {
			t.Errorf("%s: got %q want %q", c.in.ID, got, c.want)
		}
	}
}

func TestNotesDefaultAndOverride(t *testing.T) {
	dir := t.TempDir()
	n, err := LoadNotes(dir)
	if err != nil {
		t.Fatal(err)
	}
	av := n.For(SourceWinget, "eset.avremover") // ID-Vergleich ohne Groß/Klein
	if av == nil || !strings.Contains(av.Text, "Aufräumwerkzeug") || av.Own {
		t.Fatalf("ESET AV Remover: %+v", av)
	}
	if a := n.For(SourceBrewCask, "anydesk"); a == nil || a.Level != "warn" {
		t.Errorf("AnyDesk-Cask: %+v", a)
	}
	if e := n.For(SourceWinget, "ESET.EndpointSecurity"); e == nil || !e.SuggestPin {
		t.Errorf("ESET Endpoint: %+v", e)
	}
	os.MkdirAll(filepath.Join(dir, "packages"), 0755)
	os.WriteFile(filepath.Join(dir, "packages", "notes.yaml"), []byte("version: 1\nnotes:\n  - match: { winget: ESET.AVRemover }\n    text: Eigene Notiz\n  - match: { brew: htop }\n    text: Prozessanzeige\n"), 0644)
	n, err = LoadNotes(dir)
	if err != nil {
		t.Fatal(err)
	}
	av = n.For(SourceWinget, "ESET.AVRemover")
	if av == nil || !av.Own || av.Text != "Eigene Notiz" || !strings.Contains(av.Default, "Aufräumwerkzeug") {
		t.Errorf("Override: %+v", av)
	}
	if h := n.For(SourceBrew, "htop"); h == nil || h.Text != "Prozessanzeige" {
		t.Errorf("neue Notiz: %+v", h)
	}
}

func TestGetInfoCacheAndOffline(t *testing.T) {
	calls := fakeNet(t, avFiles)
	dir := t.TempDir()
	notes, _ := LoadNotes("")
	opt := InfoOptions{Online: true, CacheDir: dir, CacheDays: 30, Notes: notes}
	w := &Winget{}
	p := Package{ID: "ESET.AVRemover", Version: "1.6.7.0", Source: SourceWinget}
	info, err := GetInfo(context.Background(), w, p, opt)
	if err != nil {
		t.Fatal(err)
	}
	if info.FromCache || info.Note == nil || !strings.Contains(info.Note.Text, "Aufräumwerkzeug") {
		t.Errorf("erster Abruf: %+v", info)
	}
	first := *calls
	// Zweiter Abruf offline → aus dem Cache, keine Netzaufrufe
	opt.Online = false
	info, err = GetInfo(context.Background(), w, p, opt)
	if err != nil || !info.FromCache || *calls != first {
		t.Fatalf("Cache: err=%v fromCache=%v calls=%d/%d", err, info != nil && info.FromCache, *calls, first)
	}
	// Unbekanntes Paket offline → verständlicher Fehler
	_, err = GetInfo(context.Background(), w, Package{ID: "Foo.Bar", Source: SourceWinget}, opt)
	if err == nil || !strings.Contains(err.Error(), "Online") {
		t.Errorf("Offline-Fehler erwartet, got %v", err)
	}
}

func TestParseBrewInfoCask(t *testing.T) {
	data := `{"formulae":[],"casks":[{"token":"vlc","name":["VLC media player"],"desc":"Multimedia player","homepage":"https://www.videolan.org/vlc/","version":"3.0.21","sha256":"abc","auto_updates":true,"deprecated":false,"disabled":false,"caveats":null}]}`
	info, err := parseBrewInfo(Package{ID: "vlc", Source: SourceBrewCask}, []byte(data))
	if err != nil {
		t.Fatal(err)
	}
	if info.Name != "VLC media player" || info.Description != "Multimedia player" || !info.AutoUpdates || len(info.SHA256) != 1 {
		t.Errorf("%+v", info)
	}
	data = `{"formulae":[],"casks":[{"token":"x","name":["X"],"sha256":"no_check"}]}`
	info, _ = parseBrewInfo(Package{ID: "x", Source: SourceBrewCask}, []byte(data))
	if len(info.SHA256) != 0 {
		t.Error("no_check darf kein Hash sein")
	}
}

func TestParseWingetShowDE(t *testing.T) {
	out := "Gefunden ESET AV Remover [ESET.AVRemover]\nVersion: 1.6.7.0\nHerausgeber: ESET\nBeschreibung: Entfernt Virenscanner\nLizenz: Proprietär\nInstallationsprogramm:\n  Installertyp: exe\n  Installer-SHA256: AABB\n"
	info := parseWingetShow(Package{ID: "ESET.AVRemover"}, out)
	if info.Publisher != "ESET" || info.Description != "Entfernt Virenscanner" || !info.Partial || fmt.Sprint(info.SHA256) != "[aabb]" {
		t.Errorf("%+v", info)
	}
}
