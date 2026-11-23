package netcheck

import (
	"context"
	"testing"
)

func TestParseARP(t *testing.T) {
	win := "Schnittstelle: 192.168.178.20 --- 0x5\r\n  Internetadresse      Physische Adresse     Typ\r\n  192.168.178.1         3c-a6-2f-11-22-33     dynamisch\r\n  192.168.178.255       ff-ff-ff-ff-ff-ff     statisch\r\n  224.0.0.22            01-00-5e-00-00-16     statisch\r\n"
	mac := "? (192.168.178.1) at 3c:a6:2f:11:22:33 on en0 ifscope [ethernet]\n? (192.168.178.30) at 0:11:2:a:b:c on en0 ifscope [ethernet]\n? (192.168.178.40) at (incomplete) on en0 ifscope [ethernet]\n"
	lin := "IP address       HW type     Flags       HW address            Mask     Device\n192.168.1.1      0x1         0x2         aa:bb:cc:dd:ee:ff     *        eth0\n"
	if r := ParseARP(win); len(r) != 1 || r[0].MAC != "3C:A6:2F:11:22:33" || r[0].IP != "192.168.178.1" {
		t.Errorf("Windows: %+v", r)
	}
	if r := ParseARP(mac); len(r) != 2 || r[1].MAC != "00:11:02:0A:0B:0C" {
		t.Errorf("macOS: %+v", r)
	}
	if r := ParseARP(lin); len(r) != 1 || r[0].MAC != "AA:BB:CC:DD:EE:FF" {
		t.Errorf("Linux: %+v", r)
	}
}

func TestParseNBStat(t *testing.T) {
	b := make([]byte, 57)
	b[56] = 2
	add := func(name string, typ, flags byte) {
		e := make([]byte, 18)
		copy(e, []byte(name + "               ")[:15])
		e[15], e[16] = typ, flags
		b = append(b, e...)
	}
	add("WORKGROUP", 0x00, 0x80) // Gruppenname überspringen
	add("EMPFANG-PC", 0x00, 0x04)
	if got := ParseNBStat(b); got != "EMPFANG-PC" {
		t.Errorf("Name: %q", got)
	}
	if ParseNBStat([]byte{1, 2}) != "" {
		t.Error("kurze Antwort")
	}
}

func TestProbeRejectsPublic(t *testing.T) {
	for _, ip := range []string{"8.8.8.8", "fritz.box", "", "fe80::1"} {
		if _, err := ProbeDevice(context.Background(), ip); err == nil {
			t.Errorf("%q angenommen", ip)
		}
	}
}
