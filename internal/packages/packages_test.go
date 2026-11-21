package packages

import (
	"os"
	"reflect"
	"strings"
	"testing"
	"time"
)

func read(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestParseWingetUpgradeEN(t *testing.T) {
	pkgs := parseWingetUpgrade(read(t, "winget_upgrade_en.txt"))
	if len(pkgs) != 6 {
		t.Fatalf("6 Pakete erwartet, got %d: %+v", len(pkgs), pkgs)
	}
	want := Package{Name: "Google Chrome", ID: "Google.Chrome", Version: "131.0.6778.86", Available: "132.0.6834.83", Source: "winget"}
	if pkgs[0] != want {
		t.Errorf("Zeile 1 = %+v", pkgs[0])
	}
	if pkgs[2].ID != "Microsoft.VCRedist.2015+.x64" || pkgs[2].Name != "Microsoft Visual C++ 2015-2022 Re…" {
		t.Errorf("Zeile 3 = %+v", pkgs[2])
	}
	if pkgs[3].ID != "Notepad++.Notepad++" || pkgs[3].Available != "8.7" {
		t.Errorf("Notepad++ = %+v", pkgs[3])
	}
	if !pkgs[4].Truncated || pkgs[4].ID != "Microsoft.DotNet.DesktopRuntime.…" {
		t.Errorf("gekürzte ID nicht erkannt: %+v", pkgs[4])
	}
	if !pkgs[5].ExplicitOnly || pkgs[5].ID != "ESET.EndpointSecurity" || pkgs[5].Available != "12.0" {
		t.Errorf("explicit-targeting-Abschnitt falsch: %+v", pkgs[5])
	}
	for _, p := range pkgs[:5] {
		if p.ExplicitOnly {
			t.Errorf("%s fälschlich als ExplicitOnly markiert", p.ID)
		}
	}
}

func TestParseWingetUpgradeDE(t *testing.T) {
	pkgs := parseWingetUpgrade(read(t, "winget_upgrade_de.txt"))
	if len(pkgs) != 3 {
		t.Fatalf("3 Pakete erwartet, got %d: %+v", len(pkgs), pkgs)
	}
	if pkgs[1].ID != "Mozilla.Firefox.de" || pkgs[1].Version != "131.0" || pkgs[1].Available != "132.0" {
		t.Errorf("Firefox = %+v", pkgs[1])
	}
	if pkgs[2].Name != "Ein Programm mit Ümlaut" || pkgs[2].ID != "Beispiel.Umlaut" {
		t.Errorf("Umlaut-Zeile = %+v", pkgs[2])
	}
}

func TestParseWingetSearch(t *testing.T) {
	pkgs := parseWingetList(read(t, "winget_search_en.txt"), true)
	if len(pkgs) != 2 {
		t.Fatalf("2 Treffer erwartet, got %+v", pkgs)
	}
	if pkgs[0].ID != "N0deZ3r0.Win11Privacy" || pkgs[0].Source != "winget" || pkgs[0].Available != "" {
		t.Errorf("Treffer 1 = %+v", pkgs[0])
	}
	if pkgs[1].ID != "OO-Software.ShutUp10" || pkgs[1].Version != "1.9.1436" {
		t.Errorf("Treffer 2 = %+v", pkgs[1])
	}
}

func TestExportAndResolveTruncated(t *testing.T) {
	ex, err := parseWingetExport([]byte(read(t, "winget_export.json")))
	if err != nil {
		t.Fatal(err)
	}
	if len(ex) != 5 || ex[0].Source != "winget" {
		t.Fatalf("Export = %+v", ex)
	}
	pkgs := parseWingetUpgrade(read(t, "winget_upgrade_en.txt"))
	known := make([]string, len(ex))
	for i, p := range ex {
		known[i] = p.ID
	}
	resolveTruncated(pkgs, known)
	if pkgs[4].ID != "Microsoft.DotNet.DesktopRuntime.8" || pkgs[4].Truncated {
		t.Errorf("Auflösung fehlgeschlagen: %+v", pkgs[4])
	}
}

func TestParseNoTable(t *testing.T) {
	if p := parseWingetUpgrade("No installed package found matching input criteria.\n"); len(p) != 0 {
		t.Errorf("keine Pakete erwartet, got %+v", p)
	}
}

func TestWingetCommands(t *testing.T) {
	w := &Winget{path: "winget"}
	cases := []struct {
		a    Action
		id   string
		o    Options
		want string
	}{
		{ActionInstall, "Mozilla.Firefox.de", Options{Silent: true, Scope: "machine"},
			"winget install --id Mozilla.Firefox.de -e --source winget --accept-package-agreements --scope machine --silent --accept-source-agreements --disable-interactivity"},
		{ActionUpgrade, "Google.Chrome", Options{},
			"winget upgrade --id Google.Chrome -e --accept-package-agreements --accept-source-agreements --disable-interactivity"},
		{ActionUpgradeAll, "", Options{Silent: true},
			"winget upgrade --all --accept-package-agreements --silent --accept-source-agreements --disable-interactivity"},
		{ActionUninstall, "ESET.AVRemover", Options{},
			"winget uninstall --id ESET.AVRemover -e --accept-source-agreements --disable-interactivity"},
		{ActionPin, "ESET.EndpointSecurity", Options{},
			"winget pin add --id ESET.EndpointSecurity -e --accept-source-agreements --disable-interactivity"},
		{ActionUnpin, "ESET.EndpointSecurity", Options{},
			"winget pin remove --id ESET.EndpointSecurity -e --accept-source-agreements --disable-interactivity"},
		{ActionSearch, "windows 11 privacy", Options{Sources: []string{"winget", "msstore"}},
			"winget search --query windows 11 privacy --accept-source-agreements --disable-interactivity"},
	}
	for _, c := range cases {
		got, err := w.Command(c.a, c.id, c.o)
		if err != nil {
			t.Errorf("%s: %v", c.a, err)
			continue
		}
		if strings.Join(got, " ") != c.want {
			t.Errorf("%s:\n got  %s\n want %s", c.a, strings.Join(got, " "), c.want)
		}
	}
	// Suchbegriff bleibt ein einzelnes Argument
	got, _ := w.Command(ActionSearch, "windows 11 privacy", Options{})
	if got[3] != "windows 11 privacy" {
		t.Errorf("Suchbegriff zerlegt: %q", got)
	}
}

func TestBrewCommands(t *testing.T) {
	b := &Brew{path: "brew"}
	cases := []struct {
		a    Action
		id   string
		o    Options
		want []string
	}{
		{ActionInstall, "google-chrome", Options{Cask: true}, []string{"brew", "install", "--cask", "google-chrome"}},
		{ActionInstall, "smartmontools", Options{}, []string{"brew", "install", "smartmontools"}},
		{ActionUpgradeAll, "", Options{Greedy: true}, []string{"brew", "upgrade", "--greedy"}},
		{ActionUpgrade, "firefox", Options{Cask: true, Greedy: true}, []string{"brew", "upgrade", "--cask", "--greedy", "firefox"}},
		{ActionUninstall, "vlc", Options{Cask: true}, []string{"brew", "uninstall", "--cask", "vlc"}},
		{ActionPin, "node", Options{}, []string{"brew", "pin", "node"}},
		{ActionOutdated, "", Options{}, []string{"brew", "outdated", "--json=v2"}},
	}
	for _, c := range cases {
		got, err := b.Command(c.a, c.id, c.o)
		if err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: got %q (%v), want %q", c.a, got, err, c.want)
		}
	}
	if _, err := b.Command(ActionPin, "vlc", Options{Cask: true}); err == nil {
		t.Error("Pin für Cask muss abgelehnt werden")
	}
}

