package hub

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	// pinTTL: Gültigkeit eines Pairing-PINs.
	pinTTL = 5 * time.Minute
	// accessTokenTTL / refreshTokenTTL: Lebensdauer der JWTs.
	accessTokenTTL  = 24 * time.Hour
	refreshTokenTTL = 7 * 24 * time.Hour
	// maxPINAttempts: nach so vielen Fehlversuchen wird der PIN verworfen.
	maxPINAttempts = 5

	keyFilename     = "hub.key"
	devicesFilename = "devices.json"
)

var (
	// ErrPairingInactive: es ist gerade kein PIN gültig.
	ErrPairingInactive = errors.New("kein aktiver Pairing-PIN")
	// ErrInvalidPIN: PIN falsch oder abgelaufen.
	ErrInvalidPIN = errors.New("PIN ungültig oder abgelaufen")
	// ErrTooManyAttempts: PIN wegen zu vieler Fehlversuche gesperrt.
	ErrTooManyAttempts = errors.New("zu viele Fehlversuche")
)

// Device ist ein gekoppeltes Client-Gerät.
type Device struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	PairedAt time.Time `json:"paired_at"`
	LastSeen time.Time `json:"last_seen"`
}

// claims sind die JWT-Claims eines Tokens.
type claims struct {
	DeviceID  string `json:"did"`
	TokenType string `json:"typ"` // "access" | "refresh"
	jwt.RegisteredClaims
}

// Authenticator verwaltet Signing-Key, PIN-Pairing und Geräte-Registry.
type Authenticator struct {
	mu         sync.Mutex
	signingKey []byte
	hubRoot    string

	pin         string
	pinExpires  time.Time
	pinAttempts int

	devices map[string]Device
}

// NewAuthenticator lädt (oder erzeugt) den Signing-Key und die Geräteliste.
func NewAuthenticator(hubRoot string) (*Authenticator, error) {
	a := &Authenticator{hubRoot: hubRoot, devices: map[string]Device{}}
	if err := a.loadOrCreateKey(); err != nil {
		return nil, err
	}
	a.loadDevices()
	return a, nil
}

func (a *Authenticator) loadOrCreateKey() error {
	path := filepath.Join(a.hubRoot, keyFilename)
	if data, err := os.ReadFile(path); err == nil {
		key, decErr := base64.StdEncoding.DecodeString(string(data))
		if decErr == nil && len(key) >= 32 {
			a.signingKey = key
			return nil
		}
	}
	// Neuen 256-bit-Schlüssel erzeugen und persistieren.
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return err
	}
	if err := os.MkdirAll(a.hubRoot, 0755); err != nil {
		return err
	}
	if err := os.WriteFile(path, []byte(base64.StdEncoding.EncodeToString(key)), 0600); err != nil {
		return err
	}
	a.signingKey = key
	return nil
}

// GeneratePIN erzeugt einen neuen 6-stelligen Pairing-PIN mit 5-Minuten-TTL.
// Ein evtl. vorhandener PIN wird ersetzt.
func (a *Authenticator) GeneratePIN() (string, time.Time, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", time.Time{}, err
	}
	a.pin = fmt.Sprintf("%06d", n.Int64())
	a.pinExpires = time.Now().Add(pinTTL)
	a.pinAttempts = 0
	return a.pin, a.pinExpires, nil
}

// PairingActive meldet, ob gerade ein gültiger PIN existiert.
func (a *Authenticator) PairingActive() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.pin != "" && time.Now().Before(a.pinExpires)
}

// ClearPIN verwirft einen aktiven PIN (z.B. beim Stoppen des Hubs).
func (a *Authenticator) ClearPIN() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.pin = ""
	a.pinAttempts = 0
}

