package netcheck

// Zertifikats- und Port-Check (#108). Nur lesend: Verbindung aufbauen,
// Zertifikat lesen bzw. prüfen, ob ein Port antwortet – nie Daten senden
// (außer dem STARTTLS-Befehl). Kein Portscanner: höchstens maxPorts Ports je Aufruf.

import (
	"bufio"
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"
)

const maxPorts = 10

// CertInfo beschreibt ein Zertifikat der Kette.
type CertInfo struct {
	Subject   string    `json:"subject"`
	Issuer    string    `json:"issuer"`
	NotBefore time.Time `json:"not_before"`
	NotAfter  time.Time `json:"not_after"`
	DNSNames  []string  `json:"dns_names,omitempty"`
	IsCA      bool      `json:"is_ca"`
	SelfSign  bool      `json:"self_signed"`
	KeyInfo   string    `json:"key"`
	SigAlg    string    `json:"sig_alg"`
}

// CertResult ist das Ergebnis eines Zertifikats-Checks.
type CertResult struct {
	Host        string     `json:"host"`
	Port        int        `json:"port"`
	Mode        string     `json:"mode"` // tls, smtp, imap, pop3
	Connected   bool       `json:"connected"`
	Error       string     `json:"error,omitempty"`
	TLSVersion  string     `json:"tls_version,omitempty"`
	Cipher      string     `json:"cipher,omitempty"`
	Chain       []CertInfo `json:"chain,omitempty"`
	Trusted     bool       `json:"trusted"`     // Kette führt zu einer vertrauenswürdigen Stammzertifizierungsstelle
	HostnameOK  bool       `json:"hostname_ok"` // Zertifikat gilt für den Hostnamen
	VerifyError string     `json:"verify_error,omitempty"`
	DaysLeft    int        `json:"days_left"`
	Millis      int64      `json:"millis"`
}

// StartTLSMode wählt anhand des Ports, ob erst im Klartext verbunden und dann
// per STARTTLS verschlüsselt wird.
func StartTLSMode(port int, mode string) string {
	if mode != "" && mode != "auto" {
		return mode
	}
	switch port {
	case 25, 587, 2525:
		return "smtp"
	case 143:
		return "imap"
	case 110:
		return "pop3"
	}
	return "tls"
}

var tlsVersions = map[uint16]string{tls.VersionTLS10: "TLS 1.0", tls.VersionTLS11: "TLS 1.1", tls.VersionTLS12: "TLS 1.2", tls.VersionTLS13: "TLS 1.3"}

// CheckCert verbindet sich mit host:port und wertet das Zertifikat aus.
func CheckCert(ctx context.Context, host string, port int, mode string) *CertResult {
	host = strings.TrimSpace(strings.TrimSuffix(host, "."))
	r := &CertResult{Host: host, Port: port, Mode: StartTLSMode(port, mode)}
	if host == "" || port < 1 || port > 65535 {
		r.Error = "Host oder Port ungültig"
		return r
	}
	start := time.Now()
	d := &net.Dialer{Timeout: 10 * time.Second}
	raw, err := d.DialContext(ctx, "tcp", net.JoinHostPort(host, strconv.Itoa(port)))
	if err != nil {
		r.Error = dialError(err)
		return r
	}
	defer raw.Close()
	r.Connected = true
	if dl, ok := ctx.Deadline(); ok {
		_ = raw.SetDeadline(dl)
	}
	if r.Mode != "tls" {
		if err := startTLS(raw, r.Mode); err != nil {
			r.Error = "STARTTLS: " + err.Error()
			return r
		}
	}
	// Kette selbst prüfen, damit auch ungültige Zertifikate angezeigt werden
	cfg := &tls.Config{ServerName: host, InsecureSkipVerify: true} //nolint:gosec // Prüfung erfolgt unten manuell
	tc := tls.Client(raw, cfg)
	if err := tc.HandshakeContext(ctx); err != nil {
		r.Error = "TLS-Handshake: " + err.Error()
		return r
	}
	r.Millis = time.Since(start).Milliseconds()
	st := tc.ConnectionState()
	r.TLSVersion = tlsVersions[st.Version]
	r.Cipher = tls.CipherSuiteName(st.CipherSuite)
	if len(st.PeerCertificates) == 0 {
		r.Error = "Kein Zertifikat erhalten"
		return r
	}
	for _, c := range st.PeerCertificates {
		r.Chain = append(r.Chain, certInfo(c))
	}
	leaf := st.PeerCertificates[0]
	r.DaysLeft = int(time.Until(leaf.NotAfter).Hours() / 24)
	r.HostnameOK = leaf.VerifyHostname(host) == nil
	inter := x509.NewCertPool()
	for _, c := range st.PeerCertificates[1:] {
		inter.AddCert(c)
	}
	if _, err := leaf.Verify(x509.VerifyOptions{DNSName: host, Intermediates: inter}); err != nil {
		r.VerifyError = verifyText(err)
	} else {
		r.Trusted = true
	}
	return r
}