func TestValidation(t *testing.T) {
	good := map[string][]string{
		"winget": {"Google.Chrome", "Notepad++.Notepad++", "Microsoft.VCRedist.2015+.x64", "9NBLGGH4NNS1", "OO-Software.ShutUp10"},
		"brew":   {"google-chrome", "openssl@3", "homebrew/cask-versions/firefox-esr", "c++filt"},
	}
	bad := map[string][]string{
		"winget": {"", "-e", "Foo;calc", "Foo Bar", "Foo&Bar", "Foo|x", "$(x)"},
		"brew":   {"", "--force", "Google-Chrome", "a b", "x;y", "../etc"},
	}
	for m, ids := range good {
		for _, id := range ids {
			if err := ValidateID(m, id); err != nil {
				t.Errorf("%s %q sollte gültig sein: %v", m, id, err)
			}
		}
	}
	for m, ids := range bad {
		for _, id := range ids {
			if err := ValidateID(m, id); err == nil {
				t.Errorf("%s %q sollte abgelehnt werden", m, id)
			}
		}
	}
	if _, err := ValidateQuery("--source evil"); err == nil {
		t.Error("Suchbegriff mit führendem - muss abgelehnt werden")
	}
	if _, err := ValidateQuery("a\nb"); err == nil {
		t.Error("Steuerzeichen müssen abgelehnt werden")
	}
}

