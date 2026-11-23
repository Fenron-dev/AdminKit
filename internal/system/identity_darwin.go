//go:build darwin

package system

import (
	"encoding/json"
	"os/exec"
)

// Identity liest Modell und Seriennummer aus system_profiler.
func Identity() (DeviceIdentity, error) {
	id := DeviceIdentity{Manufacturer: "Apple"}
	out, err := exec.Command("system_profiler", "SPHardwareDataType", "-json").Output()
	if err != nil {
		return id, err
	}
	var data spHardware
	if err := json.Unmarshal(out, &data); err != nil {
		return id, err
	}
	if len(data.SPHardwareDataType) > 0 {
		h := data.SPHardwareDataType[0]
		id.Model = h.ModelName
		if h.ModelIdentifier != "" {
			id.Model += " (" + h.ModelIdentifier + ")"
		}
		id.Serial = cleanSerial(h.SerialNumber)
	}
	return id, nil
}
