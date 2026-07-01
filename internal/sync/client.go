// Package sync ist die Client-Seite der AdminKit-Fleet-Synchronisierung
// (Rolle "client", siehe #74). Sie spricht die REST-API eines Hubs an:
// Pairing, Session-Push, Fleet-Abruf und Kundenliste. mDNS-Discovery in
// discovery.go findet Hubs im LAN ohne manuelle IP-Eingabe.
package sync

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"adminkit/internal/hub"
)

// ErrUnauthorized signalisiert, dass (Re-)Pairing nötig ist.
var ErrUnauthorized = errors.New("nicht autorisiert – Pairing erforderlich")

// Client kommuniziert mit genau einem Hub.
type Client struct {
	baseURL    string
	http       *http.Client
	deviceID   string
	deviceName string

	accessToken  string
	refreshToken string

	// OnTokens wird nach jedem Token-Wechsel aufgerufen, damit der Aufrufer
	// die Tokens in config.yaml persistieren kann.
	OnTokens func(access, refresh string)
}

// NewClient erstellt einen Client für baseURL (z.B. "http://192.168.1.10:8767").
func NewClient(baseURL, deviceID, deviceName string) *Client {
	return &Client{
		baseURL:    baseURL,
		deviceID:   deviceID,
		deviceName: deviceName,
		http:       &http.Client{Timeout: 15 * time.Second},
	}
}

// SetTokens setzt gespeicherte Tokens (z.B. beim Start vom Stick geladen).
func (c *Client) SetTokens(access, refresh string) {
	c.accessToken = access
	c.refreshToken = refresh
}

// Health prüft, ob der Hub erreichbar ist (ohne Auth).
func (c *Client) Health(ctx context.Context) (hub.HealthResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/health", nil)
	if err != nil {
		return hub.HealthResponse{}, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return hub.HealthResponse{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return hub.HealthResponse{}, fmt.Errorf("hub health status %d", resp.StatusCode)
	}
	var out hub.HealthResponse
	return out, json.NewDecoder(resp.Body).Decode(&out)
}

// Pair koppelt diesen Client per PIN an den Hub und speichert die Tokens.
func (c *Client) Pair(ctx context.Context, pin string) error {
	body, _ := json.Marshal(hub.PairClaimRequest{
		PIN: pin, DeviceID: c.deviceID, DeviceName: c.deviceName,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/pairing/claim", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("pairing fehlgeschlagen: %s", readError(resp))
	}
	var tokens hub.TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokens); err != nil {
		return err
	}
	c.setTokens(tokens.AccessToken, tokens.RefreshToken)
	return nil
}

// PushSession lädt Metadaten und alle Snapshots einer Session zum Hub hoch.
func (c *Client) PushSession(ctx context.Context, meta hub.SessionMeta, snapshots map[string][]byte) error {
	if meta.ID == "" {
		meta.ID = hub.SessionID(meta.DeviceID, meta.SessionName)
	}
	if _, err := c.doJSON(ctx, http.MethodPost, "/api/sessions/meta", meta, nil); err != nil {
		return err
	}
	for key, data := range snapshots {
		path := fmt.Sprintf("/api/sessions/%s/snapshots/%s", meta.ID, key)
		if _, err := c.doRaw(ctx, http.MethodPost, path, data, "application/json"); err != nil {
			return fmt.Errorf("snapshot %q: %w", key, err)
		}
	}
	return nil
}

// ListSessions ruft die Session-Liste des Hubs ab (für die Fleet-Übersicht).
func (c *Client) ListSessions(ctx context.Context) ([]hub.SessionMeta, error) {
	var out []hub.SessionMeta
	_, err := c.doJSON(ctx, http.MethodGet, "/api/sessions", nil, &out)
	return out, err
}

// Fleet ruft die nach Kunde gruppierte Übersicht ab.
func (c *Client) Fleet(ctx context.Context) (map[string][]hub.SessionMeta, error) {
	var out map[string][]hub.SessionMeta
	_, err := c.doJSON(ctx, http.MethodGet, "/api/fleet", nil, &out)
	return out, err
}

// --- interne Request-Helfer mit automatischem Token-Refresh ---

func (c *Client) doJSON(ctx context.Context, method, path string, in, out any) (int, error) {
	var body []byte
	if in != nil {
		var err error
		if body, err = json.Marshal(in); err != nil {
			return 0, err
		}
	}
	resp, err := c.doRaw(ctx, method, path, body, "application/json")
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil && err != io.EOF {
			return resp.StatusCode, err
		}
	}
	return resp.StatusCode, nil
}

// doRaw führt einen authentifizierten Request aus und wiederholt ihn einmal
// nach einem Token-Refresh, falls der Hub mit 401 antwortet.
func (c *Client) doRaw(ctx context.Context, method, path string, body []byte, contentType string) (*http.Response, error) {
	resp, err := c.send(ctx, method, path, body, contentType)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusUnauthorized {
		resp.Body.Close()
		if err := c.refresh(ctx); err != nil {
			return nil, ErrUnauthorized
		}
		resp, err = c.send(ctx, method, path, body, contentType)
		if err != nil {
			return nil, err
		}
	}
	if resp.StatusCode >= 400 {
		defer resp.Body.Close()
		return nil, fmt.Errorf("%s %s: %s", method, path, readError(resp))
	}
	return resp, nil
}

func (c *Client) send(ctx context.Context, method, path string, body []byte, contentType string) (*http.Response, error) {
	var r io.Reader
	if body != nil {
		r = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, r)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", contentType)
	}
	if c.accessToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.accessToken)
	}
	return c.http.Do(req)
}

func (c *Client) refresh(ctx context.Context) error {
	if c.refreshToken == "" {
		return ErrUnauthorized
	}
	body, _ := json.Marshal(hub.RefreshRequest{RefreshToken: c.refreshToken})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/pairing/refresh", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ErrUnauthorized
	}
	var tokens hub.TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokens); err != nil {
		return err
	}
	// Refresh liefert nur ein neues Access-Token; Refresh-Token bleibt.
	c.setTokens(tokens.AccessToken, c.refreshToken)
	return nil
}

func (c *Client) setTokens(access, refresh string) {
	c.accessToken = access
	c.refreshToken = refresh
	if c.OnTokens != nil {
		c.OnTokens(access, refresh)
	}
}

func readError(resp *http.Response) string {
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<10))
	var e struct {
		Error string `json:"error"`
	}
	if json.Unmarshal(data, &e) == nil && e.Error != "" {
		return e.Error
	}
	return http.StatusText(resp.StatusCode)
}
