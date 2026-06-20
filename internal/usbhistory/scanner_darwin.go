//go:build darwin

package usbhistory

import (
	"encoding/json"
	"os/exec"
	"strings"
)

// spUSBData ist das Top-Level-Struct für system_profiler SPUSBDataType -json.
type spUSBData struct {
	SPUSBDataType []spUSBBus `json:"SPUSBDataType"`
}

// spUSBBus repräsentiert einen USB-Bus mit seinen Geräten.
type spUSBBus struct {
	Name         string      `json:"_name"`
	Items        []spUSBItem `json:"_items,omitempty"`
}

// spUSBItem repräsentiert ein USB-Gerät (kann selbst wieder Items enthalten).
type spUSBItem struct {
	Name         string      `json:"_name"`
	Manufacturer string      `json:"manufacturer,omitempty"`
	ProductID    string      `json:"product_id,omitempty"`
	VendorID     string      `json:"vendor_id,omitempty"`
	SerialNumber string      `json:"serial_num,omitempty"`
	Speed        string      `json:"device_speed,omitempty"`
	Location     string      `json:"location_id,omitempty"`
	Items        []spUSBItem `json:"_items,omitempty"`
}

// Scan listet alle angeschlossenen USB-Geräte auf.
func Scan() (*ScanResult, error) {
	result := &ScanResult{}

	out, err := exec.Command("system_profiler", "SPUSBDataType", "-json").Output()
	if err != nil {
		return result, nil
	}

	var data spUSBData
	if err := json.Unmarshal(out, &data); err != nil {
		result.Errors = append(result.Errors, ScanError{
			Module:  "system_profiler",
			Message: "JSON-Parsing fehlgeschlagen: " + err.Error(),
		})
		return result, nil
	}

	for _, bus := range data.SPUSBDataType {
		collectItems(bus.Items, &result.Devices)
	}

	return result, nil
}

// collectItems rekursiv alle USB-Geräte aus der Baumstruktur einsammeln.
func collectItems(items []spUSBItem, out *[]USBDevice) {
	for _, item := range items {
		dev := USBDevice{
			Name:         item.Name,
			Manufacturer: item.Manufacturer,
			ProductID:    item.ProductID,
			VendorID:     item.VendorID,
			SerialNumber: item.SerialNumber,
			Speed:        normalizeSpeed(item.Speed),
			Location:     item.Location,
			IsHub:        strings.Contains(strings.ToLower(item.Name), "hub"),
		}

		if item.ProductID != "" || item.VendorID != "" || item.SerialNumber != "" {
			*out = append(*out, dev)
		} else if item.Name != "" && !dev.IsHub {
			*out = append(*out, dev)
		}

		if len(item.Items) > 0 {
			collectItems(item.Items, out)
		}
	}
}

func normalizeSpeed(s string) string {
	switch strings.ToLower(s) {
	case "high_speed":
		return "USB 2.0 (480 Mb/s)"
	case "super_speed":
		return "USB 3.0 (5 Gb/s)"
	case "super_speed_plus":
		return "USB 3.1 (10 Gb/s)"
	case "full_speed":
		return "USB 1.1 (12 Mb/s)"
	case "low_speed":
		return "USB 1.0 (1.5 Mb/s)"
	}
	return s
}
