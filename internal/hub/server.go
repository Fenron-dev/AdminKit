package hub

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"adminkit/internal/clients"
)

// Server ist der eingebettete AdminKit-Hub (Rolle "hub").
type Server struct {
	version string
	hubRoot string

	store   *Store
	auth    *Authenticator
	clients *clients.Store
	mdns    *advertiser
	limiter *rateLimiter

	mu         sync.Mutex
	httpServer *http.Server
	port       int
	running    bool
	advertise  bool
}

// Options konfiguriert einen Hub-Server.
type Options struct {
	// HubRoot ist das Vault-Verzeichnis des Hubs (Sessions, Keys, Clients).
	HubRoot string
	// Port, auf dem gelauscht wird (0 = DefaultPort).
	Port int
	// Version wird in /health gemeldet.
	Version string
	// Advertise aktiviert die mDNS-Bekanntmachung im LAN.
	Advertise bool
}

// NewServer initialisiert Store, Authenticator und Kundenspeicher des Hubs.
func NewServer(opts Options) (*Server, error) {
	if opts.Port == 0 {
		opts.Port = DefaultPort
	}
	store, err := NewStore(opts.HubRoot)
	if err != nil {
		return nil, err
	}
	auth, err := NewAuthenticator(opts.HubRoot)
	if err != nil {
		return nil, err
	}
	clientStore, err := clients.NewStore(opts.HubRoot)
	if err != nil {
		return nil, err
	}
	return &Server{
		version:   opts.Version,
		hubRoot:   opts.HubRoot,
		store:     store,
		auth:      auth,
		clients:   clientStore,
		limiter:   newRateLimiter(10, time.Minute),
		port:      opts.Port,
		advertise: opts.Advertise,
	}, nil
}

// Start bindet den Port und startet den HTTP-Server im Hintergrund.
func (s *Server) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running {
		return nil
	}

	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", s.port))
	if err != nil {
		return fmt.Errorf("hub-port %d konnte nicht gebunden werden: %w", s.port, err)
	}

	s.httpServer = &http.Server{
		Handler:           s.routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	s.running = true

	go func() {
		if serveErr := s.httpServer.Serve(ln); serveErr != nil && serveErr != http.ErrServerClosed {
			s.mu.Lock()
			s.running = false
			s.mu.Unlock()
		}
	}()

	if s.advertise {
		adv, advErr := startAdvertiser(s.port, s.version)
		if advErr == nil {
			s.mdns = adv
		}
	}
	return nil
}

// Stop fährt den Server herunter und beendet die mDNS-Bekanntmachung.
func (s *Server) Stop() error {
	s.mu.Lock()
	server := s.httpServer
	mdns := s.mdns
	s.httpServer = nil
	s.mdns = nil
	s.running = false
	s.mu.Unlock()

	if mdns != nil {
		mdns.stop()
	}
	s.auth.ClearPIN()
	if server == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return server.Shutdown(ctx)
}

// Handler gibt den konfigurierten HTTP-Handler zurück. Wird vom Standalone-Hub
// (Phase D) und von Tests genutzt, um den Server ohne eigenen Listener einzubetten.
func (s *Server) Handler() http.Handler {
	return s.routes()
}

// GeneratePairingCode erzeugt einen neuen PIN für das Client-Pairing.
func (s *Server) GeneratePairingCode() (string, time.Time, error) {
	return s.auth.GeneratePIN()
}

// Status liefert den aktuellen Laufzeitzustand für das UI.
func (s *Server) Status() Status {
	s.mu.Lock()
	running := s.running
	port := s.port
	advertising := s.mdns != nil
	s.mu.Unlock()
	return Status{
		Running:       running,
		Port:          port,
		SessionCount:  s.store.SessionCount(),
		PairedDevices: len(s.auth.Devices()),
		PairingActive: s.auth.PairingActive(),
		Advertising:   advertising,
	}
}

// rateLimiter ist ein einfacher Fenster-Zähler pro Schlüssel (z.B. IP).
type rateLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	hits   map[string][]time.Time
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{limit: limit, window: window, hits: map[string][]time.Time{}}
}

// allow meldet true, wenn der Schlüssel im aktuellen Fenster noch Budget hat.
func (r *rateLimiter) allow(key string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-r.window)
	kept := r.hits[key][:0]
	for _, t := range r.hits[key] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= r.limit {
		r.hits[key] = kept
		return false
	}
	r.hits[key] = append(kept, now)
	return true
}
