//go:build windows

package printers

import (
	"fmt"
	"os/exec"
	"strings"
)

// Scan listet alle installierten Drucker via PowerShell Get-Printer auf.
func Scan() ScanResult {
	result := ScanResult{}

	printers, err := scanViaPowerShell()
	if err != nil {
		result.Errors = append(result.Errors, ScanError{
			Module:  "Get-Printer",
			Message: err.Error(),
		})
		return result
	}
	result.Printers = printers
	return result
}

func scanViaPowerShell() ([]PrinterInfo, error) {
	script := `
$printers = Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus,Default,Shared,ShareName,Location
$default = (Get-WmiObject -Query "SELECT * FROM Win32_Printer WHERE Default=True" | Select-Object -First 1).Name
foreach ($p in $printers) {
    $port = Get-PrinterPort -Name $p.PortName -ErrorAction SilentlyContinue
    $ip = if ($port.PrinterHostAddress) { $port.PrinterHostAddress } else { "" }
    Write-Output ("NAME=" + $p.Name + "|DRIVER=" + $p.DriverName + "|PORT=" + $p.PortName + "|STATUS=" + $p.PrinterStatus + "|DEFAULT=" + $p.Default + "|SHARED=" + $p.Shared + "|SHARENAME=" + $p.ShareName + "|LOCATION=" + $p.Location + "|IP=" + $ip)
}
`
	out, err := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script).Output()
	if err != nil {
		return nil, fmt.Errorf("powershell: %w", err)
	}

	var printers []PrinterInfo
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := parseFields(line)
		port := fields["PORT"]
		isNet := isNetworkPort(port)
		printers = append(printers, PrinterInfo{
			Name:      fields["NAME"],
			Driver:    fields["DRIVER"],
			Port:      port,
			Status:    mapStatus(fields["STATUS"]),
			IsDefault: fields["DEFAULT"] == "True",
			IsNetwork: isNet,
			IPAddress: fields["IP"],
			IsShared:  fields["SHARED"] == "True",
			ShareName: fields["SHARENAME"],
			Location:  fields["LOCATION"],
		})
	}
	return printers, nil
}

func parseFields(line string) map[string]string {
	m := make(map[string]string)
	for _, part := range strings.Split(line, "|") {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) == 2 {
			m[kv[0]] = strings.TrimSpace(kv[1])
		}
	}
	return m
}

func isNetworkPort(port string) bool {
	port = strings.ToUpper(port)
	return strings.HasPrefix(port, "IP_") ||
		strings.HasPrefix(port, "TCP") ||
		strings.HasPrefix(port, "WSD") ||
		strings.HasPrefix(port, "\\\\")
}

func mapStatus(s string) PrinterStatus {
	switch s {
	case "3", "Normal":
		return StatusReady
	case "4", "Printing":
		return StatusPrinting
	case "7", "Offline":
		return StatusOffline
	case "Paused":
		return StatusPaused
	case "Error":
		return StatusError
	default:
		return StatusUnknown
	}
}
