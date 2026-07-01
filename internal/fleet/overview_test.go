package fleet

import (
	"testing"
	"time"

	"adminkit/internal/hub"
)

func TestBuildOverviewGroupsAndStatus(t *testing.T) {
	now := time.Now()
	sessions := []hub.SessionMeta{
		// Gerät A der Musterfirma: zwei Scans → Trend, letzter Health 92 (ok).
		{SessionName: "s1", CustomerName: "Musterfirma GmbH", DeviceID: "devA", DeviceAlias: "Empfang-PC", HealthScore: 80, ScannedAt: now.Add(-48 * time.Hour)},
		{SessionName: "s2", CustomerName: "Musterfirma GmbH", DeviceID: "devA", DeviceAlias: "Empfang-PC", HealthScore: 92, ScannedAt: now.Add(-1 * time.Hour)},
		// Gerät B der Musterfirma: letzter Health 45 (kritisch).
		{SessionName: "s3", CustomerName: "Musterfirma GmbH", DeviceID: "devB", DeviceAlias: "Drucker-PC", HealthScore: 45, ScannedAt: now.Add(-2 * time.Hour)},
		// Gerät ohne Kunde.
		{SessionName: "s4", DeviceID: "devC", Hostname: "NAS", HealthScore: 88, ScannedAt: now.Add(-3 * time.Hour)},
	}

	ov := BuildOverview(sessions)

	if ov.TotalSessions != 4 || ov.TotalDevices != 3 {
		t.Fatalf("Totals falsch: sessions=%d devices=%d", ov.TotalSessions, ov.TotalDevices)
	}
	if len(ov.Customers) != 2 {
		t.Fatalf("erwartete 2 Kundengruppen, bekam %d", len(ov.Customers))
	}

	// "Ohne Kunde" muss ans Ende sortiert werden.
	if ov.Customers[len(ov.Customers)-1].Name != noCustomer {
		t.Fatalf("Ohne-Kunde nicht am Ende: %+v", ov.Customers)
	}

	// Musterfirma zuerst.
	mf := ov.Customers[0]
	if mf.Name != "Musterfirma GmbH" || mf.DeviceCount != 2 {
		t.Fatalf("Musterfirma falsch: %+v", mf)
	}
	// Worst status der Gruppe = critical (Drucker-PC).
	if mf.WorstStatus != StatusCritical {
		t.Fatalf("erwarteter WorstStatus critical, bekam %s", mf.WorstStatus)
	}
	// Kritischstes Gerät zuerst.
	if mf.Devices[0].Status != StatusCritical || mf.Devices[0].Label != "Drucker-PC" {
		t.Fatalf("Sortierung nach Dringlichkeit falsch: %+v", mf.Devices[0])
	}

	// Gerät A: Trend mit 2 Punkten, letzter Health 92, Status ok.
	var devA DeviceSummary
	for _, d := range mf.Devices {
		if d.Label == "Empfang-PC" {
			devA = d
		}
	}
	if devA.SessionCount != 2 || len(devA.Trend) != 2 {
		t.Fatalf("Gerät A Trend/Count falsch: %+v", devA)
	}
	if devA.LatestHealth != 92 || devA.Status != StatusOK {
		t.Fatalf("Gerät A Status falsch: %+v", devA)
	}
	// Trend muss chronologisch aufsteigen.
	if devA.Trend[0].HealthScore != 80 || devA.Trend[1].HealthScore != 92 {
		t.Fatalf("Trend nicht chronologisch: %+v", devA.Trend)
	}
}

func TestStaleAndUnknownStatus(t *testing.T) {
	old := time.Now().Add(-60 * 24 * time.Hour)
	sessions := []hub.SessionMeta{
		{SessionName: "old", DeviceID: "d1", Hostname: "AltPC", HealthScore: 95, ScannedAt: old},
		{SessionName: "nohealth", DeviceID: "d2", Hostname: "NeuPC", HealthScore: 0, ScannedAt: time.Now()},
	}
	ov := BuildOverview(sessions)
	byLabel := map[string]DeviceSummary{}
	for _, c := range ov.Customers {
		for _, d := range c.Devices {
			byLabel[d.Label] = d
		}
	}
	if byLabel["AltPC"].Status != StatusStale {
		t.Fatalf("AltPC sollte stale sein: %s", byLabel["AltPC"].Status)
	}
	if byLabel["NeuPC"].Status != StatusUnknown {
		t.Fatalf("NeuPC ohne Health sollte unknown sein: %s", byLabel["NeuPC"].Status)
	}
	if len(byLabel["NeuPC"].Trend) != 0 {
		t.Fatalf("NeuPC sollte keinen Trend haben: %+v", byLabel["NeuPC"].Trend)
	}
}
