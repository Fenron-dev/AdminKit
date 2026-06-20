// Package users listet lokale Benutzerkonten und Gruppen auf.
package users

import "time"

// UserAccount beschreibt ein lokales Benutzerkonto.
type UserAccount struct {
	Name          string    `json:"name"`
	FullName      string    `json:"full_name,omitempty"`
	UID           int       `json:"uid"`
	GID           int       `json:"gid"`
	Shell         string    `json:"shell,omitempty"`
	HomeDir       string    `json:"home_dir,omitempty"`
	IsAdmin       bool      `json:"is_admin"`
	IsSystem      bool      `json:"is_system"`    // UID < 500 oder System-User
	IsDisabled    bool      `json:"is_disabled"`
	LastLogin     time.Time `json:"last_login,omitempty"`
	HasPassword   bool      `json:"has_password"`
	PasswordNeverExpires bool `json:"password_never_expires,omitempty"`
}

// LocalGroup beschreibt eine lokale Gruppe.
type LocalGroup struct {
	Name    string   `json:"name"`
	GID     int      `json:"gid"`
	Members []string `json:"members"`
}

// ScanResult enthält alle gefundenen Benutzerkonten und Gruppen.
type ScanResult struct {
	Users  []UserAccount `json:"users"`
	Groups []LocalGroup  `json:"groups,omitempty"`
	Errors []ScanError   `json:"errors,omitempty"`
}

// ScanError beschreibt einen nicht-fatalen Fehler.
type ScanError struct {
	Module  string `json:"module"`
	Message string `json:"message"`
}
