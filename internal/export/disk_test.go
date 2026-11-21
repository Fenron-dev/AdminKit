package export

import (
	"strings"
	"testing"
	"time"
)

func TestDiskSection(t *testing.T) {
	var sb strings.Builder
	writeDiskSection(&sb, &DiskReport{Root: "/Users/x", ScannedAt: time.Date(2026, 11, 21, 10, 0, 0, 0, time.UTC), Bytes: 5 << 30, Files: 1200,
		VolumeTotal: 500 << 30, VolumeFree: 100 << 30, Unreadable: 3,
		Hotspots: []DiskRow{{Path: "/Users/x/Library/Caches", Size: 3 << 30, Category: "cache"}},
		TopFiles: []DiskRow{{Path: "/Users/x/<film>.mkv", Size: 2 << 30, Category: "user"}}})
	out := sb.String()
	for _, want := range []string{"5,0 GB", "80 %", "100,0 GB frei", "Cache / Temp", "&lt;film&gt;", "3 Ordner waren nicht lesbar", "21.11.2026"} {
		if !strings.Contains(out, want) {
			t.Errorf("fehlt %q in\n%s", want, out)
		}
	}
	if HumanBytes(1536) != "1,5 KB" || HumanBytes(10) != "10 B" {
		t.Error("HumanBytes")
	}
}
