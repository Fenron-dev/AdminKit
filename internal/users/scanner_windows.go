//go:build windows

package users

import (
	"os/exec"
	"strings"

	"github.com/yusufpapurcu/wmi"
)

type win32User struct {
	Name                string
	FullName            string
	Disabled            bool
	Lockout             bool
	PasswordRequired    bool
	PasswordExpires     bool
	SID                 string
}

type win32GroupUser struct {
	GroupComponent string
	PartComponent  string
}

// Scan gibt alle lokalen Benutzerkonten zurück.
func Scan() (*ScanResult, error) {
	result := &ScanResult{}

	var wmiUsers []win32User
	if err := wmi.Query("SELECT Name, FullName, Disabled, Lockout, PasswordRequired, PasswordExpires, SID FROM Win32_UserAccount WHERE LocalAccount = True", &wmiUsers); err != nil {
		result.Errors = append(result.Errors, ScanError{Module: "users", Message: err.Error()})
		return result, nil
	}

	adminMembers := readAdminMembers()

	for _, wu := range wmiUsers {
		isSystem := strings.EqualFold(wu.Name, "Guest") ||
			strings.EqualFold(wu.Name, "DefaultAccount") ||
			strings.EqualFold(wu.Name, "WDAGUtilityAccount")
		u := UserAccount{
			Name:                 wu.Name,
			FullName:             wu.FullName,
			IsAdmin:              adminMembers[strings.ToLower(wu.Name)],
			IsSystem:             isSystem,
			IsDisabled:           wu.Disabled || wu.Lockout,
			HasPassword:          wu.PasswordRequired,
			PasswordNeverExpires: !wu.PasswordExpires,
		}
		result.Users = append(result.Users, u)
	}

	adminGroup := LocalGroup{Name: "Administratoren / Administrators"}
	for name := range adminMembers {
		adminGroup.Members = append(adminGroup.Members, name)
	}
	if len(adminGroup.Members) > 0 {
		result.Groups = append(result.Groups, adminGroup)
	}

	return result, nil
}

func readAdminMembers() map[string]bool {
	members := make(map[string]bool)
	hostname := localHostname()
	var groupUsers []win32GroupUser
	for _, groupName := range []string{"Administrators", "Administratoren"} {
		q := `SELECT GroupComponent, PartComponent FROM Win32_GroupUser WHERE GroupComponent = "Win32_Group.Domain='` + hostname + `',Name='` + groupName + `'"`
		wmi.Query(q, &groupUsers)
		if len(groupUsers) > 0 {
			break
		}
	}
	for _, gu := range groupUsers {
		if idx := strings.Index(gu.PartComponent, "Name=\""); idx >= 0 {
			name := gu.PartComponent[idx+6:]
			if end := strings.Index(name, "\""); end >= 0 {
				members[strings.ToLower(name[:end])] = true
			}
		}
	}
	return members
}

func localHostname() string {
	out, err := exec.Command("hostname").Output()
	if err != nil {
		return "."
	}
	return strings.TrimSpace(string(out))
}
