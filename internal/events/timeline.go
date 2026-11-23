package events

// Zeitleiste „Was ist passiert?“ (#123): gezielt die aussagekräftigen Ereignisse
// der letzten Tage – auch Informations-Ereignisse wie 1074 (wer hat neu gestartet).

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"adminkit/internal/cmdrun"
	"adminkit/internal/execx"
)

// TimelineEntry ist ein Ereignis der Zeitleiste.
type TimelineEntry struct {
	Time    time.Time `json:"time"`
	Log     string    `json:"log"`
	Source  string    `json:"source"`
	EventID int       `json:"event_id"`
	Level   int       `json:"level"` // 1 kritisch, 2 Fehler, 3 Warnung, 4 Info
	Message string    `json:"message"`
}

// SystemIDs/AppIDs: Ereignisse, die für „Was ist passiert?“ zählen (siehe Fehlercodes-Daten).
var (
	SystemIDs = []int{41, 6008, 1074, 1001, 7000, 7001, 7009, 7031, 7034, 20, 7, 51, 153, 129, 55, 98, 17, 18, 19, 4101, 1014, 4199, 219}
	AppIDs    = []int{1000, 1002, 1026}
)

func joinInts(a []int) string {
	s := make([]string, len(a))
	for i, v := range a {
		s[i] = strconv.Itoa(v)
	}
	return strings.Join(s, ",")
}

// TimelineScript baut das PowerShell-Skript (exportiert für Tests).
func TimelineScript(days int) string {
	return fmt.Sprintf(`$s=(Get-Date).AddDays(-%d)
$a=@(Get-WinEvent -FilterHashtable @{LogName='System';Id=%s;StartTime=$s} -MaxEvents 500 -ErrorAction SilentlyContinue)
$b=@(Get-WinEvent -FilterHashtable @{LogName='Application';Id=%s;StartTime=$s} -MaxEvents 300 -ErrorAction SilentlyContinue)
@($a+$b) | Select-Object @{n='t';e={$_.TimeCreated.ToUniversalTime().ToString('o')}},@{n='log';e={$_.LogName}},@{n='src';e={$_.ProviderName}},@{n='id';e={$_.Id}},@{n='lvl';e={[int]$_.Level}},@{n='msg';e={(($_.Message -split "`+"`"+`r?`+"`"+`n") | Where-Object { $_ } | Select-Object -First 4) -join ' '}} | ConvertTo-Json -Compress`,
		days, joinInts(SystemIDs), joinInts(AppIDs))
}

type psEntry struct {
	T   string `json:"t"`
	Log string `json:"log"`
	Src string `json:"src"`
	ID  int    `json:"id"`
	Lvl int    `json:"lvl"`
	Msg string `json:"msg"`
}

// ParsePSTimeline liest die JSON-Ausgabe (Objekt oder Liste).
func ParsePSTimeline(out string) ([]TimelineEntry, error) {
	out = strings.TrimSpace(out)
	if out == "" {
		return nil, nil
	}
	var list []psEntry
	if strings.HasPrefix(out, "{") {
		var one psEntry
		if err := json.Unmarshal([]byte(out), &one); err != nil {
			return nil, err
		}
		list = []psEntry{one}
	} else if err := json.Unmarshal([]byte(out), &list); err != nil {
		return nil, err
	}
	res := make([]TimelineEntry, 0, len(list))
	for _, e := range list {
		t, _ := time.Parse(time.RFC3339Nano, e.T)
		msg := e.Msg
		if len(msg) > 600 {
			msg = msg[:600] + " …"
		}
		res = append(res, TimelineEntry{Time: t, Log: e.Log, Source: e.Src, EventID: e.ID, Level: e.Lvl, Message: msg})
	}
	return res, nil
}

var reShutdown = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\S*\s.*Previous shutdown cause:\s*(-?\d+)`)

// ParseShutdownCauses liest „Previous shutdown cause“ aus `log show` (macOS).
func ParseShutdownCauses(out string) []TimelineEntry {
	var res []TimelineEntry
	for _, l := range strings.Split(out, "\n") {
		m := reShutdown.FindStringSubmatch(l)
		if m == nil {
			continue
		}
		t, _ := time.ParseInLocation("2006-01-02 15:04:05", m[1], time.Local)
		code, _ := strconv.Atoi(m[2])
		lvl, msg := 3, "Letztes Herunterfahren nicht normal (Code "+m[2]+")"
		switch code {
		case 5:
			lvl, msg = 4, "Normal heruntergefahren"
		case 3:
			msg = "Hart ausgeschaltet (Ein-/Ausschalter gedrückt gehalten) oder Absturz"
		case 0:
			msg = "Stromausfall bzw. Akku leer"
		case -3, -60:
			msg = "Notabschaltung (z. B. Überhitzung) – Code " + m[2]
		}
		res = append(res, TimelineEntry{Time: t, Log: "Unified Log", Source: "Shutdown", EventID: code, Level: lvl, Message: msg})
	}
	return res
}

// Timeline liefert die Ereignisse der letzten `days` Tage (neueste zuerst).
func Timeline(ctx context.Context, days int) ([]TimelineEntry, error) {
	if days < 1 || days > 60 {
		days = 7
	}
	var res []TimelineEntry
	switch runtime.GOOS {
	case "windows":
		r := cmdrun.Run(ctx, cmdrun.Request{Command: TimelineScript(days), Shell: "powershell", TimeoutSec: 120})
		if r.Error != "" {
			return nil, fmt.Errorf("%s", r.Error)
		}
		list, err := ParsePSTimeline(r.Output)
		if err != nil {
			return nil, fmt.Errorf("Ereignisse nicht lesbar: %w", err)
		}
		res = list
	case "darwin":
		from := time.Now().AddDate(0, 0, -days)
		for _, c := range GetCrashReports(from, time.Now()) {
			lvl, src := 2, "Absturz"
			if strings.Contains(strings.ToLower(c.Path), "panic") {
				lvl, src = 1, "Kernel-Panic"
			}
			res = append(res, TimelineEntry{Time: c.Timestamp, Log: "DiagnosticReports", Source: src, Level: lvl, Message: strings.TrimSpace(c.AppName + ": " + c.Summary)})
		}
		out, _ := execx.Output(ctx, 90*time.Second, "log", "show", "--style", "compact", "--last", strconv.Itoa(days)+"d", "--predicate", `eventMessage CONTAINS "Previous shutdown cause"`)
		res = append(res, ParseShutdownCauses(out)...)
	default:
		return nil, fmt.Errorf("auf diesem System nicht unterstützt")
	}
	sort.Slice(res, func(i, j int) bool { return res[i].Time.After(res[j].Time) })
	return res, nil
}
