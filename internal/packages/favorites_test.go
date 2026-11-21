package packages

import (
	"os"
	"strings"
	"testing"
	"time"
)

func TestFavoritesSeedAndRoundTrip(t *testing.T) {
	dir := t.TempDir()
	f, seeded, err := LoadFavorites(dir)
	if err != nil || !seeded {
		t.Fatalf("Startbestand: seeded=%v err=%v", seeded, err)
	}
	if len(f.Favorites) < 19 {
		t.Errorf("Startbestand zu klein: %d", len(f.Favorites))
	}
	if _, err := os.Stat(FavoritesPath(dir)); err != nil {
		t.Fatal("favorites.yaml wurde nicht in den Vault geschrieben")
	}
	f.Favorites[0].Notiz = "Nur ohne Edge-Vorgabe"
	if err := SaveFavorites(dir, f); err != nil {
		t.Fatal(err)
	}
	g, seeded, err := LoadFavorites(dir)
	if err != nil || seeded || g.Favorites[0].Notiz != "Nur ohne Edge-Vorgabe" || g.Updated.IsZero() {
		t.Fatalf("Round-Trip: seeded=%v err=%v fav=%+v", seeded, err, g.Favorites[0])
	}
}

func TestFavoritesValidate(t *testing.T) {
	f := &Favorites{Favorites: []Favorite{{Name: "X", Winget: "Foo;calc"}}}
	if f.Validate() == nil {
		t.Error("ungültige ID muss abgelehnt werden")
	}
	f = &Favorites{Favorites: []Favorite{{Name: "X"}}}
	if f.Validate() == nil {
		t.Error("Favorit ohne ID muss abgelehnt werden")
	}
	f = &Favorites{Favorites: []Favorite{{Name: "X", Brew: "wget"}, {Name: "X", Brew: "curl"}}}
	if f.Validate() == nil {
		t.Error("doppelter Name muss abgelehnt werden")
	}
}

func TestProfileResolution(t *testing.T) {
	f, _ := DefaultFavorites()
	office, err := f.ProfileFavorites("Neuer PC Büro")
	if err != nil || len(office) != 5 || office[0].Name != "Google Chrome" {
		t.Fatalf("Büro-Profil: %v %+v", err, office)
	}
	tech, _ := f.ProfileFavorites("Techniker-Werkzeuge")
	names := []string{}
	for _, x := range tech {
		names = append(names, x.Name)
	}
	j := strings.Join(names, ",")
	if !strings.Contains(j, "CrystalDiskInfo") || !strings.Contains(j, "Notepad++") || strings.Count(j, "Sysinternals Suite") != 1 {
		t.Errorf("Tag-Profil: %s", j)
	}
	id, src := Favorite{Brew: "smartmontools", BrewCask: ""}.IDFor("brew")
	if id != "smartmontools" || src != SourceBrew {
		t.Errorf("IDFor brew: %s %s", id, src)
	}
	if id, _ := (Favorite{Brew: "x"}).IDFor("winget"); id != "" {
		t.Error("ohne winget-ID darf auf Windows nichts kommen")
	}
}

func TestImportPortalWingetBrewfile(t *testing.T) {
	f, _ := DefaultFavorites()
	n := len(f.Favorites)
	res, err := f.Import([]byte(`{"app":"ideler-portal","type":"winget-favoriten","version":1,
		"favorites":[{"id":"Google.Chrome","tags":["Büro"],"note":"Eigene Chrome-Notiz"},{"id":"Microsoft.Teams","tags":["Büro"]}]}`))
	if err != nil || res.Added != 1 || res.Updated != 1 || !strings.Contains(res.Format, "Portal") {
		t.Fatalf("Portal-Import: %+v %v", res, err)
	}
	if f.Favorites[0].Notiz != "Eigene Chrome-Notiz" || strings.Join(f.Favorites[0].Tags, ",") != "Neuer PC,Büro" {
		t.Errorf("Merge: %+v", f.Favorites[0])
	}
	if len(f.Favorites) != n+1 || f.Favorites[n].Winget != "Microsoft.Teams" {
		t.Errorf("neuer Favorit fehlt")
	}
	res, err = f.Import([]byte(read(t, "winget_export.json")))
	if err != nil || res.Format != "winget-Importdatei" || res.Added != 2 { // DotNet + VCRedist sind neu
		t.Fatalf("winget-Import: %+v %v", res, err)
	}
	res, err = f.Import([]byte("tap \"homebrew/bundle\"\nbrew \"htop\"\ncask \"vlc\"\ncask \"rectangle\"\n"))
	if err != nil || res.Added != 2 || res.Updated != 1 {
		t.Fatalf("Brewfile: %+v %v", res, err)
	}
	if err := f.Validate(); err != nil {
		t.Errorf("nach Import ungültig: %v", err)
	}
	if _, err := f.Import([]byte("irgendwas")); err == nil {
		t.Error("unbekanntes Format muss Fehler liefern")
	}
}

func TestExports(t *testing.T) {
	f, _ := DefaultFavorites()
	js, err := f.ExportWingetJSON(time.Date(2026, 11, 21, 0, 0, 0, 0, time.UTC))
	if err != nil || !strings.Contains(string(js), `"PackageIdentifier": "7zip.7zip"`) {
		t.Fatalf("winget-JSON: %v", err)
	}
	// Round-Trip: der Export muss sich wieder importieren lassen
	ex, err := parseWingetExport(js)
	if err != nil || len(ex) != 20 {
		t.Errorf("Export nicht re-importierbar: %d %v", len(ex), err)
	}
	bf := string(f.ExportBrewfile())
	if !strings.Contains(bf, `brew "smartmontools"`) || !strings.Contains(bf, `cask "google-chrome"`) {
		t.Errorf("Brewfile:\n%s", bf)
	}
}
