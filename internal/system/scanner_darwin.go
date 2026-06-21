//go:build darwin

package system

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Scan führt einen vollständigen System-Scan auf macOS durch.
func Scan() (*ScanResult, error) {
	result := &ScanResult{Timestamp: time.Now()}

	hw, errs := scanHardware()
	result.Hardware = hw
	result.Errors = append(result.Errors, errs...)

	osInfo, errs := scanOS()
	result.OS = osInfo
	result.Errors = append(result.Errors, errs...)

	smart, errs := scanSmart()
	result.Smart = smart
	result.Errors = append(result.Errors, errs...)

	users, errs := scanUsers()
	result.Users = users
	result.Errors = append(result.Errors, errs...)

	sec, errs := scanSecurity()
	result.Security = sec
	result.Errors = append(result.Errors, errs...)

	return result, nil
}

// ─── Hardware (system_profiler JSON) ─────────────────────────────────────────

// spHardware ist die JSON-Struktur von `system_profiler SPHardwareDataType -json`.
// HINWEIS: number_processors und packages werden NICHT als Felder deklariert, da macOS 26
// auf Apple Silicon diese als String ("proc 10:4:6") statt Integer zurückgibt und
// json.Unmarshal dann fehlschlägt. Kern-Anzahl kommt stattdessen per sysctl.
type spHardware struct {
	SPHardwareDataType []struct {
		ModelIdentifier string `json:"machine_model"`
		ModelName       string `json:"machine_name"`
		ChipType        string `json:"chip_type"`               // Apple Silicon: "Apple M4 Pro"
		CPUType         string `json:"cpu_type"`                // Intel/fallback
		CPUSpeed        string `json:"current_processor_speed"`
		PhysMemory      string `json:"physical_memory"`
		SerialNumber    string `json:"serial_number"`
		HardwareUUID    string `json:"platform_UUID"`
	} `json:"SPHardwareDataType"`
}

// spMemoryEntry deckt beide Fälle ab:
// - Apple Silicon: ein Eintrag mit SPMemoryDataType="16 GB", dimm_type="LPDDR5"
// - Intel Macs: _items[] mit individuellen DIMM-Slots
type spMemoryEntry struct {
	// Apple Silicon — Gesamt-RAM direkt als Feldwert
	TotalCapacity string `json:"SPMemoryDataType"`
	MemType       string `json:"dimm_type"`
	Manufacturer  string `json:"dimm_manufacturer"`
	// Intel Macs — individuelle DIMM-Slots
	Items []struct {
		Name     string `json:"_name"`
		Size     string `json:"dimm_size"`
		Type     string `json:"dimm_type"`
		Speed    string `json:"dimm_speed"`
		Vendor   string `json:"dimm_manufacturer"`
	} `json:"_items"`
}

type spMemory struct {
	SPMemoryDataType []spMemoryEntry `json:"SPMemoryDataType"`
}

