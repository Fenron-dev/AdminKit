//go:build darwin

package system

import (
	"encoding/json"
	"fmt"
	"math"
	"os/exec"
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
type spHardware struct {
	SPHardwareDataType []struct {
		ModelIdentifier   string `json:"machine_model"`
		ModelName         string `json:"machine_name"`
		CPUType           string `json:"cpu_type"`
		CPUSpeed          string `json:"current_processor_speed"`
		NumCPUs           int    `json:"number_processors"`
		NumCores          int    `json:"packages"` // system_profiler nennt es "packages" manchmal
		PhysMemory        string `json:"physical_memory"`
		SerialNumber      string `json:"serial_number"`
		HardwareUUID      string `json:"platform_UUID"`
		ProcessorName     string `json:"cpu_type"`
		CoreCount         string `json:"number_processors"`
	} `json:"SPHardwareDataType"`
}

type spMemory struct {
	SPMemoryDataType []struct {
		Items []struct {
			Name     string `json:"_name"`
			Size     string `json:"dimm_size"`
			Type     string `json:"dimm_type"`
			Speed    string `json:"dimm_speed"`
			Status   string `json:"dimm_status"`
			Vendor   string `json:"dimm_manufacturer"`
		} `json:"_items"`
	} `json:"SPMemoryDataType"`
}

func scanHardware() (HardwareInfo, []ScanError) {
	hw := HardwareInfo{}
	var errs []ScanError

	// CPU und allgemeine Hardware
	out, err := exec.Command("system_profiler", "SPHardwareDataType", "-json").Output()
	if err != nil {
		errs = append(errs, ScanError{"hardware", fmt.Sprintf("system_profiler fehlgeschlagen: %v", err)})
	} else {
		var data spHardware
		if jsonErr := json.Unmarshal(out, &data); jsonErr == nil && len(data.SPHardwareDataType) > 0 {
			d := data.SPHardwareDataType[0]

			// CPU via sysctl für präzisere Werte
			cpuName, _ := sysctl("machdep.cpu.brand_string")
			physCores, _ := sysctlInt("hw.physicalcpu")
			logCores, _ := sysctlInt("hw.logicalcpu")
			cpuFreqHz, _ := sysctlInt64("hw.cpufrequency")

			if cpuName == "" {
				cpuName = d.CPUType
			}

			arch := "x64"
			if strings.Contains(strings.ToLower(cpuName), "apple") {
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

			// Modell als Mainboard-Info
			hw.Motherboard = MotherboardInfo{
				Manufacturer: "Apple Inc.",
				Product:      d.ModelName + " (" + d.ModelIdentifier + ")",
				SerialNumber: d.SerialNumber,
			}

			// Gesamter RAM via sysctl
			totalBytes, _ := sysctlInt64("hw.memsize")
			hw.TotalRAMGB = math.Round(float64(totalBytes)/(1024*1024*1024)*10) / 10
		}
	}

	// RAM-Module
	ramOut, err := exec.Command("system_profiler", "SPMemoryDataType", "-json").Output()
	if err != nil {
		errs = append(errs, ScanError{"hardware.ram", err.Error()})
	} else {
		var ramData spMemory
		if jsonErr := json.Unmarshal(ramOut, &ramData); jsonErr == nil && len(ramData.SPMemoryDataType) > 0 {
			for _, slot := range ramData.SPMemoryDataType[0].Items {
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
		}
	}

	// GPU
	hw.GPUs = scanGPU(&errs)

	// Festplatten
	hw.Disks = scanDisks(&errs)

	return hw, errs
}

type spDisplay struct {
	SPDisplaysDataType []struct {
		Items []struct {
			Name   string `json:"sppci_model"`
			VRAM   string `json:"sppci_vram"`
			Vendor string `json:"sppci_vendor"`
		} `json:"_items"`
	} `json:"SPDisplaysDataType"`
}

func scanGPU(errs *[]ScanError) []GPUInfo {
	var gpus []GPUInfo
	out, err := exec.Command("system_profiler", "SPDisplaysDataType", "-json").Output()
	if err != nil {
		*errs = append(*errs, ScanError{"hardware.gpu", err.Error()})
		return gpus
	}
	var data spDisplay
	if json.Unmarshal(out, &data) == nil && len(data.SPDisplaysDataType) > 0 {
		for _, item := range data.SPDisplaysDataType[0].Items {
			if item.Name == "" {
				continue
			}
			vramGB := parseSize(item.VRAM)
			gpus = append(gpus, GPUInfo{
				Name:   item.Name,
				VRAMGB: vramGB,
			})
		}
	}
	return gpus
}

type spStorage struct {
	SPStorageDataType []struct {
		Name      string `json:"_name"`
		BSDName   string `json:"bsd_name"`
		MediaType string `json:"spstorage_media_type"`
		SizeBytes uint64 `json:"spstorage_volume_size_in_bytes"`
	} `json:"SPStorageDataType"`
}

func scanDisks(errs *[]ScanError) []DiskInfo {
	var disks []DiskInfo
	out, err := exec.Command("system_profiler", "SPNVMeDataType", "SPStorageDataType", "-json").Output()
	if err != nil {
		*errs = append(*errs, ScanError{"hardware.disks", err.Error()})
		return disks
	}
	var data spStorage
	if json.Unmarshal(out, &data) != nil {
		return disks
	}
	seen := make(map[string]bool)
	for _, d := range data.SPStorageDataType {
		if seen[d.Name] || d.SizeBytes == 0 {
			continue
		}
		seen[d.Name] = true
		mediaType := "HDD"
		if strings.Contains(strings.ToLower(d.MediaType), "solid") || strings.Contains(strings.ToLower(d.BSDName), "nvme") {
			mediaType = "NVMe"
		} else if strings.Contains(strings.ToLower(d.MediaType), "ssd") {
			mediaType = "SSD"
		}
		sizeGB := math.Round(float64(d.SizeBytes)/(1024*1024*1024)*10) / 10
		disks = append(disks, DiskInfo{
			Model:     d.Name,
			SizeGB:    sizeGB,
			MediaType: mediaType,
		})
	}
	return disks
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

	info.Name = strings.TrimSpace(prodName) + " " + strings.TrimSpace(prodVersion)
	info.Version = strings.TrimSpace(prodVersion)
	info.Build = strings.TrimSpace(buildVersion)
	info.LicenseStatus = "Licensed" // macOS ist immer lizenziert wenn macOS läuft

	// Boot-Zeit via sysctl
	bootSeconds, err2 := sysctlInt64("kern.boottime")
	if err2 == nil && bootSeconds > 0 {
		info.LastBootTime = time.Unix(bootSeconds, 0)
	}

	return info, errs
}

// ─── SMART ────────────────────────────────────────────────────────────────────

func scanSmart() ([]DiskSmart, []ScanError) {
	var results []DiskSmart
	var errs []ScanError

	// diskutil list -plist für alle Disks
	out, err := exec.Command("diskutil", "list", "-plist").Output()
	if err != nil {
		errs = append(errs, ScanError{"smart", err.Error()})
		return results, errs
	}

	// Parsen mit einfachem String-Matching (vollständiges plist-Parsing wäre aufwändiger)
	diskLines := extractPlistStrings(string(out), "DeviceIdentifier")
	for _, disk := range diskLines {
		if strings.Contains(disk, "s") {
			continue // Partitionen überspringen, nur ganze Disks (disk0, disk1, …)
		}
		info, err2 := exec.Command("diskutil", "info", "-plist", "/dev/"+disk).Output()
		if err2 != nil {
			continue
		}
		model := extractPlistValue(string(info), "MediaName")
		if model == "" {
			model = disk
		}
		// macOS gibt SMART-Status direkt aus
		smartStatus := extractPlistValue(string(info), "SMARTStatus")
		status := SmartUnknown
		switch strings.ToLower(smartStatus) {
		case "verified":
			status = SmartOK
		case "failing":
			status = SmartCritical
		case "about to fail":
			status = SmartWarning
		}
		sizeStr := extractPlistValue(string(info), "TotalSize")
		sizeBytes, _ := strconv.ParseUint(sizeStr, 10, 64)
		sizeGB := math.Round(float64(sizeBytes)/(1024*1024*1024)*10) / 10

		results = append(results, DiskSmart{
			Model:           model,
			Status:          status,
			LifeLeftPercent: -1, // erfordert IOKit-Zugriff
		})
		_ = sizeGB // wird in DiskInfo verwendet, nicht hier
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

	// Firewall
	fwOut, err := exec.Command("defaults", "read",
		"/Library/Preferences/com.apple.alf", "globalstate").Output()
	if err == nil {
		val := strings.TrimSpace(string(fwOut))
		info.FirewallEnabled = val != "0"
	}

	// XProtect / Gatekeeper als Defender-Äquivalent
	info.DefenderEnabled = true // Gatekeeper ist auf modernen Macs immer aktiv
	info.DefenderVersion = "XProtect / Gatekeeper"

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

// extractPlistValue liest einen Wert aus einem einfachen plist-String.
func extractPlistValue(plist, key string) string {
	marker := "<key>" + key + "</key>"
	idx := strings.Index(plist, marker)
	if idx < 0 {
		return ""
	}
	rest := plist[idx+len(marker):]
	start := strings.Index(rest, "<string>")
	intStart := strings.Index(rest, "<integer>")
	if start < 0 && intStart < 0 {
		return ""
	}
	if intStart >= 0 && (start < 0 || intStart < start) {
		end := strings.Index(rest[intStart:], "</integer>")
		if end < 0 {
			return ""
		}
		return rest[intStart+9 : intStart+end]
	}
	end := strings.Index(rest[start:], "</string>")
	if end < 0 {
		return ""
	}
	return rest[start+8 : start+end]
}

// extractPlistStrings liest alle Werte eines Keys aus einer plist-Liste.
func extractPlistStrings(plist, key string) []string {
	var results []string
	marker := "<key>" + key + "</key>"
	rest := plist
	for {
		idx := strings.Index(rest, marker)
		if idx < 0 {
			break
		}
		rest = rest[idx+len(marker):]
		start := strings.Index(rest, "<string>")
		if start < 0 {
			break
		}
		end := strings.Index(rest[start:], "</string>")
		if end < 0 {
			break
		}
		results = append(results, rest[start+8:start+end])
		rest = rest[start+end:]
	}
	return results
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
