// Package clients verwaltet Kundenprofile im Vault (siehe #74).
// Jeder Kunde wird als eigene Datei unter vault/clients/<id>.yaml gespeichert,
// damit die Kundenliste später über den Hub synchronisiert werden kann.
package clients

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"gopkg.in/yaml.v3"

	"adminkit/internal/config"
)

// Store kapselt das clients-Verzeichnis innerhalb einer Vault.
type Store struct {
	dir string
}

// NewStore erstellt einen Store für das clients-Verzeichnis unterhalb von vaultPath.
func NewStore(vaultPath string) (*Store, error) {
	dir := filepath.Join(vaultPath, "clients")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}
	return &Store{dir: dir}, nil
}

// List gibt alle Kundenprofile zurück (alphabetisch nach Name).
func (s *Store) List() ([]config.Customer, error) {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var customers []config.Customer
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".yaml") {
			continue
		}
		c, readErr := s.readFile(filepath.Join(s.dir, e.Name()))
		if readErr != nil {
			continue // beschädigte Datei überspringen statt komplett zu scheitern
		}
		customers = append(customers, c)
	}
	sort.Slice(customers, func(i, j int) bool {
		return strings.ToLower(customers[i].Name) < strings.ToLower(customers[j].Name)
	})
	return customers, nil
}

// Get lädt einen einzelnen Kunden anhand seiner ID.
func (s *Store) Get(id string) (config.Customer, error) {
	return s.readFile(s.pathFor(id))
}

// Save legt einen neuen Kunden an oder aktualisiert einen bestehenden.
// Fehlt eine ID, wird eine neue UUID vergeben und CreatedAt gesetzt.
// Gibt den gespeicherten Kunden (inkl. generierter ID) zurück.
func (s *Store) Save(c config.Customer) (config.Customer, error) {
	if strings.TrimSpace(c.Name) == "" {
		return config.Customer{}, fmt.Errorf("kundenname darf nicht leer sein")
	}
	if c.ID == "" {
		c.ID = uuid.NewString()
	}
	if c.CreatedAt == "" {
		c.CreatedAt = time.Now().Format("2006-01-02")
	}
	data, err := yaml.Marshal(c)
	if err != nil {
		return config.Customer{}, err
	}
	if err := os.WriteFile(s.pathFor(c.ID), data, 0644); err != nil {
		return config.Customer{}, err
	}
	return c, nil
}

// Delete entfernt ein Kundenprofil. Ein nicht existierender Kunde ist kein Fehler.
func (s *Store) Delete(id string) error {
	err := os.Remove(s.pathFor(id))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (s *Store) pathFor(id string) string {
	return filepath.Join(s.dir, sanitizeID(id)+".yaml")
}

func (s *Store) readFile(path string) (config.Customer, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return config.Customer{}, err
	}
	var c config.Customer
	if err := yaml.Unmarshal(data, &c); err != nil {
		return config.Customer{}, err
	}
	return c, nil
}

// sanitizeID verhindert Pfad-Traversal über manipulierte IDs.
func sanitizeID(id string) string {
	cleaned := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			return r
		default:
			return -1
		}
	}, id)
	if cleaned == "" {
		return "unknown"
	}
	return cleaned
}
