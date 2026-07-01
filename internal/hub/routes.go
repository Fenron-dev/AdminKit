package hub

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"

	"adminkit/internal/config"
)

// maxSnapshotBytes begrenzt die Größe eines hochgeladenen Snapshots.
const maxSnapshotBytes = 20 << 20 // 20 MB

// maxBundleBytes begrenzt die Größe eines hochgeladenen .adminkit-Bundles.
const maxBundleBytes = 100 << 20 // 100 MB

// routes registriert alle HTTP-Endpoints (Go 1.22+ Methoden-Routing).
func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()

	// Öffentlich (ohne Auth):
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("POST /api/pairing/claim", s.handleClaim)
	mux.HandleFunc("POST /api/pairing/refresh", s.handleRefresh)

	// Geschützt (Bearer-Token):
	mux.Handle("GET /api/sessions", s.auth_(s.handleListSessions))
	mux.Handle("POST /api/sessions/meta", s.auth_(s.handleSaveMeta))
	mux.Handle("POST /api/sessions/{id}/snapshots/{key}", s.auth_(s.handlePutSnapshot))
	mux.Handle("GET /api/sessions/{id}/snapshots/{key}", s.auth_(s.handleGetSnapshot))
	mux.Handle("POST /api/sessions/import", s.auth_(s.handleImportBundle))
	mux.Handle("GET /api/fleet", s.auth_(s.handleFleet))
	mux.Handle("GET /api/clients", s.auth_(s.handleListClients))
	mux.Handle("POST /api/clients", s.auth_(s.handleSaveClient))
	mux.Handle("GET /api/nudge", s.auth_(s.handleNudge))

	return mux
}

// auth_ ist die Bearer-Token-Middleware für /api/*-Routen.
func (s *Server) auth_(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		token, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || token == "" {
			writeError(w, http.StatusUnauthorized, "kein Bearer-Token")
			return
		}
		if _, err := s.auth.Verify(token); err != nil {
			writeError(w, http.StatusUnauthorized, "token ungültig")
			return
		}
		next(w, r)
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, HealthResponse{
		Status:       "ok",
		Version:      s.version,
		SessionCount: s.store.SessionCount(),
	})
}

func (s *Server) handleClaim(w http.ResponseWriter, r *http.Request) {
	if !s.limiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "zu viele Pairing-Versuche")
		return
	}
	var req PairClaimRequest
	if err := decodeJSON(r, &req, 4<<10); err != nil {
		writeError(w, http.StatusBadRequest, "ungültiger Request")
		return
	}
	tokens, err := s.auth.Claim(req.PIN, req.DeviceID, req.DeviceName)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, tokens)
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var req RefreshRequest
	if err := decodeJSON(r, &req, 4<<10); err != nil {
		writeError(w, http.StatusBadRequest, "ungültiger Request")
		return
	}
	tokens, err := s.auth.Refresh(req.RefreshToken)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "refresh fehlgeschlagen")
		return
	}
	writeJSON(w, http.StatusOK, tokens)
}

func (s *Server) handleListSessions(w http.ResponseWriter, _ *http.Request) {
	sessions, err := s.store.ListSessions()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, sessions)
}

func (s *Server) handleSaveMeta(w http.ResponseWriter, r *http.Request) {
	var meta SessionMeta
	if err := decodeJSON(r, &meta, 64<<10); err != nil {
		writeError(w, http.StatusBadRequest, "ungültige Metadaten")
		return
	}
	saved, err := s.store.SaveMeta(meta)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) handlePutSnapshot(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	key := r.PathValue("key")
	data, err := io.ReadAll(io.LimitReader(r.Body, maxSnapshotBytes))
	if err != nil {
		writeError(w, http.StatusBadRequest, "körper konnte nicht gelesen werden")
		return
	}
	if !json.Valid(data) {
		writeError(w, http.StatusBadRequest, "snapshot ist kein gültiges JSON")
		return
	}
	if err := s.store.SaveSnapshot(id, key, data); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleGetSnapshot(w http.ResponseWriter, r *http.Request) {
	data, err := s.store.GetSnapshot(r.PathValue("id"), r.PathValue("key"))
	if err != nil {
		writeError(w, http.StatusNotFound, "snapshot nicht gefunden")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(data)
}

func (s *Server) handleImportBundle(w http.ResponseWriter, r *http.Request) {
	tmp, err := io.ReadAll(io.LimitReader(r.Body, maxBundleBytes))
	if err != nil {
		writeError(w, http.StatusBadRequest, "bundle konnte nicht gelesen werden")
		return
	}
	path, err := writeTempBundle(tmp)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer removeTemp(path)

	source := r.Header.Get("X-Source-Device")
	meta, err := s.store.ImportBundle(path, source)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, meta)
}

func (s *Server) handleFleet(w http.ResponseWriter, _ *http.Request) {
	// Detaillierte Aggregation (Trends, Health-Verlauf) folgt in Phase C (#79).
	groups, err := s.Fleet()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, groups)
}

func (s *Server) handleListClients(w http.ResponseWriter, _ *http.Request) {
	list, err := s.clients.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleSaveClient(w http.ResponseWriter, r *http.Request) {
	var c config.Customer
	if err := decodeJSON(r, &c, 64<<10); err != nil {
		writeError(w, http.StatusBadRequest, "ungültiges Kundenprofil")
		return
	}
	saved, err := s.clients.Save(c)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

// handleNudge liefert den Zeitstempel der letzten Änderung. Clients pollen
// diesen Wert statt einer WebSocket-Verbindung (siehe Konzept).
func (s *Server) handleNudge(w http.ResponseWriter, r *http.Request) {
	changed := s.store.ChangedAt()
	if sinceStr := r.URL.Query().Get("since"); sinceStr != "" {
		if unix, err := strconv.ParseInt(sinceStr, 10, 64); err == nil {
			writeJSON(w, http.StatusOK, map[string]any{
				"changed":    changed.Unix() > unix,
				"changed_at": changed.Unix(),
			})
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"changed_at": changed.Unix()})
}

// --- Helfer ---

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func decodeJSON(r *http.Request, v any, limit int64) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, limit))
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

func clientIP(r *http.Request) string {
	if host, _, err := splitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// splitHostPort ist ein dünner Wrapper, der leere Adressen toleriert.
func splitHostPort(addr string) (string, string, error) {
	i := strings.LastIndex(addr, ":")
	if i < 0 {
		return addr, "", nil
	}
	return addr[:i], addr[i+1:], nil
}

// writeTempBundle legt hochgeladene Bundle-Bytes in einer temporären Datei ab,
// damit sie über den dateibasierten bundle.Read-Pfad importiert werden können.
func writeTempBundle(data []byte) (string, error) {
	f, err := os.CreateTemp("", "adminkit-upload-*.adminkit")
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := f.Write(data); err != nil {
		os.Remove(f.Name())
		return "", err
	}
	return f.Name(), nil
}

func removeTemp(path string) {
	_ = os.Remove(path)
}
