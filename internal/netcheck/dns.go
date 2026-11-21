// Package netcheck enthält die Netzwerkprüfungen des Werkzeugkastens:
// DNS-Abfragen mit wählbarem Resolver, SMTP-Verbindungstest, RDAP
// (Domainalter) und Link-Vorschau über Drittdienste. Alles nur auf Klick.
package netcheck

import (
	"context"
	"fmt"
	"net"
	"regexp"
	"strings"
	"time"

	"github.com/miekg/dns"
)

// DoHAnswer entspricht dem JSON-Format von DNS-over-HTTPS (Google/Cloudflare),
// damit die Auswertung aus dem Portal unverändert bleiben kann.
type DoHAnswer struct {
	Name string `json:"name"`
	Type uint16 `json:"type"`
	TTL  uint32 `json:"TTL"`
	Data string `json:"data"`
}

// DoHResponse ist die Antwort einer DNS-Abfrage im DoH-Format.
type DoHResponse struct {
	Status int         `json:"Status"` // RCODE: 0 = NOERROR, 3 = NXDOMAIN
	Answer []DoHAnswer `json:"Answer"`
	Server string      `json:"server"` // tatsächlich gefragter Resolver
}

// RRTypes sind die unterstützten Abfragetypen.
var RRTypes = map[string]uint16{
	"A": dns.TypeA, "NS": dns.TypeNS, "CNAME": dns.TypeCNAME, "SOA": dns.TypeSOA, "PTR": dns.TypePTR,
	"MX": dns.TypeMX, "TXT": dns.TypeTXT, "AAAA": dns.TypeAAAA, "SRV": dns.TypeSRV, "CAA": dns.TypeCAA,
}

var reDNSName = regexp.MustCompile(`^[A-Za-z0-9_*]([A-Za-z0-9_.*-]{0,252})\.?$`)

// ValidateName prüft einen DNS-Namen.
func ValidateName(name string) error {
	if !reDNSName.MatchString(name) || strings.Contains(name, "..") {
		return fmt.Errorf("ungültiger DNS-Name %q", name)
	}
	return nil
}

// systemServers liefert die Resolver des Systems (nil, wenn nicht ermittelbar,
// z. B. unter Windows – dann wird der Go-Resolver genutzt).
var systemServers = func() []string {
	cfg, err := dns.ClientConfigFromFile("/etc/resolv.conf")
	if err != nil || len(cfg.Servers) == 0 {
		return nil
	}
	out := make([]string, 0, len(cfg.Servers))
	for _, s := range cfg.Servers {
		out = append(out, net.JoinHostPort(s, cfg.Port))
	}
	return out
}

// Query fragt name/rrtype beim angegebenen Resolver ab. server: "" bzw.
// "system" = Resolver des Systems, sonst IP-Adresse (optional mit Port).
func Query(ctx context.Context, name, rrtype, server string) (*DoHResponse, error) {
	name = strings.TrimSpace(name)
	if err := ValidateName(name); err != nil {
		return nil, err
	}
	t, ok := RRTypes[strings.ToUpper(rrtype)]
	if !ok {
		return nil, fmt.Errorf("unbekannter Typ %q", rrtype)
	}
	var servers []string
	if server == "" || server == "system" {
		servers = systemServers()
		if len(servers) == 0 {
			return queryGoResolver(ctx, name, strings.ToUpper(rrtype))
		}
	} else {
		addr, err := resolverAddr(server)
		if err != nil {
			return nil, err
		}
		servers = []string{addr}
	}
	m := new(dns.Msg)
	m.SetQuestion(dns.Fqdn(name), t)
	m.RecursionDesired = true
	m.SetEdns0(1232, false)
	var lastErr error
	for _, srv := range servers {
		in, err := exchange(ctx, m, srv)
		if err != nil {
			lastErr = err
			continue
		}
		return toDoH(in, srv), nil
	}
	return nil, fmt.Errorf("DNS-Server nicht erreichbar: %v", lastErr)
}

// resolverAddr prüft eine Resolver-Angabe (nur IP-Adressen, Port optional).
func resolverAddr(s string) (string, error) {
	s = strings.TrimSpace(s)
	if ip := net.ParseIP(s); ip != nil {
		return net.JoinHostPort(ip.String(), "53"), nil
	}
	host, port, err := net.SplitHostPort(s)
	if err == nil && net.ParseIP(host) != nil {
		return net.JoinHostPort(host, port), nil
	}
	return "", fmt.Errorf("Resolver muss eine IP-Adresse sein (z. B. 1.1.1.1)")
}