func TestWingetExitCodes(t *testing.T) {
	ok, reboot, msg := describeWingetExit(int(int32(-1978335189))) // 0x8A15002B als int32
	if !ok || reboot || msg != "Kein Update verfügbar" {
		t.Errorf("0x8A15002B: %v %v %q", ok, reboot, msg)
	}
	ok, reboot, _ = describeWingetExit(0x8A150109)
	if !ok || !reboot {
		t.Errorf("Neustart-Code falsch: %v %v", ok, reboot)
	}
	ok, _, msg = describeWingetExit(0x8A15010C)
	if ok || !strings.Contains(msg, "abgebrochen") {
		t.Errorf("UAC-Abbruch: %v %q", ok, msg)
	}
	_, _, msg = describeWingetExit(0x8A15FFFF)
	if !strings.Contains(msg, "0x8A15FFFF") {
		t.Errorf("unbekannter Code ohne Hex: %q", msg)
	}
}

func TestBrewJSON(t *testing.T) {
	out, err := parseBrewOutdated([]byte(read(t, "brew_outdated.json")))
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 4 {
		t.Fatalf("4 Pakete erwartet: %+v", out)
	}
	if out[1].ID != "node" || !out[1].Pinned || out[1].Version != "20.2.0" {
		t.Errorf("node = %+v", out[1])
	}
	if out[3].ID != "vlc" || out[3].Version != "3.0.20" || out[3].Source != SourceBrewCask {
		t.Errorf("vlc (String-Version) = %+v", out[3])
	}
	inst, err := parseBrewInstalled([]byte(read(t, "brew_installed.json")))
	if err != nil {
		t.Fatal(err)
	}
	if len(inst) != 3 {
		t.Fatalf("3 Pakete erwartet (ohne Abhängigkeit openssl): %+v", inst)
	}
	if inst[1].Name != "Google Chrome" || !inst[1].AutoUpdates || inst[1].Available != "132.0" {
		t.Errorf("Chrome = %+v", inst[1])
	}
}

func TestParseBrewSearch(t *testing.T) {
	got := parseBrewSearch("firefox\nfirefox@developer-edition\n\nIf you meant \"fire\" precisely:\n")
	if !reflect.DeepEqual(got, []string{"firefox", "firefox@developer-edition"}) {
		t.Errorf("got %q", got)
	}
}

func TestPasswordDetection(t *testing.T) {
	if !rePasswordNeeded.MatchString("==> Running installer for teamviewer\nsudo: a terminal is required to read the password") {
		t.Error("Passwortabfrage nicht erkannt")
	}
}

func TestVersionAtLeast(t *testing.T) {
	if !versionAtLeast("1.9.25200", "1.5") || versionAtLeast("1.4.1", "1.5") || !versionAtLeast("1.10", "1.9") {
		t.Error("Versionsvergleich falsch")
	}
}

func TestChangelogRoundTrip(t *testing.T) {
	dir := t.TempDir()
	now := mustTime(t, "2026-11-21T10:42:00Z")
	if err := AppendChange(dir, ChangeEntry{Time: now, Action: "Update", Package: "Google.Chrome", Before: "131.0", After: "132.0", Success: true}); err != nil {
		t.Fatal(err)
	}
	if err := AppendChange(dir, ChangeEntry{Time: now, Action: "Update", Package: "Notepad++.Notepad++", Before: "8.6", Message: "UAC | abgelehnt"}); err != nil {
		t.Fatal(err)
	}
	rows, err := ReadChanges(dir)
	if err != nil || len(rows) != 2 {
		t.Fatalf("rows=%v err=%v", rows, err)
	}
	if rows[0][2] != "Google.Chrome" || rows[0][5] != "✓" || rows[1][4] != "–" || rows[1][5] != "✗ UAC / abgelehnt" {
		t.Errorf("rows = %q", rows)
	}
	b, _ := os.ReadFile(ChangelogPath(dir))
	if strings.Count(string(b), "## Paketänderungen") != 1 {
		t.Error("Kopfzeile doppelt")
	}
}

func mustTime(t *testing.T, s string) (tm time.Time) {
	t.Helper()
	tm, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatal(err)
	}
	return tm
}
