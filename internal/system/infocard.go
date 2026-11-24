package system

// Info-Karte fürs Telefonat (#127): Werte, die der Kunde vorlesen soll. Nur lesend.

import (
	"context"
	"net"
	"os"
	"os/user"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"adminkit/internal/execx"
)

// InfoCard fasst die wichtigsten Angaben zusammen.
type InfoCard struct {
	Hostname     string   `json:"hostname"`
	User         string   `json:"user"`
	OS           string   `json:"os"`
	Manufacturer string   `json:"manufacturer"`
	Model        string   `json:"model"`
	Serial       string   `json:"serial"`
	IPs          []string `json:"ips"`
	AnyDesk      string   `json:"anydesk,omitempty"`
	TeamViewer   string   `json:"teamviewer,omitempty"`
}

var reAnyDesk = regexp.MustCompile(`(?m)^ad\.anynet\.id=(\d+)`)

// GetInfoCard sammelt die Angaben (je Quelle mit kurzem Zeitlimit).
func GetInfoCard(ctx context.Context) InfoCard {
	c := InfoCard{}
	c.Hostname, _ = os.Hostname()
	if u, err := user.Current(); err == nil {
		c.User = u.Username
		if i := strings.LastIndex(c.User, `\`); i >= 0 {
			c.User = c.User[i+1:]
		}
	}
	if id, err := Identity(); err == nil {
		c.Manufacturer, c.Model, c.Serial = id.Manufacturer, id.Model, id.Serial
	}
	c.IPs = LocalIPs()
	switch runtime.GOOS {
	case "windows":
		out, _ := execx.Output(ctx, 15*time.Second, "powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
			`$o=(Get-CimInstance Win32_OperatingSystem).Caption; $v=(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction SilentlyContinue).DisplayVersion; "$o $v"`)
		c.OS = strings.TrimSpace(out)
		c.AnyDesk = anyDeskID(filepath.Join(os.Getenv("ProgramData"), "AnyDesk", "system.conf"))
		for _, k := range []string{`HKLM\SOFTWARE\TeamViewer`, `HKLM\SOFTWARE\WOW6432Node\TeamViewer`} {
			out, err := execx.Output(ctx, 5*time.Second, "reg", "query", k, "/v", "ClientID")
			if i := strings.Index(out, "ClientID"); err == nil && i >= 0 {
				if f := strings.Fields(out[i:]); len(f) >= 3 {
					if n, err := strconv.ParseInt(strings.TrimPrefix(f[2], "0x"), 16, 64); err == nil {
						c.TeamViewer = strconv.FormatInt(n, 10)
						break
					}
				}
			}
		}
	case "darwin":
		n, _ := execx.Output(ctx, 5*time.Second, "sw_vers", "-productName")
		v, _ := execx.Output(ctx, 5*time.Second, "sw_vers", "-productVersion")
		c.OS = strings.TrimSpace(strings.TrimSpace(n) + " " + strings.TrimSpace(v))
		home, _ := os.UserHomeDir()
		for _, p := range []string{"/Library/Application Support/AnyDesk/system.conf", filepath.Join(home, ".anydesk", "system.conf")} {
			if id := anyDeskID(p); id != "" {
				c.AnyDesk = id
				break
			}
		}
		if out, err := execx.Output(ctx, 5*time.Second, "defaults", "read", "/Library/Preferences/com.teamviewer.teamviewer.preferences", "ClientID"); err == nil {
			c.TeamViewer = strings.TrimSpace(out)
		}
	default:
		c.OS = runtime.GOOS
	}
	return c
}

func anyDeskID(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	if m := reAnyDesk.FindSubmatch(b); m != nil {
		return string(m[1])
	}
	return ""
}

// LocalIPs: IPv4-Adressen verbundener Adapter (ohne Loopback/Link-Local).
func LocalIPs() []string {
	var out []string
	ifs, _ := net.Interfaces()
	for _, i := range ifs {
		if i.Flags&net.FlagUp == 0 || i.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := i.Addrs()
		for _, a := range addrs {
			if n, ok := a.(*net.IPNet); ok && n.IP.To4() != nil && !n.IP.IsLinkLocalUnicast() {
				out = append(out, n.IP.String())
			}
		}
	}
	return out
}