func certInfo(c *x509.Certificate) CertInfo {
	key := c.PublicKeyAlgorithm.String()
	switch k := c.PublicKey.(type) {
	case interface{ Size() int }:
		key = fmt.Sprintf("%s %d Bit", key, k.Size()*8)
	}
	return CertInfo{
		Subject: nameOf(c.Subject.CommonName, c.Subject.Organization), Issuer: nameOf(c.Issuer.CommonName, c.Issuer.Organization),
		NotBefore: c.NotBefore, NotAfter: c.NotAfter, DNSNames: c.DNSNames, IsCA: c.IsCA,
		SelfSign: c.Subject.String() == c.Issuer.String(), KeyInfo: key, SigAlg: c.SignatureAlgorithm.String(),
	}
}

func nameOf(cn string, org []string) string {
	if cn != "" {
		return cn
	}
	return strings.Join(org, ", ")
}

func verifyText(err error) string {
	var ue x509.UnknownAuthorityError
	var he x509.HostnameError
	var ce x509.CertificateInvalidError
	switch {
	case errors.As(err, &ue):
		return "Aussteller unbekannt (selbst signiert oder Zwischenzertifikat fehlt)"
	case errors.As(err, &he):
		return "Zertifikat gilt nicht für diesen Namen"
	case errors.As(err, &ce):
		if ce.Reason == x509.Expired {
			return "Zertifikat abgelaufen oder noch nicht gültig"
		}
	}
	return err.Error()
}

// startTLS führt den Klartext-Teil von SMTP/IMAP/POP3 bis zum STARTTLS aus.
func startTLS(c net.Conn, mode string) error {
	br := bufio.NewReader(c)
	readLine := func() (string, error) { l, err := br.ReadString('\n'); return strings.TrimRight(l, "\r\n"), err }
	switch mode {
	case "smtp":
		for { // Banner (mehrzeilig möglich)
			l, err := readLine()
			if err != nil {
				return err
			}
			if len(l) < 4 || l[3] != '-' {
				if !strings.HasPrefix(l, "220") {
					return fmt.Errorf("unerwartete Begrüßung: %s", l)
				}
				break
			}
		}
		if _, err := fmt.Fprint(c, "EHLO adminkit.local\r\n"); err != nil {
			return err
		}
		offered := false
		for {
			l, err := readLine()
			if err != nil {
				return err
			}
			if strings.Contains(strings.ToUpper(l), "STARTTLS") {
				offered = true
			}
			if len(l) < 4 || l[3] != '-' {
				break
			}
		}
		if !offered {
			return errors.New("Server bietet kein STARTTLS an")
		}
		fmt.Fprint(c, "STARTTLS\r\n")
		l, err := readLine()
		if err != nil || !strings.HasPrefix(l, "220") {
			return fmt.Errorf("abgelehnt: %s", l)
		}
	case "imap":
		if l, err := readLine(); err != nil || !strings.HasPrefix(l, "* OK") {
			return fmt.Errorf("unerwartete Begrüßung: %s", l)
		}
		fmt.Fprint(c, "a1 STARTTLS\r\n")
		for {
			l, err := readLine()
			if err != nil {
				return err
			}
			if strings.HasPrefix(l, "a1 ") {
				if !strings.HasPrefix(l, "a1 OK") {
					return fmt.Errorf("abgelehnt: %s", l)
				}
				break
			}
		}
	case "pop3":
		if l, err := readLine(); err != nil || !strings.HasPrefix(l, "+OK") {
			return fmt.Errorf("unerwartete Begrüßung: %s", l)
		}
		fmt.Fprint(c, "STLS\r\n")
		if l, err := readLine(); err != nil || !strings.HasPrefix(l, "+OK") {
			return fmt.Errorf("abgelehnt: %s", l)
		}
	default:
		return fmt.Errorf("unbekannter Modus %q", mode)
	}
	if br.Buffered() > 0 {
		return errors.New("unerwartete Daten vor dem TLS-Handshake")
	}
	return nil
}

