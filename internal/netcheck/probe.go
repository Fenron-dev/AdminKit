package netcheck

// Geräte-Erkennung im lokalen Netz (#109, Stufe 2). Nur lesend und nur für
// private IP-Adressen: ARP-Tabelle, Namen (DNS, mDNS, NetBIOS), UPnP-Beschreibung
// (Hersteller/Modell), Titel der Weboberfläche und typische offene Ports.

import (
	"bufio"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"adminkit/internal/execx"

	"github.com/miekg/dns"
)

// Neighbor ist ein Eintrag der ARP-Tabelle.
type Neighbor struct {
	IP  string `json:"ip"`
	MAC string `json:"mac"`
}

var (
	reArpMac   = regexp.MustCompile(`(?:^|[\s(])(\d{1,3}(?:\.\d{1,3}){3})\)?\s.*?([0-9a-fA-F]{1,2}(?:[:-][0-9a-fA-F]{1,2}){5})(?:\s|$)`)
	reHTMLTitl = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
)

// ParseARP liest die Ausgabe von `arp -a` (Windows), `arp -an` (macOS) oder /proc/net/arp.
func ParseARP(text string) []Neighbor {
	var out []Neighbor
	seen := map[string]bool{}
	for _, line := range strings.Split(text, "\n") {
		m := reArpMac.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		mac := normMAC(m[2])
		if mac == "" || mac == "FF:FF:FF:FF:FF:FF" || mac == "00:00:00:00:00:00" || strings.HasPrefix(mac, "01:00:5E") || seen[m[1]] {
			continue
		}
		seen[m[1]] = true
		out = append(out, Neighbor{IP: m[1], MAC: mac})
	}
	return out
}

// normMAC füllt macOS-Kurzform (0:11:2:…) auf und vereinheitlicht auf AA:BB:…
func normMAC(s string) string {
	parts := strings.FieldsFunc(s, func(r rune) bool { return r == ':' || r == '-' })
	if len(parts) != 6 {
		return ""
	}
	for i, p := range parts {
		if len(p) == 1 {
			p = "0" + p
		}
		parts[i] = strings.ToUpper(p)
	}
	return strings.Join(parts, ":")
}

// ARPTable liest die Nachbartabelle des Rechners.
func ARPTable(ctx context.Context) ([]Neighbor, error) {
	switch runtime.GOOS {
	case "linux":
		b, err := os.ReadFile("/proc/net/arp")
		if err != nil {
			return nil, err
		}
		return ParseARP(string(b)), nil
	case "darwin":
		out, err := execx.Output(ctx, 10*time.Second, "arp", "-an")
		return ParseARP(out), err
	default:
		out, err := execx.Output(ctx, 10*time.Second, "arp", "-a")
		return ParseARP(out), err
	}
}

// NameHit ist ein gefundener Gerätename mit Quelle.
type NameHit struct {
	Name   string `json:"name"`
	Source string `json:"source"`
}

// UPnPInfo stammt aus der Gerätebeschreibung (SSDP/UPnP).
type UPnPInfo struct {
	FriendlyName string `xml:"device>friendlyName" json:"friendly_name,omitempty"`
	Manufacturer string `xml:"device>manufacturer" json:"manufacturer,omitempty"`
	ModelName    string `xml:"device>modelName" json:"model_name,omitempty"`
	ModelNumber  string `xml:"device>modelNumber" json:"model_number,omitempty"`
	DeviceType   string `xml:"device>deviceType" json:"device_type,omitempty"`
}

// DeviceProbe ist das Ergebnis der Abfrage eines Geräts.
type DeviceProbe struct {
	IP        string    `json:"ip"`
	MAC       string    `json:"mac,omitempty"`
	Names     []NameHit `json:"names,omitempty"`
	UPnP      *UPnPInfo `json:"upnp,omitempty"`
	WebTitle  string    `json:"web_title,omitempty"`
	OpenPorts []int     `json:"open_ports,omitempty"`
}

// ProbePorts: typische Dienste, die den Gerätetyp verraten (max. 10, siehe CheckPorts).
var ProbePorts = []int{80, 443, 445, 548, 631, 3389, 5000, 8009, 9100, 62078}

// ProbeDevice fragt ein Gerät im lokalen Netz ab (nur private Adressen).
func ProbeDevice(ctx context.Context, ipStr string) (*DeviceProbe, error) {
	ip := net.ParseIP(strings.TrimSpace(ipStr))
	if ip == nil || ip.To4() == nil || !(ip.IsPrivate() || ip.IsLinkLocalUnicast()) {
		return nil, errors.New("nur private IPv4-Adressen im lokalen Netz")
	}
	r := &DeviceProbe{IP: ip.String()}
	var mu sync.Mutex
	addName := func(n, src string) {
		n = strings.TrimSuffix(strings.TrimSpace(n), ".")
		if n == "" {
			return
		}
		mu.Lock()
		defer mu.Unlock()
		for _, x := range r.Names {
			if strings.EqualFold(x.Name, n) {
				return
			}
		}
		r.Names = append(r.Names, NameHit{n, src})
	}
	var wg sync.WaitGroup
	run := func(f func()) { wg.Add(1); go func() { defer wg.Done(); f() }() }
	run(func() {
		if nb, err := ARPTable(ctx); err == nil {
			for _, n := range nb {
				if n.IP == r.IP {
					mu.Lock()
					r.MAC = n.MAC
					mu.Unlock()
				}
			}
		}
	})
	run(func() {
		if names, err := net.DefaultResolver.LookupAddr(ctx, r.IP); err == nil {
			for _, n := range names {
				addName(n, "DNS")
			}
		}
	})
	run(func() {
		if n := mdnsReverse(ctx, ip); n != "" {
			addName(n, "mDNS/Bonjour")
		}
	})
	run(func() {
		if n := netbiosName(ctx, ip); n != "" {
			addName(n, "NetBIOS")
		}
	})
	run(func() {
		if u := upnpInfo(ctx, ip); u != nil {
			mu.Lock()
			r.UPnP = u
			mu.Unlock()
		}
	})
	run(func() {
		if t := webTitle(ctx, ip); t != "" {
			mu.Lock()
			r.WebTitle = t
			mu.Unlock()
		}
	})
	run(func() {
		if res, err := CheckPorts(ctx, r.IP, ProbePorts); err == nil {
			for _, p := range res {
				if p.State == "open" {
					mu.Lock()
					r.OpenPorts = append(r.OpenPorts, p.Port)
					mu.Unlock()
				}
			}
		}
	})
	wg.Wait()
	sort.Ints(r.OpenPorts)
	return r, nil
}

