package netcheck

import (
	"context"
	"fmt"
	"net/url"
	"strings"
)

// Preview ist das Ergebnis der Link-Vorschau über microlink.io.
// AdminKit ruft verdächtige Links NIE selbst auf – sonst sähe der Betreiber
// die IP-Adresse des Kunden. Weiterleitungen und Titel ermittelt der Dienst.
type Preview struct {
	URL         string   `json:"url"`       // geprüfte Adresse
	FinalURL    string   `json:"final_url"` // nach Weiterleitungen
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Publisher   string   `json:"publisher"`
	Image       string   `json:"image"`
	Screenshot  string   `json:"screenshot"` // vom Dienst erstellter Screenshot
	Redirects   []string `json:"redirects"`  // Weiterleitungskette
	Status      int      `json:"status"`     // HTTP-Status der Zielseite (falls gemeldet)
}

var microlinkBase = "https://api.microlink.io/"

// ValidateURL lässt nur http(s)-Adressen zu.
func ValidateURL(raw string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return nil, fmt.Errorf("nur http(s)-Adressen können geprüft werden")
	}
	return u, nil
}

// LinkPreview fragt microlink nach Titel, Beschreibung und Endadresse.
func LinkPreview(ctx context.Context, raw string) (*Preview, error) {
	u, err := ValidateURL(raw)
	if err != nil {
		return nil, err
	}
	var j struct {
		Status string `json:"status"`
		Data   struct {
			Title       string `json:"title"`
			Description string `json:"description"`
			Publisher   string `json:"publisher"`
			URL         string `json:"url"`
			Image       *struct {
				URL string `json:"url"`
			} `json:"image"`
			Screenshot *struct {
				URL string `json:"url"`
			} `json:"screenshot"`
		} `json:"data"`
		Redirects []struct {
			URL string `json:"url"`
		} `json:"redirects"`
		StatusCode int    `json:"statusCode"`
		Message    string `json:"message"`
	}
	code, err := getJSON(ctx, microlinkBase+"?url="+url.QueryEscape(u.String())+"&screenshot=true&meta=true", nil, &j)
	if err != nil {
		return nil, fmt.Errorf("Vorschaudienst nicht erreichbar: %v", err)
	}
	if code != 200 || j.Status != "success" {
		if j.Message != "" {
			return nil, fmt.Errorf("Vorschaudienst: %s", j.Message)
		}
		return nil, fmt.Errorf("Vorschaudienst antwortet mit HTTP %d", code)
	}
	p := &Preview{URL: u.String(), FinalURL: j.Data.URL, Title: j.Data.Title, Description: j.Data.Description, Publisher: j.Data.Publisher, Status: j.StatusCode}
	if j.Data.Image != nil {
		p.Image = j.Data.Image.URL
	}
	if j.Data.Screenshot != nil {
		p.Screenshot = j.Data.Screenshot.URL
	}
	for _, r := range j.Redirects {
		if r.URL != "" {
			p.Redirects = append(p.Redirects, r.URL)
		}
	}
	return p, nil
}

// URLScanHit ist ein früherer Scan bei urlscan.io.
type URLScanHit struct {
	URL        string `json:"url"`
	Time       string `json:"time"`
	Screenshot string `json:"screenshot"`
	Result     string `json:"result"` // Link zum Bericht
	Malicious  bool   `json:"malicious"`
}

// URLScanSearch sucht frühere Scans einer Domain (nur mit API-Key).
func URLScanSearch(ctx context.Context, domain, apiKey string) ([]URLScanHit, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("kein urlscan.io-API-Key hinterlegt")
	}
	if err := ValidateName(domain); err != nil {
		return nil, err
	}
	var j struct {
		Results []struct {
			Task struct {
				URL  string `json:"url"`
				Time string `json:"time"`
			} `json:"task"`
			Screenshot string `json:"screenshot"`
			Result     string `json:"result"`
			Verdicts   *struct {
				Overall struct {
					Malicious bool `json:"malicious"`
				} `json:"overall"`
			} `json:"verdicts"`
		} `json:"results"`
	}
	code, err := getJSON(ctx, "https://urlscan.io/api/v1/search/?size=5&q="+url.QueryEscape("domain:"+domain), map[string]string{"API-Key": apiKey}, &j)
	if err != nil {
		return nil, err
	}
	if code != 200 {
		return nil, fmt.Errorf("urlscan.io antwortet mit HTTP %d", code)
	}
	var out []URLScanHit
	for _, r := range j.Results {
		h := URLScanHit{URL: r.Task.URL, Time: r.Task.Time, Screenshot: r.Screenshot, Result: strings.Replace(r.Result, "/api/v1/result/", "/result/", 1)}
		if r.Verdicts != nil {
			h.Malicious = r.Verdicts.Overall.Malicious
		}
		out = append(out, h)
	}
	return out, nil
}
