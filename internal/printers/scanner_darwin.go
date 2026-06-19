//go:build darwin

package printers

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

type spPrinterEntry struct {
	Name      string `json:"_name"`
	URI       string `json:"ppd_uri"`
	Driver    string `json:"ppd_name"`
	Status    string `json:"printer-state"`
	Location  string `json:"printer-location"`
	IsDefault bool   `json:"is_default_printer,omitempty"`
	IsShared  bool   `json:"is_shared_printer,omitempty"`
}

type spPrintersData struct {
	SPPrintersDataType []spPrinterEntry `json:"SPPrintersDataType"`
}

// Scan listet alle installierten Drucker via system_profiler und lpstat auf.
func Scan() ScanResult {
	result := ScanResult{}

	printers, err := scanViaSysProfiler()
	if err != nil {
		result.Errors = append(result.Errors, ScanError{
			Module:  "system_profiler",
			Message: err.Error(),
		})
		// Fallback: lpstat
		printers, err = scanViaLpstat()
		if err != nil {
			result.Errors = append(result.Errors, ScanError{
				Module:  "lpstat",
				Message: err.Error(),
			})
		}
	}

	result.Printers = printers
	return result
}

func scanViaSysProfiler() ([]PrinterInfo, error) {
	out, err := exec.Command("system_profiler", "SPPrintersDataType", "-json").Output()
	if err != nil {
		return nil, fmt.Errorf("system_profiler: %w", err)
	}

	var data spPrintersData
	if err := json.Unmarshal(out, &data); err != nil {
		return nil, fmt.Errorf("parse: %w", err)
	}

	var printers []PrinterInfo
	for _, e := range data.SPPrintersDataType {
		p := PrinterInfo{
			Name:      e.Name,
			Driver:    e.Driver,
			Location:  e.Location,
			IsDefault: e.IsDefault,
			IsShared:  e.IsShared,
			Status:    mapStatus(e.Status),
		}
		p.Port, p.IsNetwork, p.IPAddress = parseURI(e.URI)
		printers = append(printers, p)
	}
	return printers, nil
}

func scanViaLpstat() ([]PrinterInfo, error) {
	out, err := exec.Command("lpstat", "-p", "-d").Output()
	if err != nil {
		return nil, fmt.Errorf("lpstat: %w", err)
	}

	var printers []PrinterInfo
	defaultPrinter := ""

	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "default destination:") {
			defaultPrinter = strings.TrimSpace(strings.TrimPrefix(line, "default destination:"))
			continue
		}
		if strings.HasPrefix(line, "printer ") {
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
			}
			printers = append(printers, PrinterInfo{
				Name:      name,
				Status:    status,
				IsDefault: name == defaultPrinter,
			})
		}
	}
	return printers, nil
}

func parseURI(uri string) (port string, isNetwork bool, ip string) {
	if uri == "" {
		return "", false, ""
	}
	switch {
	case strings.HasPrefix(uri, "usb://"):
		return "USB", false, ""
	case strings.HasPrefix(uri, "ipp://"), strings.HasPrefix(uri, "ipps://"),
		strings.HasPrefix(uri, "http://"), strings.HasPrefix(uri, "https://"):
		// extract host
		rest := uri[strings.Index(uri, "//")+2:]
		host := strings.SplitN(rest, "/", 2)[0]
		host = strings.SplitN(host, ":", 2)[0]
		return "IPP (" + host + ")", true, host
	case strings.HasPrefix(uri, "lpd://"), strings.HasPrefix(uri, "socket://"):
		rest := uri[strings.Index(uri, "//")+2:]
		host := strings.SplitN(rest, "/", 2)[0]
		host = strings.SplitN(host, ":", 2)[0]
		return "TCP/IP (" + host + ")", true, host
	default:
		return uri, false, ""
	}
}

func mapStatus(s string) PrinterStatus {
	switch strings.ToLower(s) {
	case "3", "idle", "ready":
		return StatusReady
	case "5", "processing", "printing":
		return StatusPrinting
	case "stopped", "offline":
		return StatusOffline
	case "paused":
		return StatusPaused
	default:
		return StatusUnknown
	}
}
