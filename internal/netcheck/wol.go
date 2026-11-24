package netcheck

// Wake-on-LAN (#116): „Magic Packet“ (6× 0xFF + 16× MAC) per UDP-Broadcast.

import (
	"fmt"
	"net"
	"strconv"
	"strings"
)

// ParseMAC akzeptiert 00:11:22:33:44:55, 00-11-…, 0011.2233.4455 und 001122334455.
func ParseMAC(s string) (net.HardwareAddr, error) {
	h := strings.NewReplacer(":", "", "-", "", ".", "", " ", "").Replace(strings.TrimSpace(s))
	if len(h) != 12 {
		return nil, fmt.Errorf("MAC-Adresse %q ungültig (12 Hex-Zeichen erwartet)", s)
	}
	mac, err := net.ParseMAC(h[0:2] + ":" + h[2:4] + ":" + h[4:6] + ":" + h[6:8] + ":" + h[8:10] + ":" + h[10:12])
	if err != nil {
		return nil, fmt.Errorf("MAC-Adresse %q ungültig", s)
	}
	return mac, nil
}

// MagicPacket baut das 102-Byte-Paket.
func MagicPacket(mac net.HardwareAddr) []byte {
	p := make([]byte, 0, 102)
	for i := 0; i < 6; i++ {
		p = append(p, 0xFF)
	}
	for i := 0; i < 16; i++ {
		p = append(p, mac...)
	}
	return p
}

// SendWOL sendet das Magic Packet an broadcast:port (Standard 255.255.255.255:9).
func SendWOL(macStr, broadcast string, port int) error {
	mac, err := ParseMAC(macStr)
	if err != nil {
		return err
	}
	if broadcast == "" {
		broadcast = "255.255.255.255"
	}
	ip := net.ParseIP(strings.TrimSpace(broadcast))
	if ip == nil || ip.To4() == nil {
		return fmt.Errorf("Broadcast-Adresse %q ungültig (IPv4 erwartet)", broadcast)
	}
	if port == 0 {
		port = 9
	}
	if port < 1 || port > 65535 {
		return fmt.Errorf("Port %d ungültig", port)
	}
	c, err := net.Dial("udp4", net.JoinHostPort(ip.String(), strconv.Itoa(port)))
	if err != nil {
		return err
	}
	defer c.Close()
	_, err = c.Write(MagicPacket(mac))
	return err
}
