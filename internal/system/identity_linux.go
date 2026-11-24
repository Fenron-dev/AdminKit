//go:build linux

package system

import (
	"os"
	"strings"
)

// Identity liest DMI-Werte (Seriennummer braucht meist root).
func Identity() (DeviceIdentity, error) {
	rd := func(f string) string {
		b, _ := os.ReadFile("/sys/class/dmi/id/" + f)
		return strings.TrimSpace(string(b))
	}
	return DeviceIdentity{Manufacturer: rd("sys_vendor"), Model: rd("product_name"), Serial: cleanSerial(rd("product_serial"))}, nil
}
