package system

import "testing"

func TestApplyReliabilityNVMe(t *testing.T) {
	out := []byte(`{"FriendlyName":"Samsung SSD 980 PRO 1TB","SerialNumber":"S5GXNX0R123456A.","HealthStatus":"Healthy","Temperature":41,"Wear":3,"PowerOnHours":1234}`)
	rows, err := parseReliability(out)
	if err != nil || len(rows) != 1 {
		t.Fatalf("parse: %v %d", err, len(rows))
	}
	disks := []DiskSmart{{Model: "Samsung SSD 980 PRO 1TB", SerialNumber: "S5GXNX0R123456A", Status: SmartUnknown, LifeLeftPercent: -1}}
	if applyReliability(disks, rows) != 1 {
		t.Fatal("kein Treffer")
	}
	d := disks[0]
	if d.TemperatureC != 41 || d.PowerOnHours != 1234 || d.LifeLeftPercent != 97 || d.Status != SmartOK {
		t.Errorf("unerwartet: %+v", d)
	}
}

func TestApplyReliabilityUnhealthyNumeric(t *testing.T) {
	rows, _ := parseReliability([]byte(`[{"FriendlyName":"WDC HDD","SerialNumber":"","HealthStatus":2}]`))
	disks := []DiskSmart{{Model: "WDC HDD", Status: SmartOK, LifeLeftPercent: -1}}
	applyReliability(disks, rows)
	if disks[0].Status != SmartCritical {
		t.Errorf("Status %v", disks[0].Status)
	}
}