func scanHardware() (HardwareInfo, []ScanError) {
	hw := HardwareInfo{}
	var errs []ScanError

	// CPU und allgemeine Hardware
	// sysctl-Werte sind immer zuverlässig — unabhängig vom JSON-Ergebnis
	cpuName, _ := sysctl("machdep.cpu.brand_string")
	physCores, _ := sysctlInt("hw.physicalcpu")
	logCores, _ := sysctlInt("hw.logicalcpu")
	cpuFreqHz, _ := sysctlInt64("hw.cpufrequency")
	totalBytes, _ := sysctlInt64("hw.memsize")
	hw.TotalRAMGB = math.Round(float64(totalBytes)/(1024*1024*1024)*10) / 10

	out, err := exec.Command("system_profiler", "SPHardwareDataType", "-json").Output()
	if err != nil {
		errs = append(errs, ScanError{"hardware", fmt.Sprintf("system_profiler fehlgeschlagen: %v", err)})
	} else {
		var data spHardware
		if jsonErr := json.Unmarshal(out, &data); jsonErr == nil && len(data.SPHardwareDataType) > 0 {
			d := data.SPHardwareDataType[0]

			// CPU-Name: Intel via sysctl bereits gesetzt; Apple Silicon aus JSON chip_type
			if cpuName == "" {
				cpuName = d.ChipType
			}
			if cpuName == "" {
				cpuName = d.CPUType
			}

			hw.Motherboard = MotherboardInfo{
				Manufacturer: "Apple Inc.",
				Product:      d.ModelName + " (" + d.ModelIdentifier + ")",
				SerialNumber: d.SerialNumber,
			}
		}
	}

	// Fallback: Text-Ausgabe parsen wenn CPU-Name oder Mainboard noch fehlen
	if cpuName == "" || hw.Motherboard.Product == "" {
		if txtOut, txtErr := exec.Command("system_profiler", "SPHardwareDataType").Output(); txtErr == nil {
			for _, line := range strings.Split(string(txtOut), "\n") {
				line = strings.TrimSpace(line)
				if cpuName == "" {
					for _, prefix := range []string{"Chip:", "Processor Name:", "Chip Name:"} {
						if strings.HasPrefix(line, prefix) {
							cpuName = strings.TrimSpace(strings.TrimPrefix(line, prefix))
							break
						}
					}
				}
				if hw.Motherboard.Product == "" {
					for _, prefix := range []string{"Model Name:", "Model Identifier:"} {
						if strings.HasPrefix(line, prefix) {
							hw.Motherboard.Manufacturer = "Apple Inc."
							hw.Motherboard.Product = strings.TrimSpace(strings.TrimPrefix(line, prefix))
							break
						}
					}
				}
			}
		}
	}

	arch := "x64"
	if strings.Contains(strings.ToLower(cpuName), "apple") || runtime.GOARCH == "arm64" {
		arch = "ARM64"
	}

	speedMHz := uint32(0)
	if cpuFreqHz > 0 {
		speedMHz = uint32(cpuFreqHz / 1_000_000)
	}

	hw.CPU = CPUInfo{
		Name:         strings.TrimSpace(cpuName),
		Cores:        physCores,
		Threads:      logCores,
		SpeedMHz:     speedMHz,
		Architecture: arch,
	}

	// RAM-Module
	ramOut, err := exec.Command("system_profiler", "SPMemoryDataType", "-json").Output()
	if err != nil {
		errs = append(errs, ScanError{"hardware.ram", err.Error()})
	} else {
		var ramData spMemory
		if jsonErr := json.Unmarshal(ramOut, &ramData); jsonErr == nil && len(ramData.SPMemoryDataType) > 0 {
			entry := ramData.SPMemoryDataType[0]
			if len(entry.Items) > 0 {
				// Intel Mac: klassische DIMM-Slots
				for _, slot := range entry.Items {
					if strings.ToLower(slot.Size) == "empty" {
						continue
					}
					gb := parseSize(slot.Size)
					speed := parseFreq(slot.Speed)
					hw.RAM = append(hw.RAM, RAMModule{
						CapacityGB:   gb,
						SpeedMHz:     uint32(speed),
						MemoryType:   slot.Type,
						BankLabel:    slot.Name,
						Manufacturer: slot.Vendor,
					})
				}
			} else if entry.TotalCapacity != "" {
				// Apple Silicon: Unified Memory — ein einzelner Eintrag
				gb := parseSize(entry.TotalCapacity)
				hw.RAM = append(hw.RAM, RAMModule{
					CapacityGB:   gb,
					MemoryType:   entry.MemType,
					BankLabel:    "Unified Memory",
					Manufacturer: entry.Manufacturer,
				})
			}
		}
	}

	// GPU
	hw.GPUs = scanGPU(&errs)

	// Festplatten
	hw.Disks = scanDisks(&errs)

	// Volumes (Speichernutzung)
	hw.Volumes = scanVolumes(&errs)

	// Akku-Status
	hw.Battery = scanBattery()

	return hw, errs
}

