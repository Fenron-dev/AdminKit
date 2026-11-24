package system

import (
	"encoding/json"
	"strings"
)

// Speicherzuverlässigkeitszähler (Windows: Get-StorageReliabilityCounter, #96).
// Funktioniert anders als MSStorageDriver_ATAPISmartData auch für NVMe-SSDs.
type reliabilityRow struct {
	FriendlyName     string  `json:"FriendlyName"`
	SerialNumber     string  `json:"SerialNumber"`
	HealthStatus     any     `json:"HealthStatus"` // Text oder Zahl je nach PowerShell-Version
	Temperature      *int    `json:"Temperature"`
	Wear             *int    `json:"Wear"` // verbrauchte Lebensdauer in %
	PowerOnHours     *uint64 `json:"PowerOnHours"`
	ReadErrorsTotal  *uint64 `json:"ReadErrorsTotal"`
	WriteErrorsTotal *uint64 `json:"WriteErrorsTotal"`
}

// parseReliability liest die JSON-Ausgabe (Objekt oder Liste).
func parseReliability(out []byte) ([]reliabilityRow, error) {
	s := strings.TrimSpace(string(out))
	if s == "" {
		return nil, nil
	}
	if strings.HasPrefix(s, "{") {
		s = "[" + s + "]"
	}
	var rows []reliabilityRow
	err := json.Unmarshal([]byte(s), &rows)
	return rows, err
}

func healthText(v any) string {
	switch x := v.(type) {
	case string:
		return strings.ToLower(x)
	case float64: // MSFT_PhysicalDisk.HealthStatus: 0 Healthy, 1 Warning, 2 Unhealthy
		return map[float64]string{0: "healthy", 1: "warning", 2: "unhealthy"}[x]
	}
	return ""
}

// applyReliability überträgt die Zähler auf die per WMI gefundenen Laufwerke
// (Abgleich über Seriennummer, sonst Modellname). Liefert die Zahl der Treffer.
func applyReliability(disks []DiskSmart, rows []reliabilityRow) int {
	hits := 0
	for i := range disks {
		d := &disks[i]
		for _, r := range rows {
			sn, rsn := strings.TrimSpace(d.SerialNumber), strings.TrimSpace(r.SerialNumber)
			sameSerial := sn != "" && rsn != "" && strings.EqualFold(strings.TrimRight(sn, "."), strings.TrimRight(rsn, "."))
			sameModel := r.FriendlyName != "" && strings.EqualFold(strings.TrimSpace(d.Model), strings.TrimSpace(r.FriendlyName))
			if !sameSerial && !sameModel {
				continue
			}
			hits++
			if r.Temperature != nil && *r.Temperature > 0 {
				d.TemperatureC = *r.Temperature
			}
			if r.PowerOnHours != nil {
				d.PowerOnHours = *r.PowerOnHours
			}
			if r.Wear != nil && *r.Wear >= 0 && *r.Wear <= 100 {
				d.LifeLeftPercent = 100 - *r.Wear
			}
			switch healthText(r.HealthStatus) {
			case "warning":
				if d.Status != SmartCritical {
					d.Status = SmartWarning
				}
			case "unhealthy":
				d.Status = SmartCritical
			case "healthy":
				if d.Status == SmartUnknown {
					d.Status = SmartOK
				}
			}
			if d.LifeLeftPercent >= 0 && d.LifeLeftPercent <= 10 && d.Status == SmartOK {
				d.Status = SmartWarning
			}
			break
		}
	}
	return hits
}
