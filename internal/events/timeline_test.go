package events

import (
	"strings"
	"testing"
)

func TestParsePSTimeline(t *testing.T) {
	one := `{"t":"2026-11-20T08:01:02.0000000Z","log":"System","src":"Microsoft-Windows-Kernel-Power","id":41,"lvl":1,"msg":"Das System wurde neu gestartet"}`
	r, err := ParsePSTimeline(one)
	if err != nil || len(r) != 1 || r[0].EventID != 41 || r[0].Time.Day() != 20 {
		t.Fatalf("%+v %v", r, err)
	}
	r, _ = ParsePSTimeline("[" + one + "," + strings.Replace(one, `"id":41`, `"id":1074`, 1) + "]")
	if len(r) != 2 || r[1].EventID != 1074 {
		t.Errorf("Liste: %+v", r)
	}
	if r, err := ParsePSTimeline(""); err != nil || r != nil {
		t.Error("leer")
	}
	if !strings.Contains(TimelineScript(7), "Id=41,6008,1074") {
		t.Error("Skript")
	}
}

func TestParseShutdownCauses(t *testing.T) {
	out := "2026-11-20 08:01:02.123 Df kernel[0:1] Previous shutdown cause: 5\n2026-11-21 09:00:00.000 Df kernel[0:1] Previous shutdown cause: 3\nrauschen\n"
	r := ParseShutdownCauses(out)
	if len(r) != 2 || r[0].Level != 4 || r[1].Level != 3 || !strings.Contains(r[1].Message, "Hart") {
		t.Errorf("%+v", r)
	}
}
