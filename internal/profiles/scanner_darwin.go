//go:build darwin

package profiles

import (
	"encoding/json"
	"os/exec"
	"strings"
	"time"
)

// spProfileData ist das Top-Level-Struct für system_profiler -json Ausgabe.
type spProfileData struct {
	SPConfigurationProfileDataType []spProfile `json:"SPConfigurationProfileDataType"`
}

// spProfile spiegelt ein Profil-Objekt aus system_profiler -json.
type spProfile struct {
	Name         string `json:"_name"`
	Identifier   string `json:"spconfigprofile_ProfileIdentifier"`
	Organization string `json:"spconfigprofile_organization"`
	Description  string `json:"spconfigprofile_description"`
	InstallDate  string `json:"spconfigprofile_install_date"`
	Verified     string `json:"spconfigprofile_verification_state"`
	PayloadType  string `json:"spconfigprofile_PayloadType"`
	IsManaged    string `json:"spconfigprofile_IsManaged"`
}

// Scan listet alle installierten Konfigurationsprofile auf.
func Scan() (*ScanResult, error) {
	result := &ScanResult{}

	out, err := exec.Command("system_profiler", "SPConfigurationProfileDataType", "-json").Output()
	if err != nil {
		// system_profiler schlägt fehl wenn keine Profile installiert sind oder macOS-Version
		// kein JSON unterstützt — als leeres Ergebnis behandeln, nicht als Fehler.
		return result, nil
	}

	var data spProfileData
	if err := json.Unmarshal(out, &data); err != nil {
		result.Errors = append(result.Errors, ScanError{
			Module:  "system_profiler",
			Message: "JSON-Parsing fehlgeschlagen: " + err.Error(),
		})
		return result, nil
	}

	for _, p := range data.SPConfigurationProfileDataType {
		profile := ConfigProfile{
			Name:         p.Name,
			Identifier:   p.Identifier,
			Organization: p.Organization,
			Description:  p.Description,
			Verified:     strings.EqualFold(p.Verified, "verified"),
			IsSystem:     true, // system_profiler liefert primär System-Level-Profile
		}

		if p.InstallDate != "" {
			if t := parseProfileDate(p.InstallDate); !t.IsZero() {
				profile.InstallDate = t
			}
		}

		if p.PayloadType != "" {
			for _, pt := range strings.Split(p.PayloadType, ",") {
				pt = strings.TrimSpace(pt)
				if pt != "" {
					profile.PayloadTypes = append(profile.PayloadTypes, pt)
				}
			}
		}

		result.Profiles = append(result.Profiles, profile)
	}

	return result, nil
}

// parseProfileDate versucht Datumsformate aus system_profiler zu parsen.
func parseProfileDate(s string) time.Time {
	formats := []string{
		"2006-01-02 15:04:05 +0000",
		"2006-01-02 15:04:05 -0700",
		"January 2, 2006 at 3:04:05 PM",
		"Monday, January 2, 2006 at 3:04:05 PM",
		"2006-01-02T15:04:05Z",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t
		}
	}
	return time.Time{}
}
