//go:build darwin

package services

import (
	"fmt"
	"os/exec"
	"strings"
)

// StartService startet einen launchd-Service auf macOS.
// Versucht zuerst ohne Admin; bei Fehler mit osascript-Eskalation.
func StartService(name string) (string, error) {
	return controlService("start", name)
}

// StopService beendet einen launchd-Service auf macOS.
func StopService(name string) (string, error) {
	return controlService("stop", name)
}

func controlService(action, name string) (string, error) {
	// Erst ohne Admin versuchen
	out, err := exec.Command("launchctl", action, name).CombinedOutput()
	if err == nil {
		return fmt.Sprintf("launchctl %s %s: OK", action, name), nil
	}
	// Fehlermeldung auswerten
	msg := strings.TrimSpace(string(out))

	// Bei Berechtigungsfehler: über osascript eskalieren (einmaliger Admin-Dialog)
	script := fmt.Sprintf(`do shell script "launchctl %s %s" with administrator privileges`, action, name)
	adminOut, adminErr := exec.Command("osascript", "-e", script).CombinedOutput()
	if adminErr != nil {
		return "", fmt.Errorf("launchctl %s %s: %s (Admin: %s)", action, name, msg, strings.TrimSpace(string(adminOut)))
	}
	return fmt.Sprintf("launchctl %s %s (Admin): OK", action, name), nil
}
