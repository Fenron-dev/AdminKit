//go:build linux

package tools

import "fmt"

// RunCommand ist auf Linux noch nicht implementiert (Phase 8).
func RunCommand(tool, target string) (string, error) {
	return "", fmt.Errorf("Linux-Konsolen-Tools sind in Phase 8 geplant (Tool: %s)", tool)
}

// GetClipboard ist auf Linux noch nicht implementiert.
func GetClipboard() (string, error) {
	return "", fmt.Errorf("Zwischenablage-Zugriff auf Linux ist in Phase 8 geplant")
}

// GetUptime ist auf Linux noch nicht implementiert.
func GetUptime() (string, error) {
	return "", fmt.Errorf("Uptime auf Linux ist in Phase 8 geplant")
}
