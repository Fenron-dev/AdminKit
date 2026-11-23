//go:build windows

package system

import (
	"strings"

	"github.com/yusufpapurcu/wmi"
)

type wmiBIOSSerial struct{ SerialNumber string }
type wmiCompSys struct{ Manufacturer, Model string }

// Identity liest Win32_ComputerSystem (Hersteller/Modell) und Win32_BIOS
// (Seriennummer = Service-Tag bei Dell, Seriennummer bei HP/Lenovo).
func Identity() (DeviceIdentity, error) {
	var id DeviceIdentity
	var cs []wmiCompSys
	if err := wmi.Query("SELECT Manufacturer, Model FROM Win32_ComputerSystem", &cs); err == nil && len(cs) > 0 {
		id.Manufacturer, id.Model = strings.TrimSpace(cs[0].Manufacturer), strings.TrimSpace(cs[0].Model)
	}
	var b []wmiBIOSSerial
	err := wmi.Query("SELECT SerialNumber FROM Win32_BIOS", &b)
	if err == nil && len(b) > 0 {
		id.Serial = cleanSerial(b[0].SerialNumber)
	}
	return id, err
}
