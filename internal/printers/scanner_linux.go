//go:build linux

package printers

import (
	"fmt"
	"os/exec"
	"strings"
)

// Scan listet Drucker via lpstat auf (CUPS).
func Scan() ScanResult {
	result := ScanResult{}

	out, err := exec.Command("lpstat", "-p", "-d").Output()
	if err != nil {
		result.Errors = append(result.Errors, ScanError{
			Module:  "lpstat",
			Message: fmt.Sprintf("lpstat fehlgeschlagen: %v", err),
		})
		return result
	}

	defaultPrinter := ""
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "default destination:") {
			defaultPrinter = strings.TrimSpace(strings.TrimPrefix(line, "default destination:"))
		}
	}

	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "printer ") {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		name := parts[1]
		status := StatusUnknown
		if strings.Contains(line, "is idle") {
			status = StatusReady
		} else if strings.Contains(line, "disabled") {
			status = StatusOffline
		} else if strings.Contains(line, "processing") {
			status = StatusPrinting
		}
		result.Printers = append(result.Printers, PrinterInfo{
			Name:      name,
			Status:    status,
			IsDefault: name == defaultPrinter,
		})
	}
	return result
}