func scanBattery() *BatteryInfo {
	out, err := exec.Command("pmset", "-g", "batt").Output()
	if err != nil {
		return nil
	}
	text := string(out)

	// Suche Akku-Zeile (enthält "%" und "Battery")
	var battLine string
	for _, line := range strings.Split(text, "\n") {
		if strings.Contains(line, "%") {
			battLine = line
			break
		}
	}
	if battLine == "" {
		return nil // Kein Akku (Desktop-Mac)
	}

	b := &BatteryInfo{Present: true, RemainingMinutes: -1}

	// Ladestand: "87%"
	if idx := strings.Index(battLine, "%"); idx > 0 {
		numStr := ""
		for i := idx - 1; i >= 0 && battLine[i] >= '0' && battLine[i] <= '9'; i-- {
			numStr = string(battLine[i]) + numStr
		}
		if n, err := strconv.Atoi(numStr); err == nil {
			b.ChargePct = n
		}
	}

	// Status
	lower := strings.ToLower(battLine)
	switch {
	case strings.Contains(lower, "discharging"):
		b.Status = "Entlädt"
	case strings.Contains(lower, "finishing charge"):
		b.Status = "Lädt (fast voll)"
	case strings.Contains(lower, "charging"):
		b.Status = "Lädt"
	case strings.Contains(lower, "charged"):
		b.Status = "Voll (Netz)"
	default:
		b.Status = "Netz"
	}

	// Verbleibende Zeit: "1:42 remaining"
	if idx := strings.Index(battLine, " remaining"); idx > 0 {
		timePart := strings.TrimSpace(battLine[:idx])
		if i := strings.LastIndex(timePart, "\t"); i >= 0 {
			timePart = strings.TrimSpace(timePart[i+1:])
		}
		if i := strings.LastIndex(timePart, " "); i >= 0 {
			timePart = timePart[i+1:]
		}
		var h, m int
		if n, err := fmt.Sscanf(timePart, "%d:%d", &h, &m); n == 2 && err == nil && (h > 0 || m > 0) {
			b.RemainingMinutes = h*60 + m
		}
	}

	return b
}

// spDisplayEntry: Jeder Eintrag im Array ist direkt eine GPU (kein _items-Wrapper).
// Apple Silicon nutzt sppci_model + sppci_cores (kein separates VRAM-Feld).
type spDisplayEntry struct {
	Name       string `json:"_name"`        // z.B. "Apple M4"
	Model      string `json:"sppci_model"`  // z.B. "Apple M4"
	VRAM       string `json:"sppci_vram"`   // z.B. "8192 MB" (Intel) oder leer (Apple Silicon)
	Cores      string `json:"sppci_cores"`  // z.B. "10" (Apple Silicon GPU-Kerne)
	DeviceType string `json:"sppci_device_type"` // "spdisplays_gpu"
	Vendor     string `json:"spdisplays_vendor"`
}

type spDisplay struct {
	SPDisplaysDataType []spDisplayEntry `json:"SPDisplaysDataType"`
}

func scanGPU(errs *[]ScanError) []GPUInfo {
	var gpus []GPUInfo
	out, err := exec.Command("system_profiler", "SPDisplaysDataType", "-json").Output()
	if err != nil {
		*errs = append(*errs, ScanError{"hardware.gpu", err.Error()})
		return gpus
	}
	var data spDisplay
	if json.Unmarshal(out, &data) != nil {
		return gpus
	}
	seen := make(map[string]bool)
	for _, entry := range data.SPDisplaysDataType {
		// Nur GPU-Einträge — Displays/Monitore überspringen
		if entry.DeviceType != "" && !strings.Contains(entry.DeviceType, "gpu") {
			continue
		}
		name := entry.Model
		if name == "" {
			name = entry.Name
		}
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true

		vramGB := parseSize(entry.VRAM)
		// Apple Silicon: VRAM nicht separat ausgewiesen — Cores als Info nutzen
		gpu := GPUInfo{Name: name, VRAMGB: vramGB}
		// Cores-Zahl in den Namen einbauen wenn vorhanden (Apple Silicon)
		if entry.Cores != "" && vramGB == 0 {
			gpu.Name = name + " (" + entry.Cores + "-Core GPU)"
		}
		gpus = append(gpus, gpu)
	}
	return gpus
}

// spStorageEntry bildet einen Eintrag aus `system_profiler SPStorageDataType -json` ab.
// Jeder Eintrag ist ein APFS-Volume; physische Daten stecken in physical_drive.
type spStorageEntry struct {
	Name      string `json:"_name"`
	BSDName   string `json:"bsd_name"`
	SizeBytes uint64 `json:"size_in_bytes"`
	MountPoint string `json:"mount_point"`
	PhysicalDrive struct {
		DeviceName  string `json:"device_name"`  // z.B. "APPLE SSD AP0256Z"
		IsInternal  string `json:"is_internal_disk"` // "yes"/"no"
		MediumType  string `json:"medium_type"`  // "ssd", "rotational"
		Protocol    string `json:"protocol"`     // "Apple Fabric", "SATA", "NVMe"
		SmartStatus string `json:"smart_status"` // "Verified", "Failing"
	} `json:"physical_drive"`
}

