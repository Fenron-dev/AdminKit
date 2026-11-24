package netcheck

import "testing"

func TestSubnetHosts(t *testing.T) {
	h, err := SubnetHosts("192.168.178.17/24")
	if err != nil || len(h) != 254 || h[0] != "192.168.178.1" || h[253] != "192.168.178.254" {
		t.Fatalf("%d %v", len(h), err)
	}
	if h, _ := SubnetHosts("10.0.0.0/30"); len(h) != 2 {
		t.Errorf("/30: %v", h)
	}
	for _, bad := range []string{"8.8.8.0/24", "10.0.0.0/16", "x", "fe80::/64"} {
		if _, err := SubnetHosts(bad); err == nil {
			t.Errorf("%q angenommen", bad)
		}
	}
	if !ipLess("192.168.1.9", "192.168.1.10") {
		t.Error("Sortierung")
	}
}
