//go:build windows

package browserext

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

// Scan durchsucht alle bekannten Browser-Profile auf Windows nach installierten Erweiterungen.
func Scan() ScanResult {
	var result ScanResult

	localAppData := os.Getenv("LOCALAPPDATA")
	appData := os.Getenv("APPDATA")

	if localAppData == "" {
		result.Errors = append(result.Errors, ScanError{"browserext", "LOCALAPPDATA nicht gesetzt"})
		return result
	}

	chromiumBrowsers := []struct {
		Name    string
		BaseDir string
	}{
		{"Chrome", filepath.Join(localAppData, "Google", "Chrome", "User Data")},
		{"Brave", filepath.Join(localAppData, "BraveSoftware", "Brave-Browser", "User Data")},
		{"Edge", filepath.Join(localAppData, "Microsoft", "Edge", "User Data")},
		{"Chromium", filepath.Join(localAppData, "Chromium", "User Data")},
		{"Opera", filepath.Join(appData, "Opera Software", "Opera Stable")},
		{"Vivaldi", filepath.Join(localAppData, "Vivaldi", "User Data")},
	}

	for _, b := range chromiumBrowsers {
		exts, errs := scanChromiumBrowser(b.Name, b.BaseDir)
		result.Extensions = append(result.Extensions, exts...)
		result.Errors = append(result.Errors, errs...)
	}

	if appData != "" {
		ffExts, ffErrs := scanFirefox(filepath.Join(appData, "Mozilla", "Firefox", "Profiles"))
		result.Extensions = append(result.Extensions, ffExts...)
		result.Errors = append(result.Errors, ffErrs...)
	}

	return result
}

// ─── Chromium-basierte Browser ───────────────────────────────────────────────

type chromiumManifest struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	Description string `json:"description"`
}

func scanChromiumBrowser(browser, baseDir string) ([]Extension, []ScanError) {
	profiles := []string{"Default"}
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		return nil, nil
	}
	for _, e := range entries {
		if e.IsDir() && strings.HasPrefix(e.Name(), "Profile ") {
			profiles = append(profiles, e.Name())
		}
	}

	var exts []Extension
	var errs []ScanError
	seen := make(map[string]bool)

	for _, profile := range profiles {
		extDir := filepath.Join(baseDir, profile, "Extensions")
		idDirs, err := os.ReadDir(extDir)
		if err != nil {
			continue
		}
		for _, idEntry := range idDirs {
			if !idEntry.IsDir() {
				continue
			}
			extID := idEntry.Name()
			if seen[extID] {
				continue
			}

			verDirs, err := os.ReadDir(filepath.Join(extDir, extID))
			if err != nil {
				continue
			}
			for _, verEntry := range verDirs {
				if !verEntry.IsDir() {
					continue
				}
				manifestPath := filepath.Join(extDir, extID, verEntry.Name(), "manifest.json")
				data, err := os.ReadFile(manifestPath)
				if err != nil {
					continue
				}
				var m chromiumManifest
				if err := json.Unmarshal(data, &m); err != nil {
					continue
				}

				name := m.Name
				if strings.HasPrefix(name, "__MSG_") {
					resolved := resolveI18nMessage(filepath.Join(extDir, extID, verEntry.Name()), name)
					if resolved != "" {
						name = resolved
					}
				}
				if name == "" {
					name = extID
				}

				desc := m.Description
				if strings.HasPrefix(desc, "__MSG_") {
					desc = resolveI18nMessage(filepath.Join(extDir, extID, verEntry.Name()), desc)
				}

				exts = append(exts, Extension{
					Browser:     browser,
					Name:        name,
					Version:     m.Version,
					ID:          extID,
					Description: desc,
					Enabled:     true,
				})
				seen[extID] = true
				break
			}
		}
	}
	return exts, errs
}

func resolveI18nMessage(extDir, msgKey string) string {
	key := strings.TrimSuffix(strings.TrimPrefix(msgKey, "__MSG_"), "__")
	for _, locale := range []string{"en", "en_US", "en_GB", "de"} {
		data, err := os.ReadFile(filepath.Join(extDir, "_locales", locale, "messages.json"))
		if err != nil {
			continue
		}
		var messages map[string]struct {
			Message string `json:"message"`
		}
		if err := json.Unmarshal(data, &messages); err != nil {
			continue
		}
		for k, v := range messages {
			if strings.EqualFold(k, key) && v.Message != "" {
				return v.Message
			}
		}
	}
	return ""
}

// ─── Firefox ─────────────────────────────────────────────────────────────────

type firefoxExtensionsFile struct {
	Addons []struct {
		ID      string `json:"id"`
		Version string `json:"version"`
		Active  bool   `json:"active"`
		DefaultLocale struct {
			Name        string `json:"name"`
			Description string `json:"description"`
		} `json:"defaultLocale"`
		Location string `json:"location"`
	} `json:"addons"`
}

func scanFirefox(profilesDir string) ([]Extension, []ScanError) {
	profileDirs, err := os.ReadDir(profilesDir)
	if err != nil {
		return nil, nil
	}

	var exts []Extension
	var errs []ScanError
	seen := make(map[string]bool)

	for _, pd := range profileDirs {
		if !pd.IsDir() {
			continue
		}
		data, err := os.ReadFile(filepath.Join(profilesDir, pd.Name(), "extensions.json"))
		if err != nil {
			continue
		}
		var ff firefoxExtensionsFile
		if err := json.Unmarshal(data, &ff); err != nil {
			errs = append(errs, ScanError{"browserext.firefox", err.Error()})
			continue
		}
		for _, addon := range ff.Addons {
			if seen[addon.ID] {
				continue
			}
			if strings.HasPrefix(addon.Location, "app-system") ||
				addon.Location == "app-builtin" ||
				strings.HasPrefix(addon.ID, "firefox-") {
				continue
			}
			name := addon.DefaultLocale.Name
			if name == "" {
				name = addon.ID
			}
			exts = append(exts, Extension{
				Browser:     "Firefox",
				Name:        name,
				Version:     addon.Version,
				ID:          addon.ID,
				Description: addon.DefaultLocale.Description,
				Enabled:     addon.Active,
			})
			seen[addon.ID] = true
		}
	}
	return exts, errs
}
