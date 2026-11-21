package packages

import (
	"fmt"
	"regexp"
	"strings"
)

var (
	// winget-IDs: Publisher.Name, z. B. "Mozilla.Firefox.de", "Notepad++.Notepad++",
	// "Microsoft.VCRedist.2015+.x64". Store-IDs sind alphanumerisch (9NBLGGH4NNS1).
	reWingetID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._+\-]*$`)
	// brew: Formeln/Casks klein, optional mit Tap-Präfix (user/tap/name) und @Version.
	reBrewID = regexp.MustCompile(`^[a-z0-9][a-z0-9@._+\-]*(/[a-z0-9][a-z0-9@._+\-]*){0,2}$`)
)

// ValidateID prüft eine Paket-ID, bevor sie an exec.Command geht.
func ValidateID(manager, id string) error {
	if len(id) == 0 || len(id) > 200 {
		return fmt.Errorf("ungültige Paket-ID")
	}
	var ok bool
	switch manager {
	case "winget":
		ok = reWingetID.MatchString(id)
	case "brew":
		ok = reBrewID.MatchString(id)
	}
	if !ok {
		return fmt.Errorf("ungültige Paket-ID %q", id)
	}
	return nil
}

// ValidateQuery prüft einen Suchbegriff. Er darf nicht mit „-“ beginnen
// (sonst würde er als Option interpretiert) und keine Steuerzeichen enthalten.
func ValidateQuery(q string) (string, error) {
	q = strings.TrimSpace(q)
	if q == "" {
		return "", fmt.Errorf("Suchbegriff fehlt")
	}
	if len(q) > 100 {
		return "", fmt.Errorf("Suchbegriff zu lang")
	}
	if strings.HasPrefix(q, "-") {
		return "", fmt.Errorf("Suchbegriff darf nicht mit „-“ beginnen")
	}
	for _, r := range q {
		if r < 0x20 || r == 0x7f {
			return "", fmt.Errorf("Suchbegriff enthält Steuerzeichen")
		}
	}
	return q, nil
}
