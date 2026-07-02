package export

import (
	"strings"
	"testing"
	"time"

	"adminkit/internal/fleet"
	"adminkit/internal/hub"
)

func TestGenerateFleetHTML(t *testing.T) {
	now := time.Now()
	ov := fleet.BuildOverview([]hub.SessionMeta{
		{SessionName: "s1", CustomerName: "Musterfirma GmbH", DeviceID: "a", DeviceAlias: "Empfang-PC", HealthScore: 80, ScannedAt: now.Add(-48 * time.Hour)},
		{SessionName: "s2", CustomerName: "Musterfirma GmbH", DeviceID: "a", DeviceAlias: "Empfang-PC", HealthScore: 92, ScannedAt: now.Add(-time.Hour)},
		{SessionName: "s3", CustomerName: "Musterfirma GmbH", DeviceID: "b", DeviceAlias: "Drucker-PC", HealthScore: 40, ScannedAt: now.Add(-2 * time.Hour)},
	})
	html := GenerateFleetHTML(&FleetReport{
		GeneratedAt: now,
		CompanyName: "Test IT",
		Overview:    ov,
	})

	for _, want := range []string{
		"<!DOCTYPE html>",
		"Flotten-Übersicht",
		"Musterfirma GmbH",
		"Empfang-PC",
		"Drucker-PC",
		"<svg",            // Sparkline für Gerät mit Trend
		"window.print()",  // Druck/PDF-Button
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("Fleet-HTML enthält %q nicht", want)
		}
	}
}

func TestGenerateFleetHTMLEmpty(t *testing.T) {
	html := GenerateFleetHTML(&FleetReport{GeneratedAt: time.Now()})
	if !strings.Contains(html, "Noch keine Sessions") {
		t.Fatalf("leerer Bericht sollte Hinweis enthalten")
	}
}
