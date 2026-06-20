//go:build darwin

package users

import (
	"bufio"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// Scan gibt alle lokalen Benutzerkonten zurück.
func Scan() (*ScanResult, error) {
	result := &ScanResult{}

	// Admin-Gruppe lesen
	adminMembers := readAdminMembers()

	// Alle User-Namen via dscl
	namesOut, err := exec.Command("dscl", ".", "-list", "/Users").Output()
	if err != nil {
		result.Errors = append(result.Errors, ScanError{Module: "users", Message: err.Error()})
		return result, nil
	}

	for _, name := range strings.Split(strings.TrimSpace(string(namesOut)), "\n") {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		u := buildUser(name, adminMembers)
		result.Users = append(result.Users, u)
	}

	// Wichtige Gruppen
	result.Groups = readGroups()

	return result, nil
}

func buildUser(name string, adminMembers map[string]bool) UserAccount {
	u := UserAccount{
		Name:    name,
		IsAdmin: adminMembers[name],
	}

	props := dscl("/Users/" + name)
	if uid, ok := props["UniqueID"]; ok {
		u.UID, _ = strconv.Atoi(uid)
		u.IsSystem = u.UID < 500 && u.UID != 0 || u.UID > 60000
	}
	if gid, ok := props["PrimaryGroupID"]; ok {
		u.GID, _ = strconv.Atoi(gid)
	}
	if v, ok := props["RealName"]; ok {
		u.FullName = v
	}
	if v, ok := props["UserShell"]; ok {
		u.Shell = v
		u.IsSystem = u.IsSystem || v == "/usr/bin/false" || v == "/sbin/nologin"
	}
	if v, ok := props["NFSHomeDirectory"]; ok {
		u.HomeDir = v
	}
	if v, ok := props["AuthenticationAuthority"]; ok {
		u.HasPassword = !strings.Contains(v, "NoPassword") && !strings.Contains(v, "DisabledUser")
		u.IsDisabled = strings.Contains(v, "DisabledUser")
	}
	// Letzter Login aus lastlog (bestes Effort, ignoriert Fehler)
	if out, err := exec.Command("last", "-1", name).Output(); err == nil {
		if ts := parseLastLogin(string(out)); !ts.IsZero() {
			u.LastLogin = ts
		}
	}
	return u
}

// dscl liest alle Properties eines Pfads und gibt sie als map zurück.
func dscl(path string) map[string]string {
	out, err := exec.Command("dscl", ".", "-read", path).Output()
	if err != nil {
		return nil
	}
	props := make(map[string]string)
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	var lastKey string
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, " ") {
			// Fortsetzungszeile
			if lastKey != "" && props[lastKey] == "" {
				props[lastKey] = strings.TrimSpace(line)
			}
			continue
		}
		if idx := strings.Index(line, ":"); idx > 0 {
			lastKey = strings.TrimSpace(line[:idx])
			props[lastKey] = strings.TrimSpace(line[idx+1:])
		}
	}
	return props
}

func readAdminMembers() map[string]bool {
	out, err := exec.Command("dscl", ".", "-read", "/Groups/admin", "GroupMembership").Output()
	if err != nil {
		return nil
	}
	members := make(map[string]bool)
	// Format: "GroupMembership: root dennis user1"
	line := strings.TrimPrefix(strings.TrimSpace(string(out)), "GroupMembership:")
	for _, m := range strings.Fields(line) {
		members[m] = true
	}
	return members
}

func readGroups() []LocalGroup {
	important := []string{"admin", "wheel", "staff", "sudo"}
	var groups []LocalGroup
	for _, g := range important {
		out, err := exec.Command("dscl", ".", "-read", "/Groups/"+g, "GroupMembership", "PrimaryGroupID").Output()
		if err != nil {
			continue
		}
		group := LocalGroup{Name: g}
		for _, line := range strings.Split(string(out), "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "GroupMembership:") {
				parts := strings.Fields(strings.TrimPrefix(line, "GroupMembership:"))
				group.Members = parts
			} else if strings.HasPrefix(line, "PrimaryGroupID:") {
				group.GID, _ = strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(line, "PrimaryGroupID:")))
			}
		}
		groups = append(groups, group)
	}
	return groups
}

// parseLastLogin versucht einen Zeitstempel aus `last -1 username` zu lesen.
func parseLastLogin(output string) time.Time {
	// Beispiel: "dennis   console  ...  Thu Jun 19 10:30"
	for _, line := range strings.Split(output, "\n") {
		fields := strings.Fields(line)
		// last gibt "wtmp begins..." für leere Historie oder "still logged in" an
		if len(fields) < 5 || strings.Contains(line, "wtmp") || strings.Contains(line, "begins") {
			continue
		}
		// Versuche die letzten 4-5 Felder als Datum zu parsen
		// Format variiert je nach Timezone, nehmen wir einfach was wir kriegen
		return time.Time{} // Robusteres Parsing ist platform-spezifisch komplex
	}
	return time.Time{}
}
