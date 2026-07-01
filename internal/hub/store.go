package hub

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"adminkit/internal/bundle"
)

// metaFilename ist die Metadaten-Datei je Session im Hub-Vault.
const metaFilename = "meta.json"

// Store persistiert empfangene Sessions im Hub-Vault. Threadsicher, da mehrere
// Clients gleichzeitig pushen können.
type Store struct {
	mu          sync.RWMutex
	sessionsDir string
	changedAt   time.Time // für GET /api/nudge (Änderungs-Polling)
}

// NewStore öffnet/erstellt den Session-Speicher unter hubRoot/sessions.
func NewStore(hubRoot string) (*Store, error) {
	dir := filepath.Join(hubRoot, "sessions")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}
	return &Store{sessionsDir: dir, changedAt: time.Now()}, nil
}

// SessionID bildet die global eindeutige ID aus DeviceID + Session-Name.
// Ohne DeviceID (z.B. Alt-Bundles) wird allein der Session-Name genutzt.
func SessionID(deviceID, sessionName string) string {
	if deviceID == "" {
		return sanitizeSegment(sessionName)
	}
	return sanitizeSegment(deviceID) + "__" + sanitizeSegment(sessionName)
}

// SaveMeta legt die Metadaten einer Session an oder aktualisiert sie.
// Fehlt meta.ID, wird sie aus DeviceID + SessionName gebildet.
func (s *Store) SaveMeta(meta SessionMeta) (SessionMeta, error) {
	if meta.ID == "" {
		meta.ID = SessionID(meta.DeviceID, meta.SessionName)
	}
	if meta.ReceivedAt.IsZero() {
		meta.ReceivedAt = time.Now()
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	dir := filepath.Join(s.sessionsDir, meta.ID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return SessionMeta{}, err
	}
	data, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return SessionMeta{}, err
	}
	if err := os.WriteFile(filepath.Join(dir, metaFilename), data, 0644); err != nil {
		return SessionMeta{}, err
	}
	s.changedAt = time.Now()
	return meta, nil
}

// SaveSnapshot schreibt einen Snapshot in eine bestehende oder neue Session.
func (s *Store) SaveSnapshot(sessionID, key string, data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	snapDir := filepath.Join(s.sessionsDir, sanitizeSegment(sessionID), "snapshots")
	if err := os.MkdirAll(snapDir, 0755); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(snapDir, sanitizeSegment(key)+".json"), data, 0644); err != nil {
		return err
	}
	s.changedAt = time.Now()
	return nil
}

// GetSnapshot liest einen Snapshot einer Session.
func (s *Store) GetSnapshot(sessionID, key string) ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	path := filepath.Join(s.sessionsDir, sanitizeSegment(sessionID), "snapshots", sanitizeSegment(key)+".json")
	return os.ReadFile(path)
}

// GetMeta liest die Metadaten einer einzelnen Session.
func (s *Store) GetMeta(sessionID string) (SessionMeta, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.readMeta(sanitizeSegment(sessionID))
}

// ListSessions gibt alle Sessions zurück (neueste Scan-Zeit zuerst).
func (s *Store) ListSessions() ([]SessionMeta, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	entries, err := os.ReadDir(s.sessionsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var metas []SessionMeta
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		meta, readErr := s.readMeta(e.Name())
		if readErr != nil {
			continue // Session ohne (lesbare) meta.json überspringen
		}
		metas = append(metas, meta)
	}
	sort.Slice(metas, func(i, j int) bool {
		return metas[i].ScannedAt.After(metas[j].ScannedAt)
	})
	return metas, nil
}

// SessionCount zählt die gespeicherten Sessions.
func (s *Store) SessionCount() int {
	metas, _ := s.ListSessions()
	return len(metas)
}

// ChangedAt gibt den Zeitpunkt der letzten Änderung zurück (für /api/nudge).
func (s *Store) ChangedAt() time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.changedAt
}

// ImportBundle speichert ein .adminkit-Bundle über den normalen Storage-Pfad.
func (s *Store) ImportBundle(bundlePath, sourceDevice string) (SessionMeta, error) {
	bmeta, snapshots, err := bundle.Read(bundlePath)
	if err != nil {
		return SessionMeta{}, err
	}
	meta := metaFromBundle(bmeta, sourceDevice)
	saved, err := s.SaveMeta(meta)
	if err != nil {
		return SessionMeta{}, err
	}
	keys := make([]string, 0, len(snapshots))
	for key, data := range snapshots {
		if err := s.SaveSnapshot(saved.ID, key, data); err != nil {
			return SessionMeta{}, err
		}
		keys = append(keys, key)
	}
	saved.Snapshots = keys
	return s.SaveMeta(saved)
}

func (s *Store) readMeta(dirName string) (SessionMeta, error) {
	dir := filepath.Join(s.sessionsDir, dirName)
	data, err := os.ReadFile(filepath.Join(dir, metaFilename))
	if err != nil {
		return SessionMeta{}, err
	}
	var meta SessionMeta
	if err := json.Unmarshal(data, &meta); err != nil {
		return SessionMeta{}, err
	}
	// Vorhandene Snapshot-Keys anhängen (immer frisch von der Platte).
	if snaps, sErr := os.ReadDir(filepath.Join(dir, "snapshots")); sErr == nil {
		meta.Snapshots = meta.Snapshots[:0]
		for _, sn := range snaps {
			if !sn.IsDir() && strings.HasSuffix(sn.Name(), ".json") {
				meta.Snapshots = append(meta.Snapshots, strings.TrimSuffix(sn.Name(), ".json"))
			}
		}
	}
	return meta, nil
}

// metaFromBundle konvertiert bundle.Meta in eine Hub-SessionMeta.
func metaFromBundle(b bundle.Meta, sourceDevice string) SessionMeta {
	return SessionMeta{
		ID:           SessionID(b.DeviceID, b.SessionName),
		SessionName:  b.SessionName,
		CustomerName: b.CustomerName,
		DeviceAlias:  b.DeviceAlias,
		Hostname:     b.Hostname,
		Location:     b.Location,
		Technician:   b.Technician,
		DeviceID:     b.DeviceID,
		SourceDevice: sourceDevice,
		ScannedAt:    b.ScannedAt,
		ReceivedAt:   time.Now(),
	}
}

// sanitizeSegment hält Pfadsegmente frei von Trennern und Traversal.
func sanitizeSegment(s string) string {
	cleaned := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9',
			r == '-', r == '_':
			return r
		default:
			return '_'
		}
	}, s)
	cleaned = strings.Trim(cleaned, "_")
	if cleaned == "" {
		return "unknown"
	}
	return cleaned
}
