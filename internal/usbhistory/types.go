// Package usbhistory listet angeschlossene USB-Geräte auf.
package usbhistory

import "time"

// USBDevice beschreibt ein USB-Gerät.
type USBDevice struct {
	Name         string    `json:"name"`
	Manufacturer string    `json:"manufacturer,omitempty"`
	ProductID    string    `json:"product_id,omitempty"`
	VendorID     string    `json:"vendor_id,omitempty"`
	SerialNumber string    `json:"serial_number,omitempty"`
	Class        string    `json:"class,omitempty"`
	Speed        string    `json:"speed,omitempty"`
	Location     string    `json:"location,omitempty"`
	BSDName      string    `json:"bsd_name,omitempty"` // z.B. "disk2" — nur bei Massenspeicher
	LastSeen     time.Time `json:"last_seen,omitempty"`
	IsHub        bool      `json:"is_hub,omitempty"`
}

// ScanResult enthält alle gefundenen USB-Geräte.
type ScanResult struct {
	Devices []USBDevice `json:"devices"`
	Errors  []ScanError `json:"errors,omitempty"`
}

// ScanError beschreibt einen nicht-fatalen Fehler.
type ScanError struct {
	Module  string `json:"module"`
	Message string `json:"message"`
}
