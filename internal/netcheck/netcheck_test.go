package netcheck

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/miekg/dns"
)

// Lokaler DNS-Server mit festen Antworten
func startDNS(t *testing.T) string {
	t.Helper()
	pc, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Skip("UDP nicht verfügbar:", err)
	}
	mux := dns.NewServeMux()
	mux.HandleFunc("example.test.", func(w dns.ResponseWriter, r *dns.Msg) {
		m := new(dns.Msg)
		m.SetReply(r)
		switch r.Question[0].Qtype {
		case dns.TypeMX:
			rr, _ := dns.NewRR("example.test. 300 IN MX 10 mail.example.test.")
			m.Answer = append(m.Answer, rr)
		case dns.TypeTXT:
			rr, _ := dns.NewRR(`example.test. 300 IN TXT "v=spf1 mx -all"`)
			m.Answer = append(m.Answer, rr)
		}
		w.WriteMsg(m)
	})
	mux.HandleFunc(".", func(w dns.ResponseWriter, r *dns.Msg) {
		m := new(dns.Msg)
		m.SetRcode(r, dns.RcodeNameError)
		w.WriteMsg(m)
	})
	srv := &dns.Server{PacketConn: pc, Handler: mux}
	go srv.ActivateAndServe()
	t.Cleanup(func() { srv.Shutdown() })
	return pc.LocalAddr().String()
}

func TestQueryDoHFormat(t *testing.T) {
	addr := startDNS(t)
	r, err := Query(context.Background(), "example.test", "MX", addr)
	if err != nil {
		t.Fatal(err)
	}
	if r.Status != 0 || len(r.Answer) != 1 || r.Answer[0].Data != "10 mail.example.test." || r.Answer[0].TTL != 300 || r.Answer[0].Type != 15 {
		t.Fatalf("MX: %+v", r)
	}
	r, _ = Query(context.Background(), "example.test", "txt", addr)
	if r.Answer[0].Data != `"v=spf1 mx -all"` {
		t.Errorf("TXT im DoH-Format (mit Anführungszeichen) erwartet: %q", r.Answer[0].Data)
	}
	b, _ := json.Marshal(r)
	if !strings.Contains(string(b), `"Status":0`) || !strings.Contains(string(b), `"TTL":300`) {
		t.Errorf("JSON-Feldnamen wie DoH erwartet: %s", b)
	}
	r, _ = Query(context.Background(), "gibtsnicht.test", "A", addr)
	if r.Status != 3 {
		t.Errorf("NXDOMAIN erwartet: %+v", r)
	}
}

func TestQueryValidation(t *testing.T) {
	for _, n := range []string{"", "a b", "x;rm", "-x", strings.Repeat("a", 300)} {
		if _, err := Query(context.Background(), n, "A", "127.0.0.1"); err == nil {
			t.Errorf("Name %q sollte abgelehnt werden", n)
		}
	}
	if _, err := Query(context.Background(), "example.com", "ANY", "127.0.0.1"); err == nil {
		t.Error("Typ ANY sollte abgelehnt werden")
	}
	if _, err := Query(context.Background(), "example.com", "A", "dns.google"); err == nil {
		t.Error("Resolver muss eine IP sein")
	}
	if ptrToIP("4.3.2.1.in-addr.arpa.") != "1.2.3.4" {
		t.Error("ptrToIP")
	}
}

// Minimaler SMTP-Server ohne STARTTLS
func TestSMTPProbePlain(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		defer c.Close()
		br := bufio.NewReader(c)
		fmt.Fprint(c, "220 mx.test ESMTP bereit\r\n")
		for {
			l, err := br.ReadString('\n')
			if err != nil {
				return
			}
			switch {
			case strings.HasPrefix(l, "EHLO"):
				fmt.Fprint(c, "250-mx.test\r\n250-SIZE 10240000\r\n250 8BITMIME\r\n")
			case strings.HasPrefix(l, "QUIT"):
				fmt.Fprint(c, "221 tschüss\r\n")
				return
			case strings.HasPrefix(l, "MAIL"), strings.HasPrefix(l, "RCPT"), strings.HasPrefix(l, "DATA"):
				t.Error("Probe darf keine Mail senden")
			}
		}
	}()
	if r := SMTPProbe(context.Background(), "127.0.0.1", 9999); r.Error == "" {
		t.Error("nicht erlaubter Port muss abgelehnt werden")
	}
	port := ln.Addr().(*net.TCPAddr).Port
	allowedSMTPPorts[port] = true
	defer delete(allowedSMTPPorts, port)
	r := SMTPProbe(context.Background(), "127.0.0.1", port)
	if !r.Connected || r.Error != "" || !strings.HasPrefix(r.Banner, "220 mx.test") || r.StartTLS || r.TLS {
		t.Fatalf("%+v", r)
	}
	if len(r.EHLO) != 3 || r.EHLO[1] != "SIZE 10240000" {
		t.Errorf("EHLO: %q", r.EHLO)
	}
}

func TestSMTPProbeTimeoutMeansBlocked(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	// 192.0.2.1 (TEST-NET-1) ist nicht routbar → Zeitüberschreitung
	r := SMTPProbe(ctx, "192.0.2.1", 25)
	if r.Connected {
		t.Skip("Netz routet TEST-NET – Test nicht aussagekräftig")
	}
	if r.Error == "" {
		t.Error("Fehler erwartet")
	}
}

func TestRDAPWithFakeServer(t *testing.T) {
	old := getJSON
	t.Cleanup(func() { getJSON = old })
	getJSON = func(_ context.Context, u string, _ map[string]string, out any) (int, error) {
		switch {
		case u == ianaBootstrap:
			return 200, json.Unmarshal([]byte(`{"services":[[["com","net"],["https://rdap.example/"]]]}`), out)
		case u == "https://rdap.example/domain/paypal-login.com":
			return 200, json.Unmarshal([]byte(`{"ldhName":"paypal-login.com","status":["active"],"events":[{"eventAction":"registration","eventDate":"`+time.Now().Add(-72*time.Hour).Format(time.RFC3339)+`"}],
				"entities":[{"roles":["registrar"],"vcardArray":["vcard",[["version",{},"text","4.0"],["fn",{},"text","Beispiel Registrar"]]]}]}`), out)
		}
		return 404, nil
	}
	dir := t.TempDir()
	r, err := RDAPLookup(context.Background(), "paypal-login.com", dir)
	if err != nil || r.AgeDays != 3 || r.Registrar != "Beispiel Registrar" {
		t.Fatalf("%v %+v", err, r)
	}
	if _, err := RDAPLookup(context.Background(), "beispiel.de", dir); err == nil || !strings.Contains(err.Error(), ".de") {
		t.Errorf("TLD ohne RDAP: %v", err)
	}
	r, err = RDAPLookup(context.Background(), "frei.com", dir)
	if err != nil || !r.NotFound {
		t.Errorf("404 → NotFound erwartet: %v %+v", err, r)
	}
}

func TestValidateURL(t *testing.T) {
	for _, u := range []string{"javascript:alert(1)", "file:///etc/passwd", "ftp://x", "nur text"} {
		if _, err := ValidateURL(u); err == nil {
			t.Errorf("%s sollte abgelehnt werden", u)
		}
	}
	if _, err := ValidateURL("https://example.com/a?b=c"); err != nil {
		t.Error(err)
	}
}