type spStorage struct {
	SPStorageDataType []spStorageEntry `json:"SPStorageDataType"`
}

func scanDisks(errs *[]ScanError) []DiskInfo {
	var disks []DiskInfo
	out, err := exec.Command("system_profiler", "SPStorageDataType", "-json").Output()
	if err != nil {
		*errs = append(*errs, ScanError{"hardware.disks", err.Error()})
		return disks
	}
	var data spStorage
	if json.Unmarshal(out, &data) != nil {
		return disks
	}

	// Deduplizieren nach physischem Gerät (viele APFS-Volumes zeigen auf dieselbe SSD)
	seen := make(map[string]bool)
	for _, vol := range data.SPStorageDataType {
		pd := vol.PhysicalDrive
		// Externe Disk Images und nicht-interne Geräte überspringen
		if pd.IsInternal != "yes" {
			continue
		}
		devName := pd.DeviceName
		if devName == "" {
			devName = vol.Name
		}
		if seen[devName] || vol.SizeBytes == 0 {
			continue
		}
		seen[devName] = true

		mediaType := "HDD"
		med := strings.ToLower(pd.MediumType)
		proto := strings.ToLower(pd.Protocol)
		switch {
		case strings.Contains(proto, "nvme") || strings.Contains(proto, "apple fabric"):
			mediaType = "NVMe"
		case med == "ssd" || strings.Contains(proto, "ssd"):
			mediaType = "SSD"
		case med == "rotational":
			mediaType = "HDD"
		}

		disks = append(disks, DiskInfo{
			Model:         devName,
			SizeGB:        math.Round(float64(vol.SizeBytes)/(1024*1024*1024)*10) / 10,
			MediaType:     mediaType,
			InterfaceType: pd.Protocol,
		})
	}
	return disks
}

// scanVolumes liest die Speichernutzung aller gemounteten Volumes via `df -kP`.
// Systemvolumes, Simulator-Images und UUID-benannte Disk-Images werden gefiltert.
func scanVolumes(errs *[]ScanError) []VolumeInfo {
	var vols []VolumeInfo
	out, err := exec.Command("df", "-kP").Output()
	if err != nil {
		*errs = append(*errs, ScanError{"hardware.volumes", err.Error()})
		return vols
	}

	skipPrefixes := []string{
		"/System/Volumes/",
		"/private/var/",
		"/private/tmp",
		"/.vol",
		"/Library/", // CoreSimulator und andere Developer-Disk-Images
	}

	lines := strings.Split(string(out), "\n")
	for _, line := range lines[1:] { // Header überspringen
		fields := strings.Fields(line)
		if len(fields) < 6 {
			continue
		}
		dev := fields[0]
		if !strings.HasPrefix(dev, "/dev/") {
			continue
		}

		totalKB, _ := strconv.ParseInt(fields[1], 10, 64)
		availKB, _ := strconv.ParseInt(fields[3], 10, 64)
		mp := strings.Join(fields[5:], " ")

		if totalKB == 0 {
			continue
		}

		skip := false
		for _, pfx := range skipPrefixes {
			if strings.HasPrefix(mp, pfx) {
				skip = true
				break
			}
		}
		if skip {
			continue
		}

		// UUID-benannte Volumes (z.B. iOS-Simulator-Laufwerke) überspringen
		parts := strings.Split(mp, "/")
		if isUUIDString(parts[len(parts)-1]) {
			continue
		}

		label := mp
		if mp == "/" {
			label = "Macintosh HD"
		}

		// APFS-Besonderheit: df "Used" zeigt nur das jeweilige Volume-Fragment,
		// nicht den tatsächlich belegten Container-Speicher. Korrekte Berechnung:
		usedKB := totalKB - availKB

		vols = append(vols, VolumeInfo{
			Letter:     label,
			MountPoint: mp,
			TotalGB:    math.Round(float64(totalKB)/1024/1024*10) / 10,
			UsedGB:     math.Round(float64(usedKB)/1024/1024*10) / 10,
			FreeGB:     math.Round(float64(availKB)/1024/1024*10) / 10,
			FileSystem: "APFS",
		})
	}
	return vols
}

