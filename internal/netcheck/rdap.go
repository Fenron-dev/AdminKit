package netcheck

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var httpClient = &http.Client{Timeout: 15 * time.Second}

// getJSON ist austauschbar für Tests.
var getJSON = func(ctx context.Context, u string, header map[string]string, out any) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("User-Agent", "AdminKit")
	req.Header.Set("Accept", "application/json, application/rdap+json")
	for k, v := range header {
		req.Header.Set(k, v)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return resp.StatusCode, err
	}
	if resp.StatusCode != 200 {
		return resp.StatusCode, nil
	}
	return resp.StatusCode, json.Unmarshal(body, out)
}

const ianaBootstrap = "https://data.iana.org/rdap/dns.json"

// RDAPResult enthält Registrierungsdaten einer Domain.
type RDAPResult struct {
	Domain     string    `json:"domain"`
	Registered time.Time `json:"registered,omitempty"`
	Changed    time.Time `json:"changed,omitempty"`
	Expires    time.Time `json:"expires,omitempty"`
	Registrar  string    `json:"registrar,omitempty"`
	Status     []string  `json:"status,omitempty"`
	AgeDays    int       `json:"age_days"`
	Source     string    `json:"source"`
	NotFound   bool      `json:"not_found"`
}

type bootstrap struct {
	Services [][][]string `json:"services"`
}

// RDAPLookup ermittelt Registrierung und Alter einer Domain über den
// RDAP-Server der TLD (IANA-Bootstrap, im Vault zwischengespeichert).
func RDAPLookup(ctx context.Context, domain, cacheDir string) (*RDAPResult, error) {
	domain = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(domain), "."))
	if err := ValidateName(domain); err != nil || !strings.Contains(domain, ".") {
		return nil, fmt.Errorf("ungültige Domain %q", domain)
	}
	tld := domain[strings.LastIndex(domain, ".")+1:]
	base, err := rdapBase(ctx, tld, cacheDir)
	if err != nil {
		return nil, err
	}
	var j struct {
		LDHName string   `json:"ldhName"`
		Status  []string `json:"status"`
		Events  []struct {
			Action string    `json:"eventAction"`
			Date   time.Time `json:"eventDate"`
		} `json:"events"`
		Entities []struct {
			Roles      []string `json:"roles"`
			VCardArray []any    `json:"vcardArray"`
		} `json:"entities"`
	}
	u := strings.TrimSuffix(base, "/") + "/domain/" + domain
	code, err := getJSON(ctx, u, nil, &j)
	if err != nil {
		return nil, err
	}
	r := &RDAPResult{Domain: domain, Source: u}
	if code == 404 {
		r.NotFound = true
		return r, nil
	}
	if code != 200 {
		return nil, fmt.Errorf("RDAP-Server antwortet mit HTTP %d", code)
	}
	r.Status = j.Status
	for _, e := range j.Events {
		switch e.Action {
		case "registration":
			r.Registered = e.Date
		case "last changed":
			r.Changed = e.Date
		case "expiration":
			r.Expires = e.Date
		}
	}
	for _, e := range j.Entities {
		for _, role := range e.Roles {
			if role == "registrar" {
				r.Registrar = vcardFN(e.VCardArray)
			}
		}
	}
	if !r.Registered.IsZero() {
		r.AgeDays = int(time.Since(r.Registered).Hours() / 24)
	}
	return r, nil
}

func vcardFN(v []any) string {
	if len(v) < 2 {
		return ""
	}
	props, _ := v[1].([]any)
	for _, p := range props {
		a, _ := p.([]any)
		if len(a) >= 4 && a[0] == "fn" {
			s, _ := a[3].(string)
			return s
		}
	}
	return ""
}

// rdapBase liefert den RDAP-Server einer TLD. Der IANA-Bootstrap wird 30 Tage
// im Vault (cacheDir) gespeichert.
func rdapBase(ctx context.Context, tld, cacheDir string) (string, error) {
	var b bootstrap
	cache := ""
	if cacheDir != "" {
		cache = filepath.Join(cacheDir, "rdap-bootstrap.json")
		if st, err := os.Stat(cache); err == nil && time.Since(st.ModTime()) < 30*24*time.Hour {
			if data, err := os.ReadFile(cache); err == nil {
				_ = json.Unmarshal(data, &b)
			}
		}
	}
	if len(b.Services) == 0 {
		code, err := getJSON(ctx, ianaBootstrap, nil, &b)
		if err != nil || code != 200 {
			return "", fmt.Errorf("IANA-RDAP-Verzeichnis nicht erreichbar")
		}
		if cache != "" {
			if data, err := json.Marshal(b); err == nil {
				_ = os.MkdirAll(cacheDir, 0755)
				_ = os.WriteFile(cache, data, 0644)
			}
		}
	}
	for _, s := range b.Services {
		if len(s) < 2 {
			continue
		}
		for _, t := range s[0] {
			if strings.EqualFold(t, tld) && len(s[1]) > 0 {
				return s[1][0], nil
			}
		}
	}
	return "", fmt.Errorf("für .%s gibt es keinen RDAP-Dienst (z. B. .de) – Domainalter nicht abrufbar", tld)
}
