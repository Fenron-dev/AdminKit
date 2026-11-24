package netcheck

import (
	"testing"
	"time"
)

func TestParsePingLine(t *testing.T) {
	cases := []struct {
		l       string
		ok, hit bool
		ms      float64
	}{
		{"Antwort von 192.168.178.1: Bytes=32 Zeit=3ms TTL=64", true, true, 3},
		{"Antwort von 192.168.178.1: Bytes=32 Zeit<1ms TTL=64", true, true, 1},
		{"Reply from 8.8.8.8: bytes=32 time=14ms TTL=117", true, true, 14},
		{"64 bytes from 1.1.1.1: icmp_seq=0 ttl=57 time=12.345 ms", true, true, 12.345},
		{"Zeitüberschreitung der Anforderung.", false, true, 0},
		{"Request timeout for icmp_seq 4", false, true, 0},
		{"Antwort von 192.168.178.20: Zielhost nicht erreichbar.", false, true, 0},
		{"Ping wird ausgeführt für 8.8.8.8 mit 32 Bytes Daten:", false, false, 0},
	}
	for _, c := range cases {
		ok, ms, hit := ParsePingLine(c.l)
		if ok != c.ok || hit != c.hit || ms != c.ms {
			t.Errorf("%q → %v %v %v", c.l, ok, ms, hit)
		}
	}
}

func TestMonitorDNSAndStatus(t *testing.T) {
	var m Monitor
	if err := m.Start([]MonTarget{{ID: "x", Kind: "ping", Host: "a;rm"}}, 1); err == nil {
		t.Error("ungültiges Ziel angenommen")
	}
	if err := m.Start([]MonTarget{{ID: "dns", Kind: "dns", Host: "invalid"}}, 1); err != nil {
		t.Fatal(err)
	}
	if err := m.Start([]MonTarget{{ID: "dns", Kind: "dns"}}, 1); err == nil {
		t.Error("zweiter Start angenommen")
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) && len(m.Status(0).Samples["dns"]) == 0 {
		time.Sleep(100 * time.Millisecond)
	}
	if len(m.Status(0).Samples["dns"]) == 0 {
		t.Error("keine DNS-Messung")
	}
	m.Stop()
	time.Sleep(200 * time.Millisecond)
	if m.Status(0).Running {
		t.Error("läuft nach Stop")
	}
	if n := len(m.Status(time.Now().UnixMilli()).Samples["dns"]); n != 0 {
		t.Errorf("since-Filter: %d", n)
	}
}
