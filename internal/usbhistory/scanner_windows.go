//go:build windows

package usbhistory

import (
	"os/exec"
	"strings"
)

// Scan listet aktuell angeschlossene USB-Geräte via PowerShell auf.
func Scan() (*ScanResult, error) {
	result := &ScanResult{}

	// Get-PnpDevice listet Plug-and-Play-Geräte inkl. USB auf
	out, err := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command",
		"Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -like 'USB\\*' } | "+
			"Select-Object FriendlyName,Manufacturer,InstanceId,Status | "+
			"ConvertTo-Csv -NoTypeInformation").Output()
	if err != nil {
		result.Errors = append(result.Errors, ScanError{
			Module:  "powershell",
			Message: "Get-PnpDevice fehlgeschlagen: " + err.Error(),
		})
		return result, nil
	}

	lines := strings.Split(strings.ReplaceAll(string(out), "\r\n", "\n"), "\n")
	if len(lines) < 2 {
		return result, nil
	}

	for _, line := range lines[1:] { // Erste Zeile ist Header
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := parseCSVLine(line)
		if len(fields) < 4 {
			continue
		}
		name := strings.Trim(fields[0], "\"")
		mfr := strings.Trim(fields[1], "\"")
		instanceID := strings.Trim(fields[2], "\"")

		if name == "" {
			continue
		}

		vid, pid := extractVIDPID(instanceID)
		dev := USBDevice{
			Name:         name,
			Manufacturer: mfr,
			VendorID:     vid,
			ProductID:    pid,
			IsHub:        strings.Contains(strings.ToLower(name), "hub"),
		}
		result.Devices = append(result.Devices, dev)
	}

	return result, nil
}

// extractVIDPID extrahiert VendorID und ProductID aus einer InstanceId wie
// USB\VID_0781&PID_5567\...
func extractVIDPID(instanceID string) (vid, pid string) {
	parts := strings.Split(instanceID, "\\")
	if len(parts) < 2 {
		return
	}
	for _, part := range strings.Split(parts[1], "&") {
		if strings.HasPrefix(part, "VID_") {
			vid = strings.TrimPrefix(part, "VID_")
		} else if strings.HasPrefix(part, "PID_") {
			pid = strings.TrimPrefix(part, "PID_")
		}
	}
	return
}

// parseCSVLine parst eine einfache CSV-Zeile (Felder in Anführungszeichen).
func parseCSVLine(line string) []string {
	var fields []string
	inQuote := false
	current := strings.Builder{}
	for _, ch := range line {
		switch {
		case ch == '"':
			inQuote = !inQuote
		case ch == ',' && !inQuote:
			fields = append(fields, current.String())
			current.Reset()
		default:
			current.WriteRune(ch)
		}
	}
	fields = append(fields, current.String())
	return fields
}
