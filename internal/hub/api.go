// Package hub implementiert den eingebetteten AdminKit-Sync-Server (siehe #74).
// Eine Instanz mit Rolle "hub" stellt eine REST-API bereit, an die Client-
// Instanzen ihre Scan-Sessions pushen. Dieselben Pakete werden vom optionalen
// Standalone-Binary (Phase D, cmd/adminkit-hub) wiederverwendet.
package hub

import "time"

// DefaultPort ist der Standard-Listen-Port des LAN-Hubs.
const DefaultPort = 8767

// ServiceType ist der mDNS-Service-Typ, über den Clients den Hub finden.
const ServiceType = "_adminkit._tcp"

// SessionMeta beschreibt eine auf dem Hub gespeicherte Session. Wird über
// GET /api/sessions ausgeliefert und dient als Grundlage der Fleet-Übersicht.
type SessionMeta struct {
	// ID ist global eindeutig: deviceID + sessionName (siehe Konzept).
	ID           string    `json:"id"`
	SessionName  string    `json:"session_name"`
	CustomerName string    `json:"customer_name,omitempty"`
	DeviceAlias  string    `json:"device_alias,omitempty"`
	Hostname     string    `json:"hostname,omitempty"`
	Location     string    `json:"location,omitempty"`
	Technician   string    `json:"technician,omitempty"`
	DeviceID     string    `json:"device_id,omitempty"`
	SourceDevice string    `json:"source_device,omitempty"` // Name des pushenden Geräts
	HealthScore  int       `json:"health_score,omitempty"`
	ScannedAt    time.Time `json:"scanned_at"`
	ReceivedAt   time.Time `json:"received_at"`
	Snapshots    []string  `json:"snapshots,omitempty"` // vorhandene Snapshot-Keys
}

// PairClaimRequest ist der Body von POST /api/pairing/claim.
type PairClaimRequest struct {
	PIN        string `json:"pin"`
	DeviceID   string `json:"device_id"`
	DeviceName string `json:"device_name"`
}

// TokenResponse liefert Access- und Refresh-Token nach erfolgreichem Pairing.
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
	ExpiresAt    int64  `json:"expires_at"` // Unix-Sekunden
}

// RefreshRequest ist der Body von POST /api/pairing/refresh.
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// HealthResponse ist die Antwort von GET /health (ohne Auth).
type HealthResponse struct {
	Status       string `json:"status"`
	Version      string `json:"version"`
	SessionCount int    `json:"session_count"`
}

// Status beschreibt den Laufzeitzustand des Hubs (für das UI, Phase B).
type Status struct {
	Running       bool   `json:"running"`
	Port          int    `json:"port"`
	SessionCount  int    `json:"session_count"`
	PairedDevices int    `json:"paired_devices"`
	PairingActive bool   `json:"pairing_active"` // ein PIN ist gerade gültig
	Advertising   bool   `json:"advertising"`    // mDNS aktiv
	Error         string `json:"error,omitempty"`
}
