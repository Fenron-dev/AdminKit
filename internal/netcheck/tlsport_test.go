package netcheck

import (
	"bufio"
	"context"
	"crypto/tls"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

func hostPort(t *testing.T, addr string) (string, int) {
	h, p, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatal(err)
	}
	n, _ := strconv.Atoi(p)
	return h, n
}

func TestCheckCertDirect(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer srv.Close()
	h, p := hostPort(t, strings.TrimPrefix(srv.URL, "https://"))
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	r := CheckCert(ctx, h, p, "tls")
	if !r.Connected || r.Error != "" || len(r.Chain) == 0 {
		t.Fatalf("Ergebnis: %+v", r)
	}
	if r.Trusted || r.VerifyError == "" {
		t.Error("Testzertifikat darf nicht vertrauenswürdig sein")
	}
	if !r.HostnameOK {
		t.Error("Testzertifikat gilt für 127.0.0.1")
	}
	if r.TLSVersion == "" || r.DaysLeft <= 0 {
		t.Errorf("Version/Laufzeit fehlt: %+v", r)
	}
}

// Minimaler SMTP-Server mit STARTTLS
func TestCheckCertSMTPStartTLS(t *testing.T) {
	ts := httptest.NewUnstartedServer(nil)
	ts.StartTLS()
	cert := ts.TLS.Certificates
	ts.Close()
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
		c.Write([]byte("220 test ESMTP\r\n"))
		br.ReadString('\n')
		c.Write([]byte("250-test\r\n250 STARTTLS\r\n"))
		br.ReadString('\n')
		c.Write([]byte("220 go ahead\r\n"))
		tc := tls.Server(c, &tls.Config{Certificates: cert})
		tc.Handshake()
		time.Sleep(100 * time.Millisecond)
	}()
	h, p := hostPort(t, ln.Addr().String())
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	r := CheckCert(ctx, h, p, "smtp")
	if r.Error != "" || len(r.Chain) == 0 || r.Mode != "smtp" {
		t.Fatalf("Ergebnis: %+v", r)
	}
}

func TestCheckPorts(t *testing.T) {
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	_, open := hostPort(t, ln.Addr().String())
	ln2, _ := net.Listen("tcp", "127.0.0.1:0")
	_, closed := hostPort(t, ln2.Addr().String())
	ln2.Close()
	defer ln.Close()
	r, err := CheckPorts(context.Background(), "127.0.0.1", []int{open, closed, 70000})
	if err != nil {
		t.Fatal(err)
	}
	if r[0].State != "open" || r[1].State != "closed" || r[2].State != "error" {
		t.Errorf("Zustände: %+v", r)
	}
	if _, err := CheckPorts(context.Background(), "127.0.0.1", make([]int, 11)); err == nil {
		t.Error("mehr als 10 Ports angenommen")
	}
}

func TestStartTLSModeAndLocal(t *testing.T) {
	for p, want := range map[int]string{587: "smtp", 143: "imap", 110: "pop3", 443: "tls", 993: "tls"} {
		if got := StartTLSMode(p, "auto"); got != want {
			t.Errorf("%d → %s", p, got)
		}
	}
	for h, want := range map[string]bool{"192.168.1.10": true, "10.0.0.1": true, "8.8.8.8": false, "nas": true, "fritz.box": true, "drucker.fritz.box": true, "x.local": true, "google.de": false} {
		if IsLocalTarget(h) != want {
			t.Errorf("IsLocalTarget(%q) != %v", h, want)
		}
	}
}