// isUUIDString prüft ob ein String einem UUID-Format entspricht (8-4-4-4-12 Hex-Zeichen).
func isUUIDString(s string) bool {
	if len(s) != 36 {
		return false
	}
	dashes := []int{8, 13, 18, 23}
	di := 0
	for i := 0; i < 36; i++ {
		if di < len(dashes) && i == dashes[di] {
			if s[i] != '-' {
				return false
			}
			di++
			continue
		}
		c := s[i]
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

// ─── Betriebssystem ───────────────────────────────────────────────────────────

func scanOS() (OSInfo, []ScanError) {
	info := OSInfo{Architecture: "ARM64"}
	var errs []ScanError

	// sw_vers gibt macOS-Version zurück
	prodName, err := execOutput("sw_vers", "-productName")
	if err != nil {
		errs = append(errs, ScanError{"os", err.Error()})
		return info, errs
	}
	prodVersion, _ := execOutput("sw_vers", "-productVersion")
	buildVersion, _ := execOutput("sw_vers", "-buildVersion")

	// Architektur
	arch, _ := execOutput("uname", "-m")
	if strings.Contains(arch, "x86_64") {
		info.Architecture = "x64"
	}

	info.Name = strings.TrimSpace(prodName)
	info.Version = strings.TrimSpace(prodVersion)
	info.Build = strings.TrimSpace(buildVersion)

	if h, hErr := execOutput("hostname"); hErr == nil {
		info.Hostname = strings.TrimSpace(h)
	}
	info.LicenseStatus = "Licensed" // macOS ist immer lizenziert wenn macOS läuft

	// Seriennummer aus system_profiler SPHardwareDataType
	if hwOut, hwErr := exec.Command("system_profiler", "SPHardwareDataType", "-json").Output(); hwErr == nil {
		var data spHardware
		if json.Unmarshal(hwOut, &data) == nil && len(data.SPHardwareDataType) > 0 {
			info.SerialNumber = data.SPHardwareDataType[0].SerialNumber
		}
	}

	// Installations-Datum: Erstellungsdatum von /private/var/db/.AppleSetupDone
	setupFile := "/private/var/db/.AppleSetupDone"
	if fi, statErr := os.Stat(setupFile); statErr == nil {
		info.InstallDate = fi.ModTime()
	}

	// Boot-Zeit via sysctl
	bootSeconds, bootErr := sysctlInt64("kern.boottime")
	if bootErr == nil && bootSeconds > 0 {
		info.LastBootTime = time.Unix(bootSeconds, 0)
	}

	// Letztes Software-Update: Datum aus /Library/Receipts/InstallHistory.plist
	histOut, err := exec.Command("plutil", "-convert", "json", "-o", "-",
		"/Library/Receipts/InstallHistory.plist").Output()
	if err == nil {
		var hist []struct {
			Date string `json:"date"`
		}
		if json.Unmarshal(histOut, &hist) == nil && len(hist) > 0 {
			// Letzter Eintrag ist neuestes Update
			last := hist[len(hist)-1]
			t, parseErr := time.Parse("2006-01-02 15:04:05 -0700", last.Date)
			if parseErr == nil {
				info.LastUpdateDate = t
			}
		}
	}
	info.PendingUpdates = -1 // nicht via CLI ermittelbar ohne Systemrechte

	return info, errs
}

// ─── SMART ────────────────────────────────────────────────────────────────────

// scanSmart liest SMART-Status aus system_profiler SPStorageDataType.
// Das spart einen zweiten diskutil-Aufruf und nutzt die bereits vorhandenen Daten.
func scanSmart() ([]DiskSmart, []ScanError) {
	var results []DiskSmart
	var errs []ScanError

	out, err := exec.Command("system_profiler", "SPStorageDataType", "-json").Output()
	if err != nil {
		errs = append(errs, ScanError{"smart", err.Error()})
		return results, errs
	}
	var data spStorage
	if json.Unmarshal(out, &data) != nil {
		return results, errs
	}

	seen := make(map[string]bool)
	for _, vol := range data.SPStorageDataType {
		pd := vol.PhysicalDrive
		if pd.IsInternal != "yes" || pd.SmartStatus == "" {
			continue
		}
		devName := pd.DeviceName
		if devName == "" {
			devName = vol.Name
		}
		if seen[devName] {
			continue
		}
		seen[devName] = true

		status := SmartUnknown
		switch strings.ToLower(pd.SmartStatus) {
		case "verified", "not supported": // Apple Silicon NVMe-Chips melden "Not Supported"
			status = SmartOK
		case "failing", "failed":
			status = SmartCritical
		case "about to fail":
			status = SmartWarning
		}

		results = append(results, DiskSmart{
			Model:           devName,
			Status:          status,
			LifeLeftPercent: -1, // erfordert IOKit — nicht via CLI verfügbar
		})
	}
	return results, errs
}

// ─── Benutzer ─────────────────────────────────────────────────────────────────

func scanUsers() ([]UserInfo, []ScanError) {
	var users []UserInfo
	var errs []ScanError

	// dscl . -list /Users filtert System-Benutzer raus
	out, err := exec.Command("dscl", ".", "-list", "/Users").Output()
	if err != nil {
		errs = append(errs, ScanError{"users", err.Error()})
		return users, errs
	}

	for _, name := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		name = strings.TrimSpace(name)
		if name == "" || strings.HasPrefix(name, "_") || name == "nobody" || name == "root" {
			continue
		}
		info := UserInfo{Name: name, IsEnabled: true}

		// Vollständiger Name
		fn, _ := execOutput("dscl", ".", "-read", "/Users/"+name, "RealName")
		if idx := strings.Index(fn, "RealName:"); idx >= 0 {
			info.FullName = strings.TrimSpace(fn[idx+9:])
		}

		// Admin-Status: prüfe ob in admin-Gruppe
		groupOut, _ := exec.Command("dscl", ".", "-read", "/Groups/admin", "GroupMembership").Output()
		info.IsAdmin = strings.Contains(string(groupOut), name)

		users = append(users, info)
	}

	return users, errs
}

// ─── Sicherheit ───────────────────────────────────────────────────────────────

func scanSecurity() (SecurityInfo, []ScanError) {
	info := SecurityInfo{}
	var errs []ScanError

	// FileVault-Status (BitLocker-Äquivalent auf macOS)
	fvOut, err := exec.Command("fdesetup", "status").Output()
	if err != nil {
		errs = append(errs, ScanError{"security.filevault", err.Error()})
	} else {
		fvEnabled := strings.Contains(strings.ToLower(string(fvOut)), "on")
		info.BitLockerVolumes = []BitLockerVolume{{
			Drive:     "Macintosh HD",
			Encrypted: fvEnabled,
			Status:    strings.TrimSpace(string(fvOut)),
		}}
	}

	info.Platform = "darwin"

	// Firewall: socketfilterfw ist die zuverlässige Methode auf modernem macOS
	fwOut, err := exec.Command(
		"/usr/libexec/ApplicationFirewall/socketfilterfw", "--getglobalstate").Output()
	if err == nil {
		lower := strings.ToLower(string(fwOut))
		// Output: "Firewall is enabled. (State = 1)" oder "Firewall is disabled. (State = 0)"
		info.FirewallEnabled = strings.Contains(lower, "enabled")
		info.FirewallKnown = true
	} else {
		// Fallback: Plist direkt lesen (ältere macOS-Versionen)
		fwOut2, err2 := exec.Command("defaults", "read",
			"/Library/Preferences/com.apple.alf", "globalstate").Output()
		if err2 == nil {
			info.FirewallEnabled = strings.TrimSpace(string(fwOut2)) != "0"
			info.FirewallKnown = true
		} else {
			errs = append(errs, ScanError{"security.firewall", "Firewall-Status nicht ermittelbar"})
		}
	}

	// XProtect / Gatekeeper als Defender-Äquivalent
	info.DefenderEnabled = true // Gatekeeper ist auf modernen Macs immer aktiv
	info.DefenderVersion = "XProtect / Gatekeeper"

	// SIP-Status (System Integrity Protection)
	sipOut, err := exec.Command("csrutil", "status").Output()
	if err == nil {
		sipText := strings.ToLower(strings.TrimSpace(string(sipOut)))
		enabled := strings.Contains(sipText, "enabled")
		info.SIPEnabled = &enabled
		info.SIPKnown = true
	}

	// Remote Login (SSH) als RDP-Äquivalent
	sshOut, err := exec.Command("systemsetup", "-getremotelogin").Output()
	if err == nil {
		info.RDPEnabled = strings.Contains(strings.ToLower(string(sshOut)), "on")
		info.RDPPort = 22
	}

	// Lokale Freigaben (AFP/SMB)
	sharesOut, err := exec.Command("sharing", "-l").Output()
	if err == nil {
		lines := strings.Split(string(sharesOut), "\n")
		var currentName string
		for _, line := range lines {
			if strings.HasPrefix(line, "name:") {
				currentName = strings.TrimSpace(strings.TrimPrefix(line, "name:"))
			} else if strings.HasPrefix(line, "path:") && currentName != "" {
				path := strings.TrimSpace(strings.TrimPrefix(line, "path:"))
				info.LocalShares = append(info.LocalShares, LocalShare{
					Name:     currentName,
					Path:     path,
					IsSystem: false,
				})
				currentName = ""
			}
		}
	}

	return info, errs
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

func sysctl(key string) (string, error) {
	out, err := exec.Command("sysctl", "-n", key).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func sysctlInt(key string) (int, error) {
	s, err := sysctl(key)
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(s)
}

func sysctlInt64(key string) (int64, error) {
	s, err := sysctl(key)
	if err != nil {
		return 0, err
	}
	// kern.boottime gibt "{sec = 1234567890, usec = 0} ..." zurück
	if strings.Contains(s, "sec =") {
		fields := strings.Fields(s)
		for i, f := range fields {
			if f == "=" && i > 0 && fields[i-1] == "sec" {
				if i+1 < len(fields) {
					val := strings.TrimSuffix(fields[i+1], ",")
					return strconv.ParseInt(val, 10, 64)
				}
			}
		}
		return 0, fmt.Errorf("konnte sec nicht parsen: %s", s)
	}
	return strconv.ParseInt(s, 10, 64)
}

func execOutput(name string, args ...string) (string, error) {
	out, err := exec.Command(name, args...).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}


// parseSize parst "16 GB", "512 MB" etc. und gibt GB zurück.
func parseSize(s string) float64 {
	s = strings.TrimSpace(s)
	parts := strings.Fields(s)
	if len(parts) < 2 {
		return 0
	}
	val, err := strconv.ParseFloat(parts[0], 64)
	if err != nil {
		return 0
	}
	switch strings.ToUpper(parts[1]) {
	case "TB":
		return math.Round(val*1024*10) / 10
	case "GB":
		return math.Round(val*10) / 10
	case "MB":
		return math.Round(val/1024*100) / 100
	}
	return val
}

// parseFreq parst "3200 MHz" und gibt den Integer-Wert zurück.
func parseFreq(s string) int {
	parts := strings.Fields(s)
	if len(parts) == 0 {
		return 0
	}
	val, _ := strconv.Atoi(strings.TrimRight(parts[0], ",."))
	return val
}

// ─── Prozess-Scanner ─────────────────────────────────────────────────────────

// ScanProcesses gibt alle laufenden Prozesse zurück (via ps).
func ScanProcesses() ([]RunningProcess, error) {
	// args= gibt den vollen Befehlsaufruf zurück (erster Token = Pfad/Name)
	out, err := exec.Command("ps", "-axwwo", "pid=,user=,pcpu=,rss=,args=").Output()
	if err != nil {
		return nil, fmt.Errorf("ps fehlgeschlagen: %w", err)
	}

	systemUsers := map[string]bool{
		"root": true, "_windowserver": true, "_mdnsresponder": true,
		"_netbios": true, "_spotlight": true, "_locationd": true,
		"_coreaudiod": true, "_distnoted": true, "_softwareupdate": true,
		"_usbmuxd": true, "_appleevents": true, "_driverkit": true,
	}

	var procs []RunningProcess
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}
		pid, _ := strconv.Atoi(fields[0])
		user := fields[1]
		cpu, _ := strconv.ParseFloat(fields[2], 64)
		rssKB, _ := strconv.ParseFloat(fields[3], 64)

		// Erster Token von args ist der Ausführungspfad (oder Kernel-Thread-Name)
		execArg := fields[4]
		var name, path string
		if strings.HasPrefix(execArg, "/") {
			path = execArg
			name = filepath.Base(execArg)
		} else {
			// Kernel-Threads oder kurze Namen ohne Pfad
			name = strings.TrimPrefix(execArg, "(")
			name = strings.TrimSuffix(name, ")")
		}

		procs = append(procs, RunningProcess{
			PID:      pid,
			Name:     name,
			Path:     path,
			User:     user,
			CPUPct:   cpu,
			MemoryMB: rssKB / 1024,
			IsSystem: systemUsers[strings.ToLower(user)],
		})
	}
	return procs, nil
}