// PortResult ist das Ergebnis eines einzelnen Port-Tests.
type PortResult struct {
	Port   int    `json:"port"`
	State  string `json:"state"` // open, closed, timeout, error
	Millis int64  `json:"millis"`
	Error  string `json:"error,omitempty"`
}

// CheckPorts prüft, ob host auf den Ports eine TCP-Verbindung annimmt (parallel, je 5 s).
func CheckPorts(ctx context.Context, host string, ports []int) ([]PortResult, error) {
	host = strings.TrimSpace(host)
	if host == "" {
		return nil, errors.New("Host fehlt")
	}
	if len(ports) == 0 || len(ports) > maxPorts {
		return nil, fmt.Errorf("1 bis %d Ports angeben", maxPorts)
	}
	out := make([]PortResult, len(ports))
	done := make(chan struct{}, len(ports))
	for i, p := range ports {
		go func(i, p int) {
			defer func() { done <- struct{}{} }()
			out[i] = PortResult{Port: p}
			if p < 1 || p > 65535 {
				out[i].State, out[i].Error = "error", "ungültiger Port"
				return
			}
			start := time.Now()
			c, err := (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, "tcp", net.JoinHostPort(host, strconv.Itoa(p)))
			out[i].Millis = time.Since(start).Milliseconds()
			if err == nil {
				c.Close()
				out[i].State = "open"
				return
			}
			out[i].Error = dialError(err)
			var ne net.Error
			switch {
			case errors.As(err, &ne) && ne.Timeout():
				out[i].State = "timeout"
			case strings.Contains(strings.ToLower(err.Error()), "refused"):
				out[i].State = "closed"
			default:
				out[i].State = "error"
			}
		}(i, p)
	}
	for range ports {
		<-done
	}
	return out, nil
}

func dialError(err error) string {
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return "Name nicht auflösbar: " + dnsErr.Name
	}
	s := err.Error()
	switch {
	case strings.Contains(strings.ToLower(s), "refused"):
		return "Verbindung abgelehnt (Port geschlossen)"
	case strings.Contains(strings.ToLower(s), "timeout"):
		return "Zeitüberschreitung (Port gefiltert oder Host nicht erreichbar)"
	}
	return s
}

// IsLocalTarget: IP aus privaten/lokalen Bereichen oder ein Name ohne Punkt bzw.
// mit .local/.lan/.fritz.box/.home – solche Ziele brauchen keine Online-Freigabe.
func IsLocalTarget(host string) bool {
	h := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(host), "."))
	if ip := net.ParseIP(h); ip != nil {
		return ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast()
	}
	if !strings.Contains(h, ".") {
		return h != ""
	}
	for _, s := range []string{".local", ".lan", ".fritz.box", ".home", ".internal", ".localdomain", ".home.arpa"} {
		if strings.HasSuffix("."+h, s) {
			return true
		}
	}
	return false
}