func exchange(ctx context.Context, m *dns.Msg, srv string) (*dns.Msg, error) {
	c := &dns.Client{Timeout: 5 * time.Second}
	in, _, err := c.ExchangeContext(ctx, m, srv)
	if err == nil && in.Truncated {
		c.Net = "tcp"
		in, _, err = c.ExchangeContext(ctx, m, srv)
	}
	return in, err
}

func toDoH(in *dns.Msg, srv string) *DoHResponse {
	r := &DoHResponse{Status: in.Rcode, Server: srv}
	for _, rr := range in.Answer {
		h := rr.Header()
		data := strings.TrimPrefix(rr.String(), h.String())
		r.Answer = append(r.Answer, DoHAnswer{Name: h.Name, Type: h.Rrtype, TTL: h.Ttl, Data: strings.TrimSpace(data)})
	}
	return r
}

// queryGoResolver nutzt den Resolver des Betriebssystems über Go (Windows).
// TTL ist dort nicht verfügbar (0), SOA/CAA werden nicht unterstützt.
func queryGoResolver(ctx context.Context, name, t string) (*DoHResponse, error) {
	r := &net.Resolver{}
	fq := dns.Fqdn(name)
	resp := &DoHResponse{Server: "system"}
	add := func(typ uint16, data string) {
		resp.Answer = append(resp.Answer, DoHAnswer{Name: fq, Type: typ, Data: data})
	}
	var err error
	switch t {
	case "A", "AAAA":
		var ips []net.IP
		network := "ip4"
		if t == "AAAA" {
			network = "ip6"
		}
		ips, err = r.LookupIP(ctx, network, name)
		for _, ip := range ips {
			add(RRTypes[t], ip.String())
		}
	case "MX":
		var mx []*net.MX
		mx, err = r.LookupMX(ctx, name)
		for _, x := range mx {
			add(dns.TypeMX, fmt.Sprintf("%d %s", x.Pref, x.Host))
		}
	case "TXT":
		var txt []string
		txt, err = r.LookupTXT(ctx, name)
		for _, x := range txt {
			add(dns.TypeTXT, fmt.Sprintf("%q", x))
		}
	case "NS":
		var ns []*net.NS
		ns, err = r.LookupNS(ctx, name)
		for _, x := range ns {
			add(dns.TypeNS, x.Host)
		}
	case "CNAME":
		var c string
		c, err = r.LookupCNAME(ctx, name)
		if err == nil && c != fq {
			add(dns.TypeCNAME, c)
		}
	case "PTR":
		ip := ptrToIP(name)
		if ip == "" {
			return nil, fmt.Errorf("PTR-Abfrage braucht eine in-addr.arpa-Adresse")
		}
		var names []string
		names, err = r.LookupAddr(ctx, ip)
		for _, n := range names {
			add(dns.TypePTR, n)
		}
	case "SRV":
		var srv []*net.SRV
		_, srv, err = r.LookupSRV(ctx, "", "", name)
		for _, s := range srv {
			add(dns.TypeSRV, fmt.Sprintf("%d %d %d %s", s.Priority, s.Weight, s.Port, s.Target))
		}
	default:
		return nil, fmt.Errorf("%s-Abfragen sind mit dem System-Resolver nicht möglich – bitte einen DNS-Server wählen", t)
	}
	if err != nil {
		var de *net.DNSError
		if ok := asDNSError(err, &de); ok && de.IsNotFound {
			resp.Status = 3
			if t != "A" && t != "AAAA" {
				// „nicht gefunden“ kann auch „kein Eintrag dieses Typs“ heißen
				if _, e := r.LookupHost(ctx, name); e == nil {
					resp.Status = 0
				}
			}
			return resp, nil
		}
		return nil, err
	}
	return resp, nil
}

func asDNSError(err error, target **net.DNSError) bool {
	de, ok := err.(*net.DNSError)
	if ok {
		*target = de
	}
	return ok
}

// ptrToIP wandelt 4.3.2.1.in-addr.arpa in 1.2.3.4 um.
func ptrToIP(name string) string {
	name = strings.TrimSuffix(strings.ToLower(name), ".")
	if !strings.HasSuffix(name, ".in-addr.arpa") {
		return ""
	}
	p := strings.Split(strings.TrimSuffix(name, ".in-addr.arpa"), ".")
	if len(p) != 4 {
		return ""
	}
	return p[3] + "." + p[2] + "." + p[1] + "." + p[0]
}
