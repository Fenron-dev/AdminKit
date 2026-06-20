//go:build windows

package services

import (
	"fmt"
	"os/exec"
	"strings"
)

// StartService startet einen Windows-Dienst via sc.exe.
func StartService(name string) (string, error) {
	out, err := exec.Command("sc", "start", name).CombinedOutput()
	msg := strings.TrimSpace(string(out))
	if err != nil {
		return "", fmt.Errorf("sc start %s: %s", name, msg)
	}
	return msg, nil
}

// StopService beendet einen Windows-Dienst via sc.exe.
func StopService(name string) (string, error) {
	out, err := exec.Command("sc", "stop", name).CombinedOutput()
	msg := strings.TrimSpace(string(out))
	if err != nil {
		return "", fmt.Errorf("sc stop %s: %s", name, msg)
	}
	return msg, nil
}