// mdnsReverse fragt das Gerät direkt per mDNS (Unicast an Port 5353) nach seinem Namen.
func mdnsReverse(ctx context.Context, ip net.IP) string {
	arpa, err := dns.ReverseAddr(ip.String())
	if err != nil {
		return ""
	}
	m := new(dns.Msg)
	m.SetQuestion(arpa, dns.TypePTR)
	m.RecursionDesired = false
	c := &dns.Client{Net: "udp", Timeout: 2 * time.Second}
	in, _, err := c.ExchangeContext(ctx, m, net.JoinHostPort(ip.String(), "5353"))
	if err != nil || in == nil {
		return ""
	}
	for _, a := range in.Answer {
		if p, ok := a.(*dns.PTR); ok {
			return p.Ptr
		}
	}
	return ""
}

// netbiosName: NetBIOS-Knotenstatus (UDP 137), liefert den Rechnernamen (Windows, NAS).
func netbiosName(ctx context.Context, ip net.IP) string {
	q := []byte{0x13, 0x37, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0x20, 'C', 'K'}
	for i := 0; i < 30; i++ {
		q = append(q, 'A')
	}
	q = append(q, 0, 0, 0x21, 0, 1)
	d := net.Dialer{Timeout: 2 * time.Second}
	c, err := d.DialContext(ctx, "udp4", net.JoinHostPort(ip.String(), "137"))
	if err != nil {
		return ""
	}
	defer c.Close()
	_ = c.SetDeadline(time.Now().Add(2 * time.Second))
	if _, err := c.Write(q); err != nil {
		return ""
	}
	buf := make([]byte, 1024)
	n, err := c.Read(buf)
	if err != nil {
		return ""
	}
	return ParseNBStat(buf[:n])
}

// ParseNBStat liest den ersten eindeutigen Namen vom Typ 0x00 (Arbeitsstation).
func ParseNBStat(b []byte) string {
	// Kopf (12) + Name (34) + Typ/Klasse (4) + TTL (4) + Länge (2) = 56, dann Anzahl
	if len(b) < 57 {
		return ""
	}
	cnt := int(b[56])
	for i := 0; i < cnt; i++ {
		off := 57 + i*18
		if off+18 > len(b) {
			break
		}
		name := strings.TrimRight(string(b[off:off+15]), " \x00")
		typ, flags := b[off+15], b[off+16]
		if typ == 0x00 && flags&0x80 == 0 && name != "" {
			return name
		}
	}
	return ""
}

// upnpInfo: SSDP-Suche per Unicast an das Gerät, dann Gerätebeschreibung laden.
// Die Beschreibung wird nur vom selben Gerät geladen (keine fremden Adressen).
func upnpInfo(ctx context.Context, ip net.IP) *UPnPInfo {
	c, err := net.ListenPacket("udp4", ":0")
	if err != nil {
		return nil
	}
	defer c.Close()
	msg := "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 1\r\nST: upnp:rootdevice\r\n\r\n"
	dst := &net.UDPAddr{IP: ip, Port: 1900}
	if _, err := c.WriteTo([]byte(msg), dst); err != nil {
		return nil
	}
	_ = c.SetReadDeadline(time.Now().Add(2 * time.Second))
	buf := make([]byte, 2048)
	n, _, err := c.ReadFrom(buf)
	if err != nil {
		return nil
	}
	var loc string
	sc := bufio.NewScanner(strings.NewReader(string(buf[:n])))
	for sc.Scan() {
		if k, v, ok := strings.Cut(sc.Text(), ":"); ok && strings.EqualFold(strings.TrimSpace(k), "location") {
			loc = strings.TrimSpace(v)
		}
	}
	u, err := url.Parse(loc)
	if err != nil || u.Scheme != "http" || u.Hostname() != ip.String() {
		return nil
	}
	body, err := httpGetSmall(ctx, u.String(), 256<<10)
	if err != nil {
		return nil
	}
	var info UPnPInfo
	if xml.Unmarshal(body, &info) != nil || (info.ModelName == "" && info.Manufacturer == "" && info.FriendlyName == "") {
		return nil
	}
	return &info
}

// webTitle liest den <title> der Weboberfläche (bei Druckern oft das Modell).
func webTitle(ctx context.Context, ip net.IP) string {
	body, err := httpGetSmall(ctx, "http://"+ip.String()+"/", 64<<10)
	if err != nil {
		return ""
	}
	m := reHTMLTitl.FindSubmatch(body)
	if m == nil {
		return ""
	}
	t := strings.Join(strings.Fields(string(m[1])), " ")
	if len(t) > 120 {
		t = t[:120]
	}
	return t
}

func httpGetSmall(ctx context.Context, u string, max int64) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "AdminKit")
	cl := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := cl.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, max))
}
