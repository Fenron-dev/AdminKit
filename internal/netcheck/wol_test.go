package netcheck

import (
	"bytes"
	"testing"
)

func TestWOL(t *testing.T) {
	for _, s := range []string{"00:11:22:aa:BB:cc", "00-11-22-AA-BB-CC", "0011.22aa.bbcc", "001122aabbcc"} {
		m, err := ParseMAC(s)
		if err != nil || m.String() != "00:11:22:aa:bb:cc" {
			t.Errorf("%q → %v %v", s, m, err)
		}
	}
	for _, s := range []string{"", "00:11:22", "zz1122aabbcc"} {
		if _, err := ParseMAC(s); err == nil {
			t.Errorf("%q angenommen", s)
		}
	}
	m, _ := ParseMAC("001122aabbcc")
	p := MagicPacket(m)
	if len(p) != 102 || !bytes.Equal(p[:6], []byte{255, 255, 255, 255, 255, 255}) || !bytes.Equal(p[96:], m) {
		t.Error("Paket falsch aufgebaut")
	}
	if err := SendWOL("001122aabbcc", "fe80::1", 9); err == nil {
		t.Error("IPv6-Broadcast angenommen")
	}
}
