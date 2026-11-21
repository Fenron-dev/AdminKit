package netcheck

import (
	"bufio"
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"strings"
	"time"
)

// SMTPResult beschreibt einen Verbindungstest zu einem Mailserver.
// Es wird nur die Verbindung aufgebaut – es wird nie eine Mail gesendet.
type SMTPResult struct {
	Host      string    `json:"host"`
	Port      int       `json:"port"`
	Connected bool      `json:"connected"`
	Error     string    `json:"error,omitempty"`
	Blocked   bool      `json:"blocked"` // Zeitüberschreitung → Port vermutlich gesperrt
	Banner    string    `json:"banner"`
	EHLO      []string  `json:"ehlo"`
	StartTLS  bool      `json:"starttls"` // angeboten
	TLS       bool      `json:"tls"`      // erfolgreich verschlüsselt
	TLSVer    string    `json:"tls_version,omitempty"`
	CertCN    string    `json:"cert_cn,omitempty"`
	CertSAN   []string  `json:"cert_san,omitempty"`
	CertIssue string    `json:"cert_issuer,omitempty"`
	CertUntil time.Time `json:"cert_until,omitempty"`
	CertOK    bool      `json:"cert_ok"` // Zertifikat gültig für den Hostnamen
	CertError string    `json:"cert_error,omitempty"`
	Millis    int64     `json:"millis"`
}

// allowedSMTPPorts begrenzt den Test auf Mail-Ports (kein allgemeiner Portscanner).
var allowedSMTPPorts = map[int]bool{25: true, 465: true, 587: true, 2525: true}

// SMTPProbe verbindet sich mit host:port, liest das Banner, sendet EHLO und –
// falls angeboten – STARTTLS (Port 465: direktes TLS). Danach QUIT.
func SMTPProbe(ctx context.Context, host string, port int) *SMTPResult {
	r := &SMTPResult{Host: host, Port: port}
	if err := ValidateName(host); err != nil && net.ParseIP(host) == nil {
		r.Error = err.Error()
		return r
	}
	if !allowedSMTPPorts[port] {
		r.Error = "nur die Ports 25, 465, 587 und 2525 sind erlaubt"
		return r
	}
	start := time.Now()
	d := net.Dialer{Timeout: 8 * time.Second}
	conn, err := d.DialContext(ctx, "tcp", net.JoinHostPort(host, fmt.Sprint(port)))
	if err != nil {
		r.Error = err.Error()
		if ne, ok := err.(net.Error); ok && ne.Timeout() {
			r.Blocked = true
		}
		return r
	}
	defer conn.Close()
	r.Connected = true
	_ = conn.SetDeadline(time.Now().Add(15 * time.Second))

	if port == 465 {
		tc := tls.Client(conn, &tls.Config{ServerName: host, InsecureSkipVerify: true, MinVersion: tls.VersionTLS10})
		if err := tc.HandshakeContext(ctx); err != nil {
			r.Error = "TLS-Handshake: " + err.Error()
			return r
		}
		fillTLS(r, tc, host)
		conn = tc
	}
	br := bufio.NewReader(conn)
	banner, err := readReply(br)
	if err != nil {
		r.Error = "kein Banner: " + err.Error()
		return r
	}
	r.Banner = banner
	ehlo, err := cmd(conn, br, "EHLO adminkit.local")
	if err != nil {
		r.Error = "EHLO: " + err.Error()
		return r
	}
	for _, l := range strings.Split(ehlo, "\n") {
		l = strings.TrimSpace(l)
		if len(l) > 4 {
			r.EHLO = append(r.EHLO, l[4:])
			if strings.EqualFold(l[4:], "STARTTLS") {
				r.StartTLS = true
			}
		}
	}
	if port != 465 && r.StartTLS {
		if resp, err := cmd(conn, br, "STARTTLS"); err == nil && strings.HasPrefix(resp, "220") {
			tc := tls.Client(conn, &tls.Config{ServerName: host, InsecureSkipVerify: true, MinVersion: tls.VersionTLS10})
			if err := tc.HandshakeContext(ctx); err != nil {
				r.CertError = "TLS-Handshake: " + err.Error()
			} else {
				fillTLS(r, tc, host)
				conn = tc
				br = bufio.NewReader(conn)
			}
		}
	}
	_, _ = cmd(conn, br, "QUIT")
	r.Millis = time.Since(start).Milliseconds()
	return r
}

func fillTLS(r *SMTPResult, tc *tls.Conn, host string) {
	st := tc.ConnectionState()
	r.TLS = true
	r.TLSVer = tls.VersionName(st.Version)
	if len(st.PeerCertificates) == 0 {
		return
	}
	c := st.PeerCertificates[0]
	r.CertCN, r.CertSAN, r.CertIssue, r.CertUntil = c.Subject.CommonName, c.DNSNames, c.Issuer.CommonName, c.NotAfter
	if err := c.VerifyHostname(host); err != nil {
		r.CertError = "Zertifikat passt nicht zum Hostnamen"
		return
	}
	if time.Now().After(c.NotAfter) {
		r.CertError = "Zertifikat ist abgelaufen"
		return
	}
	r.CertOK = true
}

// readReply liest eine (mehrzeilige) SMTP-Antwort.
func readReply(br *bufio.Reader) (string, error) {
	var lines []string
	for i := 0; i < 50; i++ {
		l, err := br.ReadString('\n')
		if err != nil {
			return strings.Join(lines, "\n"), err
		}
		l = strings.TrimRight(l, "\r\n")
		lines = append(lines, l)
		if len(l) < 4 || l[3] != '-' {
			break
		}
	}
	return strings.Join(lines, "\n"), nil
}

func cmd(conn net.Conn, br *bufio.Reader, c string) (string, error) {
	if _, err := fmt.Fprintf(conn, "%s\r\n", c); err != nil {
		return "", err
	}
	return readReply(br)
}
