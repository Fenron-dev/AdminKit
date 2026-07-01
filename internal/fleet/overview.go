// Package fleet aggregiert die auf einem Hub gesammelten Sessions zu einer
// Kunden-/Geräte-Übersicht mit Health-Score und Trend (Phase C, #74/#79).
package fleet

import (
	"sort"
	"strings"
	"time"

	"adminkit/internal/hub"
)

// staleAfter markiert ein Gerät als "veraltet", wenn der letzte Scan älter ist.
const staleAfter = 30 * 24 * time.Hour

// maxTrendPoints begrenzt die Trend-Historie pro Gerät (neueste bevorzugt).
const maxTrendPoints = 24

// Status-Konstanten für die Geräte-Ampel.
const (
	StatusOK       = "ok"       // grün
	StatusWarn     = "warn"     // gelb
	StatusCritical = "critical" // rot
	StatusStale    = "stale"    // Scan zu alt
	StatusUnknown  = "unknown"  // kein Health-Score vorhanden
)

// HealthPoint ist ein Health-Score zu einem Scan-Zeitpunkt (für Trend-Charts).
type HealthPoint struct {
	ScannedAt   time.Time `json:"scanned_at"`
	HealthScore int       `json:"health_score"`
}

// DeviceSummary fasst alle Sessions eines Geräts zusammen.
type DeviceSummary struct {
	Key          string        `json:"key"`
	Label        string        `json:"label"`
	Hostname     string        `json:"hostname"`
	Alias        string        `json:"alias"`
	Location     string        `json:"location"`
	CustomerName string        `json:"customer_name"`
	SessionCount int           `json:"session_count"`
	LatestHealth int           `json:"latest_health"`
	LatestScan   time.Time     `json:"latest_scan"`
	Status       string        `json:"status"`
	Trend        []HealthPoint `json:"trend"`
}

// CustomerGroup bündelt alle Geräte eines Kunden.
type CustomerGroup struct {
	Name        string          `json:"name"`
	DeviceCount int             `json:"device_count"`
	WorstStatus string          `json:"worst_status"`
	Devices     []DeviceSummary `json:"devices"`
}

// Overview ist die vollständige Fleet-Übersicht.
type Overview struct {
	Customers     []CustomerGroup `json:"customers"`
	TotalDevices  int             `json:"total_devices"`
	TotalSessions int             `json:"total_sessions"`
	GeneratedAt   time.Time       `json:"generated_at"`
}

// BuildOverview gruppiert Sessions nach Kunde und Gerät und berechnet
// Health-Status sowie Trend. Kein Merge — jede Session ist ein Einzel-Scan.
func BuildOverview(sessions []hub.SessionMeta) Overview {
	// Gruppierung: Kunde → Gerät-Key → Sessions.
	byCustomer := map[string]map[string][]hub.SessionMeta{}
	for _, s := range sessions {
		cust := customerName(s.CustomerName)
		key := deviceKey(s)
		if byCustomer[cust] == nil {
			byCustomer[cust] = map[string][]hub.SessionMeta{}
		}
		byCustomer[cust][key] = append(byCustomer[cust][key], s)
	}

	ov := Overview{GeneratedAt: time.Now(), TotalSessions: len(sessions)}
	for cust, devices := range byCustomer {
		group := CustomerGroup{Name: cust, WorstStatus: StatusOK}
		for key, devSessions := range devices {
			dev := summarizeDevice(key, devSessions)
			group.Devices = append(group.Devices, dev)
			if statusRank(dev.Status) > statusRank(group.WorstStatus) {
				group.WorstStatus = dev.Status
			}
		}
		group.DeviceCount = len(group.Devices)
		ov.TotalDevices += group.DeviceCount
		// Geräte: kritischste zuerst, dann nach Name.
		sort.Slice(group.Devices, func(i, j int) bool {
			ri, rj := statusRank(group.Devices[i].Status), statusRank(group.Devices[j].Status)
			if ri != rj {
				return ri > rj
			}
			return strings.ToLower(group.Devices[i].Label) < strings.ToLower(group.Devices[j].Label)
		})
		ov.Customers = append(ov.Customers, group)
	}
	// Kunden alphabetisch, "Ohne Kunde" ans Ende.
	sort.Slice(ov.Customers, func(i, j int) bool {
		a, b := ov.Customers[i].Name, ov.Customers[j].Name
		if (a == noCustomer) != (b == noCustomer) {
			return b == noCustomer
		}
		return strings.ToLower(a) < strings.ToLower(b)
	})
	return ov
}

const noCustomer = "Ohne Kunde"

func customerName(name string) string {
	if strings.TrimSpace(name) == "" {
		return noCustomer
	}
	return name
}

// deviceKey bildet eine stabile Kennung: DeviceID, sonst Hostname, sonst Alias.
func deviceKey(s hub.SessionMeta) string {
	switch {
	case s.DeviceID != "":
		return "id:" + s.DeviceID
	case s.Hostname != "":
		return "host:" + strings.ToLower(s.Hostname)
	case s.DeviceAlias != "":
		return "alias:" + strings.ToLower(s.DeviceAlias)
	default:
		return "session:" + s.SessionName
	}
}

func summarizeDevice(key string, sessions []hub.SessionMeta) DeviceSummary {
	// Nach Scan-Zeit aufsteigend sortieren (für den Trend).
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].ScannedAt.Before(sessions[j].ScannedAt)
	})

	dev := DeviceSummary{Key: key, SessionCount: len(sessions)}
	for _, s := range sessions {
		if s.DeviceAlias != "" {
			dev.Alias = s.DeviceAlias
		}
		if s.Hostname != "" {
			dev.Hostname = s.Hostname
		}
		if s.Location != "" {
			dev.Location = s.Location
		}
		if s.CustomerName != "" {
			dev.CustomerName = s.CustomerName
		}
		if s.HealthScore > 0 {
			dev.Trend = append(dev.Trend, HealthPoint{ScannedAt: s.ScannedAt, HealthScore: s.HealthScore})
		}
	}

	latest := sessions[len(sessions)-1]
	dev.LatestScan = latest.ScannedAt
	dev.LatestHealth = latest.HealthScore
	dev.Label = deviceLabel(dev)
	dev.Status = deviceStatus(dev.LatestHealth, dev.LatestScan)
	dev.Trend = trimTrend(dev.Trend)
	return dev
}

func deviceLabel(dev DeviceSummary) string {
	switch {
	case dev.Alias != "":
		return dev.Alias
	case dev.Hostname != "":
		return dev.Hostname
	default:
		return "Unbenanntes Gerät"
	}
}

// deviceStatus leitet die Ampel aus dem letzten Health-Score und Scan-Alter ab.
func deviceStatus(latestHealth int, latestScan time.Time) string {
	if !latestScan.IsZero() && time.Since(latestScan) > staleAfter {
		return StatusStale
	}
	switch {
	case latestHealth == 0:
		return StatusUnknown
	case latestHealth >= 85:
		return StatusOK
	case latestHealth >= 60:
		return StatusWarn
	default:
		return StatusCritical
	}
}

// statusRank ordnet Status nach Dringlichkeit (höher = dringender).
func statusRank(status string) int {
	switch status {
	case StatusCritical:
		return 4
	case StatusStale:
		return 3
	case StatusWarn:
		return 2
	case StatusUnknown:
		return 1
	default: // StatusOK
		return 0
	}
}

func trimTrend(points []HealthPoint) []HealthPoint {
	if len(points) <= maxTrendPoints {
		return points
	}
	return points[len(points)-maxTrendPoints:]
}
