//go:build windows

package services

import (
	"adminkit/internal/execx"
	"fmt"
	"strings"
)

// StartService startet einen Windows-Dienst via sc.exe.
func StartService(name string) (string, error) {
	out, err := execx.Command("sc", "start", name).CombinedOutput()
	msg := strings.TrimSpace(string(out))
	if err != nil {
		return "", fmt.Errorf("sc start %s: %s", name, msg)
	}
	return msg, nil
}

// StopService beendet einen Windows-Dienst via sc.exe.
func StopService(name string) (string, error) {
	out, err := execx.Command("sc", "stop", name).CombinedOutput()
	msg := strings.TrimSpace(string(out))
	if err != nil {
		return "", fmt.Errorf("sc stop %s: %s", name, msg)
	}
	return msg, nil
}
