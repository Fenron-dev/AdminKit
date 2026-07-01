package sync_test

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"

	"adminkit/internal/hub"
	"adminkit/internal/sync"
)

// newTestHub startet einen In-Memory-Hub und gibt Server + httptest-URL zurück.
func newTestHub(t *testing.T) (*hub.Server, string) {
	t.Helper()
	srv, err := hub.NewServer(hub.Options{
		HubRoot: t.TempDir(),
		Version: "test",
	})
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	return srv, ts.URL
}

func TestPairPushAndList(t *testing.T) {
	srv, url := newTestHub(t)
	ctx := context.Background()

	client := sync.NewClient(url, "device-1", "Dennis-Stick")

	// Health ohne Auth.
	health, err := client.Health(ctx)
	if err != nil {
		t.Fatalf("Health: %v", err)
	}
	if health.Status != "ok" {
		t.Fatalf("unerwarteter Health-Status: %+v", health)
	}

	// Pairing mit korrektem PIN.
	pin, _, err := srv.GeneratePairingCode()
	if err != nil {
		t.Fatalf("GeneratePairingCode: %v", err)
	}
	if err := client.Pair(ctx, pin); err != nil {
		t.Fatalf("Pair: %v", err)
	}

	// Session pushen.
	meta := hub.SessionMeta{
		SessionName:  "20260701_Musterfirma_Empfang-PC",
		CustomerName: "Musterfirma GmbH",
		DeviceID:     "device-1",
		ScannedAt:    time.Now(),
	}
	snapshots := map[string][]byte{
		"system":  []byte(`{"os":"macOS"}`),
		"network": []byte(`{"adapters":2}`),
	}
	if err := client.PushSession(ctx, meta, snapshots); err != nil {
		t.Fatalf("PushSession: %v", err)
	}

	// Liste muss die Session inkl. Snapshot-Keys enthalten.
	sessions, err := client.ListSessions(ctx)
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("erwartete 1 Session, bekam %d", len(sessions))
	}
	if sessions[0].CustomerName != "Musterfirma GmbH" {
		t.Fatalf("Kundenname verloren: %+v", sessions[0])
	}
	if len(sessions[0].Snapshots) != 2 {
		t.Fatalf("erwartete 2 Snapshots, bekam %v", sessions[0].Snapshots)
	}

	// Fleet-Gruppierung nach Kunde.
	fleet, err := client.Fleet(ctx)
	if err != nil {
		t.Fatalf("Fleet: %v", err)
	}
	if len(fleet["Musterfirma GmbH"]) != 1 {
		t.Fatalf("Fleet-Gruppierung falsch: %+v", fleet)
	}
}

func TestPushWithoutPairingFails(t *testing.T) {
	_, url := newTestHub(t)
	client := sync.NewClient(url, "device-x", "Kein-Pairing")

	err := client.PushSession(context.Background(), hub.SessionMeta{
		SessionName: "s", DeviceID: "device-x", ScannedAt: time.Now(),
	}, map[string][]byte{"system": []byte(`{}`)})
	if err == nil {
		t.Fatal("Push ohne Pairing hätte fehlschlagen müssen")
	}
}

func TestWrongPINRejected(t *testing.T) {
	srv, url := newTestHub(t)
	pin, _, err := srv.GeneratePairingCode()
	if err != nil {
		t.Fatalf("GeneratePairingCode: %v", err)
	}
	wrong := "000000"
	if pin == wrong {
		wrong = "111111"
	}
	client := sync.NewClient(url, "device-2", "Falsch")
	if err := client.Pair(context.Background(), wrong); err == nil {
		t.Fatal("falscher PIN hätte abgelehnt werden müssen")
	}
}
