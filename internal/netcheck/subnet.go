package netcheck

// Netzwerk durchsuchen (#128): eigenes privates Netz (max. /24) nach Geräten
// absuchen. Sanft: begrenzte Parallelität, kurze Zeitlimits, nur Verbindungsaufbau.

import (
	"context"
	"errors"
	"fmt"
	"net"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// HostResult ist ein gefundenes Gerät.
type HostResult struct {
	IP    string `json:"ip"`
	MAC   string `json:"mac,omitempty"`
	Name  string `json:"name,omitempty"`
	Ports []int  `json:"ports,omitempty"`
	Self  bool   `json:"self,omitempty"`
}

// ScanPorts: Dienste, an denen Geräte typischerweise antworten.
var ScanPorts = []int{80, 443, 445, 22, 9100, 62078}

// LocalSubnets liefert die eigenen privaten IPv4-Netze (auf /24 begrenzt).
func LocalSubnets() []string {
	var out []string
	ifs, _ := net.Interfaces()
	for _, i := range ifs {
		if i.Flags&net.FlagUp == 0 || i.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := i.Addrs()
		for _, a := range addrs {
			n, ok := a.(*net.IPNet)
			if !ok || n.IP.To4() == nil || !n.IP.IsPrivate() {
				continue
			}
			ones, _ := n.Mask.Size()
			if ones < 24 {
				ones = 24
			}
			_, sub, _ := net.ParseCIDR(fmt.Sprintf("%s/%d", n.IP.String(), ones))
			if s := sub.String(); !contains(out, s) {
				out = append(out, s)
			}
		}
	}
	return out
}

func contains(l []string, s string) bool {
	for _, x := range l {
		if x == s {
			return true
		}
	}
	return false
}

// SubnetHosts prüft das Netz (privat, /24 bis /30) und liefert die Host-Adressen.
func SubnetHosts(cidr string) ([]string, error) {
	ip, n, err := net.ParseCIDR(strings.TrimSpace(cidr))
	if err != nil || ip.To4() == nil {
		return nil, errors.New("Netz im Format 192.168.178.0/24 angeben")
	}
	if !ip.IsPrivate() {
		return nil, errors.New("nur private Netze (10.x, 172.16–31.x, 192.168.x)")
	}
	ones, bits := n.Mask.Size()
	if ones < 24 || ones > 30 {
		return nil, errors.New("Netzgröße /24 bis /30 (höchstens 254 Adressen)")
	}
	base := n.IP.To4()
	count := 1 << (bits - ones)
	var out []string
	for i := 1; i < count-1; i++ {
		v := uint32(base[0])<<24 | uint32(base[1])<<16 | uint32(base[2])<<8 | uint32(base[3])
		v += uint32(i)
		out = append(out, net.IPv4(byte(v>>24), byte(v>>16), byte(v>>8), byte(v)).String())
	}
	return out, nil
}

// ScanSubnet sucht Geräte im Netz.
func ScanSubnet(ctx context.Context, cidr string) ([]HostResult, error) {
	hosts, err := SubnetHosts(cidr)
	if err != nil {
		return nil, err
	}
	self := map[string]bool{}
	for _, s := range localIPv4() {
		self[s] = true
	}
	found := map[string]*HostResult{}
	var mu sync.Mutex
	sem := make(chan struct{}, 48)
	var wg sync.WaitGroup
	for _, h := range hosts {
		wg.Add(1)
		go func(h string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			// UDP-Paket an „discard“ löst ARP aus, auch wenn keine Ports offen sind
			if c, err := net.DialTimeout("udp4", net.JoinHostPort(h, "9"), 300*time.Millisecond); err == nil {
				_, _ = c.Write([]byte{0})
				c.Close()
			}
			var open []int
			alive := false
			for _, p := range ScanPorts {
				if ctx.Err() != nil {
					return
				}
				c, err := (&net.Dialer{Timeout: 350 * time.Millisecond}).DialContext(ctx, "tcp", net.JoinHostPort(h, strconv.Itoa(p)))
				if err == nil {
					c.Close()
					open, alive = append(open, p), true
				} else if strings.Contains(strings.ToLower(err.Error()), "refused") {
					alive = true // Gerät antwortet mit „abgelehnt“
				}
			}
			if alive {
				mu.Lock()
				found[h] = &HostResult{IP: h, Ports: open}
				mu.Unlock()
			}
		}(h)
	}
	wg.Wait()
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	// ARP-Tabelle: findet auch Geräte, die keine Ports offen haben
	in := map[string]bool{}
	for _, h := range hosts {
		in[h] = true
	}
	if nb, err := ARPTable(ctx); err == nil {
		for _, x := range nb {
			if !in[x.IP] {
				continue
			}
			if r, ok := found[x.IP]; ok {
				r.MAC = x.MAC
			} else {
				found[x.IP] = &HostResult{IP: x.IP, MAC: x.MAC}
			}
		}
	}
	for s := range self {
		if in[s] {
			if _, ok := found[s]; !ok {
				found[s] = &HostResult{IP: s}
			}
			found[s].Self = true
		}
	}
	// Namen per Reverse-DNS (parallel, kurz)
	var nwg sync.WaitGroup
	for _, r := range found {
		nwg.Add(1)
		go func(r *HostResult) {
			defer nwg.Done()
			c, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
			defer cancel()
			if names, err := net.DefaultResolver.LookupAddr(c, r.IP); err == nil && len(names) > 0 {
				mu.Lock()
				r.Name = strings.TrimSuffix(names[0], ".")
				mu.Unlock()
			}
		}(r)
	}
	nwg.Wait()
	out := make([]HostResult, 0, len(found))
	for _, r := range found {
		out = append(out, *r)
	}
	sort.Slice(out, func(i, j int) bool { return ipLess(out[i].IP, out[j].IP) })
	return out, nil
}

func ipLess(a, b string) bool {
	x, y := net.ParseIP(a).To4(), net.ParseIP(b).To4()
	for i := 0; i < 4; i++ {
		if x[i] != y[i] {
			return x[i] < y[i]
		}
	}
	return false
}

func localIPv4() []string {
	var out []string
	addrs, _ := net.InterfaceAddrs()
	for _, a := range addrs {
		if n, ok := a.(*net.IPNet); ok && n.IP.To4() != nil {
			out = append(out, n.IP.String())
		}
	}
	return out
}
