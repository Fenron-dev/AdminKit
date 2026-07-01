package hub

import (
	"os"

	"github.com/grandcat/zeroconf"
)

// advertiser hält die laufende mDNS-Registrierung des Hubs.
type advertiser struct {
	server *zeroconf.Server
}

// startAdvertiser macht den Hub im LAN über _adminkit._tcp bekannt, sodass
// Clients ihn ohne manuelle IP-Eingabe finden (siehe #74, USB-Stick-Workflow).
func startAdvertiser(port int, version string) (*advertiser, error) {
	instance, err := os.Hostname()
	if err != nil || instance == "" {
		instance = "AdminKit-Hub"
	}
	txt := []string{"version=" + version, "service=adminkit-hub"}
	server, err := zeroconf.Register(instance, ServiceType, "local.", port, txt, nil)
	if err != nil {
		return nil, err
	}
	return &advertiser{server: server}, nil
}

func (a *advertiser) stop() {
	if a != nil && a.server != nil {
		a.server.Shutdown()
	}
}