// Claim prüft den PIN und gibt bei Erfolg Access- und Refresh-Token zurück.
// Der PIN ist einmalig — nach erfolgreichem Claim wird er verbraucht.
func (a *Authenticator) Claim(pin, deviceID, deviceName string) (TokenResponse, error) {
	a.mu.Lock()
	if a.pin == "" || time.Now().After(a.pinExpires) {
		a.mu.Unlock()
		return TokenResponse{}, ErrPairingInactive
	}
	if a.pinAttempts >= maxPINAttempts {
		a.pin = ""
		a.mu.Unlock()
		return TokenResponse{}, ErrTooManyAttempts
	}
	if pin != a.pin {
		a.pinAttempts++
		a.mu.Unlock()
		return TokenResponse{}, ErrInvalidPIN
	}
	// Erfolg: PIN verbrauchen, Gerät registrieren.
	a.pin = ""
	now := time.Now()
	dev := a.devices[deviceID]
	dev.ID = deviceID
	dev.Name = deviceName
	if dev.PairedAt.IsZero() {
		dev.PairedAt = now
	}
	dev.LastSeen = now
	a.devices[deviceID] = dev
	a.mu.Unlock()

	a.saveDevices()
	return a.issueTokens(deviceID)
}

// Refresh tauscht ein gültiges Refresh-Token gegen ein neues Access-Token.
func (a *Authenticator) Refresh(refreshToken string) (TokenResponse, error) {
	c, err := a.parse(refreshToken)
	if err != nil {
		return TokenResponse{}, err
	}
	if c.TokenType != "refresh" {
		return TokenResponse{}, errors.New("kein Refresh-Token")
	}
	a.touchDevice(c.DeviceID)
	access, expiresAt, err := a.signToken(c.DeviceID, "access", accessTokenTTL)
	if err != nil {
		return TokenResponse{}, err
	}
	return TokenResponse{AccessToken: access, ExpiresAt: expiresAt}, nil
}

// Verify prüft ein Access-Token und gibt die DeviceID zurück.
func (a *Authenticator) Verify(accessToken string) (string, error) {
	c, err := a.parse(accessToken)
	if err != nil {
		return "", err
	}
	if c.TokenType != "access" {
		return "", errors.New("kein Access-Token")
	}
	a.touchDevice(c.DeviceID)
	return c.DeviceID, nil
}

// Devices gibt die Liste gekoppelter Geräte zurück.
func (a *Authenticator) Devices() []Device {
	a.mu.Lock()
	defer a.mu.Unlock()
	list := make([]Device, 0, len(a.devices))
	for _, d := range a.devices {
		list = append(list, d)
	}
	return list
}

func (a *Authenticator) issueTokens(deviceID string) (TokenResponse, error) {
	access, expiresAt, err := a.signToken(deviceID, "access", accessTokenTTL)
	if err != nil {
		return TokenResponse{}, err
	}
	refresh, _, err := a.signToken(deviceID, "refresh", refreshTokenTTL)
	if err != nil {
		return TokenResponse{}, err
	}
	return TokenResponse{AccessToken: access, RefreshToken: refresh, ExpiresAt: expiresAt}, nil
}

func (a *Authenticator) signToken(deviceID, tokenType string, ttl time.Duration) (string, int64, error) {
	expiresAt := time.Now().Add(ttl)
	c := claims{
		DeviceID:  deviceID,
		TokenType: tokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "adminkit-hub",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, c)
	signed, err := token.SignedString(a.signingKey)
	return signed, expiresAt.Unix(), err
}

func (a *Authenticator) parse(tokenStr string) (*claims, error) {
	c := &claims{}
	_, err := jwt.ParseWithClaims(tokenStr, c, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unerwartete Signatur-Methode: %v", t.Header["alg"])
		}
		return a.signingKey, nil
	})
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (a *Authenticator) touchDevice(deviceID string) {
	a.mu.Lock()
	if dev, ok := a.devices[deviceID]; ok {
		dev.LastSeen = time.Now()
		a.devices[deviceID] = dev
	}
	a.mu.Unlock()
	a.saveDevices()
}

func (a *Authenticator) loadDevices() {
	data, err := os.ReadFile(filepath.Join(a.hubRoot, devicesFilename))
	if err != nil {
		return
	}
	var list []Device
	if json.Unmarshal(data, &list) != nil {
		return
	}
	for _, d := range list {
		a.devices[d.ID] = d
	}
}

func (a *Authenticator) saveDevices() {
	a.mu.Lock()
	list := make([]Device, 0, len(a.devices))
	for _, d := range a.devices {
		list = append(list, d)
	}
	a.mu.Unlock()
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(filepath.Join(a.hubRoot, devicesFilename), data, 0600)
}
