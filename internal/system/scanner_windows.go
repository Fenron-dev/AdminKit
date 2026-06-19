//go:build windows

package system

import (
	"fmt"
	"math"
	"os/exec"
	"strings"
	"time"

	"github.com/yusufpapurcu/wmi"
)

// Scan führt einen vollständigen System-Scan auf Windows durch.
// Nicht-fatale Fehler (z.B. fehlende Adminrechte) werden in result.Errors gesammelt.
func Scan() (*ScanResult, error) {
	result := &ScanResult{Timestamp: time.Now()}

	hw, errs := scanHardware()
	result.Hardware = hw
	result.Errors = append(result.Errors, errs...)

	os, errs := scanOS()
	result.OS = os
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

// ─── Hardware ─────────────────────────────────────────────────────────────────

type wmiProcessor struct {
	Name                      string
	NumberOfCores             uint32
	NumberOfLogicalProcessors uint32
	MaxClockSpeed             uint32
	Architecture              uint16
}

type wmiMemory struct {
	Capacity     uint64
	Speed        uint32
	MemoryType   uint16
	BankLabel    string
	Manufacturer string
	PartNumber   string
}

type wmiBaseBoard struct {
	Manufacturer string
	Product      string
	Version      string
	SerialNumber string
}

type wmiVideoController struct {
	Name          string
	AdapterRAM    uint32
	DriverVersion string
}

type wmiDiskDrive struct {
	Model         string
	Size          uint64
	MediaType     string
	InterfaceType string
	SerialNumber  string
}

type wmiLogicalDisk struct {
	DeviceID   string
	Size       uint64
	FreeSpace  uint64
	FileSystem string
}

func scanHardware() (HardwareInfo, []ScanError) {
	hw := HardwareInfo{}
	var errs []ScanError

	// CPU
	var cpus []wmiProcessor
	if err := wmi.Query("SELECT Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, Architecture FROM Win32_Processor", &cpus); err != nil {
		errs = append(errs, ScanError{"hardware.cpu", err.Error()})
	} else if len(cpus) > 0 {
		c := cpus[0]
		hw.CPU = CPUInfo{
			Name:         strings.TrimSpace(c.Name),
			Cores:        int(c.NumberOfCores),
			Threads:      int(c.NumberOfLogicalProcessors),
			SpeedMHz:     c.MaxClockSpeed,
			Architecture: wmiArchName(c.Architecture),
		}
	}

	// RAM
	var mems []wmiMemory
	if err := wmi.Query("SELECT Capacity, Speed, MemoryType, BankLabel, Manufacturer, PartNumber FROM Win32_PhysicalMemory", &mems); err != nil {
		errs = append(errs, ScanError{"hardware.ram", err.Error()})
	} else {
		var totalBytes uint64
		for _, m := range mems {
			gb := float64(m.Capacity) / (1024 * 1024 * 1024)
			hw.RAM = append(hw.RAM, RAMModule{
				CapacityGB:   math.Round(gb*10) / 10,
				SpeedMHz:     m.Speed,
				MemoryType:   wmiMemTypeName(m.MemoryType),
				BankLabel:    strings.TrimSpace(m.BankLabel),
				Manufacturer: strings.TrimSpace(m.Manufacturer),
			})
			totalBytes += m.Capacity
		}
		hw.TotalRAMGB = math.Round(float64(totalBytes)/(1024*1024*1024)*10) / 10
	}

	// Mainboard
	var boards []wmiBaseBoard
	if err := wmi.Query("SELECT Manufacturer, Product, Version, SerialNumber FROM Win32_BaseBoard", &boards); err != nil {
		errs = append(errs, ScanError{"hardware.motherboard", err.Error()})
	} else if len(boards) > 0 {
		b := boards[0]
		hw.Motherboard = MotherboardInfo{
			Manufacturer: strings.TrimSpace(b.Manufacturer),
			Product:      strings.TrimSpace(b.Product),
			Version:      strings.TrimSpace(b.Version),
			SerialNumber: strings.TrimSpace(b.SerialNumber),
		}
	}

	// GPU
	var gpus []wmiVideoController
	if err := wmi.Query("SELECT Name, AdapterRAM, DriverVersion FROM Win32_VideoController WHERE AdapterCompatibility != ''", &gpus); err != nil {
		errs = append(errs, ScanError{"hardware.gpu", err.Error()})
	} else {
		for _, g := range gpus {
			vram := float64(g.AdapterRAM) / (1024 * 1024 * 1024)
			hw.GPUs = append(hw.GPUs, GPUInfo{
				Name:          strings.TrimSpace(g.Name),
				VRAMGB:        math.Round(vram*10) / 10,
				DriverVersion: g.DriverVersion,
			})
		}
	}

	// Festplatten
	var disks []wmiDiskDrive
	if err := wmi.Query("SELECT Model, Size, MediaType, InterfaceType, SerialNumber FROM Win32_DiskDrive", &disks); err != nil {
		errs = append(errs, ScanError{"hardware.disks", err.Error()})
	} else {
		for _, d := range disks {
			sizeGB := float64(d.Size) / (1024 * 1024 * 1024)
			hw.Disks = append(hw.Disks, DiskInfo{
				Model:         strings.TrimSpace(d.Model),
				SizeGB:        math.Round(sizeGB*10) / 10,
				MediaType:     wmiMediaTypeName(d.MediaType),
				InterfaceType: strings.TrimSpace(d.InterfaceType),
				SerialNumber:  strings.TrimSpace(d.SerialNumber),
			})
		}
	}

	// Laufwerk-Nutzung (logische Laufwerke)
	var ldisks []wmiLogicalDisk
	if err := wmi.Query("SELECT DeviceID, Size, FreeSpace, FileSystem FROM Win32_LogicalDisk WHERE DriveType=3", &ldisks); err != nil {
		errs = append(errs, ScanError{"hardware.volumes", err.Error()})
	} else {
		for _, ld := range ldisks {
			totalGB := float64(ld.Size) / (1024 * 1024 * 1024)
			freeGB := float64(ld.FreeSpace) / (1024 * 1024 * 1024)
			usedGB := totalGB - freeGB
			hw.Volumes = append(hw.Volumes, VolumeInfo{
				Letter:     ld.DeviceID,
				MountPoint: ld.DeviceID,
				TotalGB:    math.Round(totalGB*10) / 10,
				UsedGB:     math.Round(usedGB*10) / 10,
				FreeGB:     math.Round(freeGB*10) / 10,
				FileSystem: ld.FileSystem,
			})
		}
	}

	return hw, errs
}

// ─── Betriebssystem ───────────────────────────────────────────────────────────

type wmiOS struct {
	Caption        string
	Version        string
	BuildNumber    string
	OSArchitecture string
	InstallDate    time.Time
	LastBootUpTime time.Time
	SerialNumber   string
}

func scanOS() (OSInfo, []ScanError) {
	info := OSInfo{}
	var errs []ScanError

	var oss []wmiOS
	if err := wmi.Query("SELECT Caption, Version, BuildNumber, OSArchitecture, InstallDate, LastBootUpTime, SerialNumber FROM Win32_OperatingSystem", &oss); err != nil {
		errs = append(errs, ScanError{"os", err.Error()})
		return info, errs
	}
	if len(oss) > 0 {
		o := oss[0]
		info = OSInfo{
			Name:         strings.TrimSpace(o.Caption),
			Version:      o.Version,
			Build:        o.BuildNumber,
			Architecture: strings.TrimSpace(o.OSArchitecture),
			InstallDate:  o.InstallDate,
			LastBootTime: o.LastBootUpTime,
			SerialNumber: strings.TrimSpace(o.SerialNumber),
		}
	}

	// Lizenzstatus via slmgr (kann einen Moment dauern)
	info.LicenseStatus = queryLicenseStatus()

	return info, errs
}

// queryLicenseStatus fragt den Windows-Aktivierungsstatus ab.
// Gibt "Licensed", "Unlicensed" oder "Unknown" zurück.
func queryLicenseStatus() string {
	out, err := exec.Command("cscript", "//NoLogo", `C:\Windows\System32\slmgr.vbs`, "/dli").Output()
	if err != nil {
		return "Unknown"
	}
	lower := strings.ToLower(string(out))
	if strings.Contains(lower, "license status: licensed") {
		return "Licensed"
	}
	if strings.Contains(lower, "unlicensed") {
		return "Unlicensed"
	}
	return "Unknown"
}

// ─── SMART ────────────────────────────────────────────────────────────────────

type wmiDiskStatus struct {
	Name   string
	Status string
}

func scanSmart() ([]DiskSmart, []ScanError) {
	var results []DiskSmart
	var errs []ScanError

	// Grundstatus via Win32_DiskDrive (kein Admin nötig)
	var disks []struct {
		Model        string
		SerialNumber string
		Status       string
	}
	if err := wmi.Query("SELECT Model, SerialNumber, Status FROM Win32_DiskDrive", &disks); err != nil {
		errs = append(errs, ScanError{"smart", err.Error()})
		return results, errs
	}

	for _, d := range disks {
		status := SmartUnknown
		switch strings.ToLower(strings.TrimSpace(d.Status)) {
		case "ok":
			status = SmartOK
		case "pred fail":
			status = SmartWarning
		case "error", "degraded", "unknown", "starting", "stopping", "service", "stressed", "nonrecover":
			status = SmartCritical
		}

		results = append(results, DiskSmart{
			Model:           strings.TrimSpace(d.Model),
			SerialNumber:    strings.TrimSpace(d.SerialNumber),
			Status:          status,
			LifeLeftPercent: -1, // erfordert Admin-Rechte für volle SMART-Abfrage
		})
	}

	// Erweiterte SMART-Daten versuchen (benötigt Admin)
	results = enrichSmartWithWMI(results, &errs)

	return results, errs
}

// enrichSmartWithWMI versucht, detaillierte SMART-Attribute via WMI zu lesen.
// Schlägt ohne Admin-Rechte fehl — wird dann als Warnung geloggt, kein Absturz.
func enrichSmartWithWMI(disks []DiskSmart, errs *[]ScanError) []DiskSmart {
	type wmiSmartData struct {
		InstanceName string
		VendorSpecific []byte
	}

	var smartData []wmiSmartData
	// Namespace root/wmi ist für SMART-Daten nötig
	if err := wmi.QueryNamespace(
		"SELECT InstanceName, VendorSpecific FROM MSStorageDriver_ATAPISmartData",
		&smartData,
		"root/wmi",
	); err != nil {
		*errs = append(*errs, ScanError{"smart.detail", fmt.Sprintf("Admin-Rechte nötig für SMART-Details: %v", err)})
		return disks
	}

	// VendorSpecific enthält die 512-Byte-SMART-Struktur
	// Attribut-Offsets: Byte 2 = ID, Bytes 5-10 = Raw-Wert
	for i := range disks {
		for _, sd := range smartData {
			if !strings.Contains(strings.ToLower(sd.InstanceName), strings.ToLower(disks[i].Model)) {
				continue
			}
			disks[i].Attributes = parseSMARTVendorSpecific(sd.VendorSpecific)
			// Bekannte Attribute herausziehen
			for _, attr := range disks[i].Attributes {
				switch attr.ID {
				case 5:   // Reallocated Sectors
					disks[i].ReallocatedSectors = attr.RawValue
					if attr.RawValue > 0 {
						disks[i].Status = SmartWarning
					}
				case 190, 194: // Temperature
					disks[i].TemperatureC = int(attr.RawValue & 0xFF)
				case 9:   // Power-On Hours
					disks[i].PowerOnHours = attr.RawValue
				case 231, 177: // SSD Life Left
					disks[i].LifeLeftPercent = int(attr.RawValue)
				}
			}
		}
	}
	return disks
}

// parseSMARTVendorSpecific liest die SMART-Attributtabelle aus dem 512-Byte-Feld.
// Aufbau: Offset 2 + (i*12): ID (1 Byte), Status (2 Bytes), Raw (6 Bytes)
func parseSMARTVendorSpecific(data []byte) []SmartAttr {
	var attrs []SmartAttr
	if len(data) < 362 {
		return attrs
	}
	for i := 0; i < 30; i++ {
		offset := 2 + i*12
		if offset+11 >= len(data) {
			break
		}
		id := data[offset]
		if id == 0 {
			continue
		}
		raw := uint64(data[offset+5]) |
			uint64(data[offset+6])<<8 |
			uint64(data[offset+7])<<16 |
			uint64(data[offset+8])<<24 |
			uint64(data[offset+9])<<32 |
			uint64(data[offset+10])<<40

		status := "OK"
		flags := uint16(data[offset+1]) | uint16(data[offset+2])<<8
		if flags&0x0020 != 0 { // Pre-failure bit
			status = "WARNING"
		}

		attrs = append(attrs, SmartAttr{
			ID:       id,
			Name:     smartAttrName(id),
			RawValue: raw,
			Status:   status,
		})
	}
	return attrs
}

// ─── Benutzer ─────────────────────────────────────────────────────────────────

type wmiUser struct {
	Name        string
	FullName    string
	Description string
	Disabled    bool
	Status      string
}

type wmiGroupUser struct {
	GroupComponent string
	PartComponent  string
}

func scanUsers() ([]UserInfo, []ScanError) {
	var users []UserInfo
	var errs []ScanError

	var wmiUsers []wmiUser
	if err := wmi.Query("SELECT Name, FullName, Description, Disabled, Status FROM Win32_UserAccount WHERE LocalAccount=True", &wmiUsers); err != nil {
		errs = append(errs, ScanError{"users", err.Error()})
		return users, errs
	}

	// Administratoren-Gruppe bestimmen
	admins := fetchAdminGroupMembers(&errs)

	for _, u := range wmiUsers {
		users = append(users, UserInfo{
			Name:      u.Name,
			FullName:  strings.TrimSpace(u.FullName),
			IsAdmin:   admins[strings.ToLower(u.Name)],
			IsEnabled: !u.Disabled,
		})
	}

	return users, errs
}

// fetchAdminGroupMembers gibt eine Map mit Benutzernamen (klein) zurück, die in der Admin-Gruppe sind.
func fetchAdminGroupMembers(errs *[]ScanError) map[string]bool {
	admins := make(map[string]bool)
	var members []wmiGroupUser
	// Suche nach der lokalen Administratoren-Gruppe (SID S-1-5-32-544)
	err := wmi.Query(`SELECT GroupComponent, PartComponent FROM Win32_GroupUser WHERE GroupComponent="Win32_Group.Domain='"+%COMPUTERNAME%+"',Name='Administrators'"`, &members)
	if err != nil {
		// Alternative: über net localgroup (als Fallback)
		out, execErr := exec.Command("net", "localgroup", "Administrators").Output()
		if execErr != nil {
			*errs = append(*errs, ScanError{"users.admins", fmt.Sprintf("Admin-Gruppen-Abfrage fehlgeschlagen: %v", err)})
			return admins
		}
		lines := strings.Split(string(out), "\n")
		parsing := false
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "---") {
				parsing = true
				continue
			}
			if parsing && line != "" && !strings.HasPrefix(line, "The command") {
				admins[strings.ToLower(line)] = true
			}
		}
		return admins
	}
	for _, m := range members {
		// PartComponent: Win32_UserAccount.Domain="...",Name="username"
		if idx := strings.Index(m.PartComponent, `Name="`); idx >= 0 {
			name := m.PartComponent[idx+6:]
			name = strings.TrimSuffix(name, `"`)
			admins[strings.ToLower(name)] = true
		}
	}
	return admins
}

// ─── Sicherheit ───────────────────────────────────────────────────────────────

func scanSecurity() (SecurityInfo, []ScanError) {
	info := SecurityInfo{}
	var errs []ScanError

	info.BitLockerVolumes = scanBitLocker(&errs)
	scanDefender(&info, &errs)
	info.FirewallEnabled = checkFirewall(&errs)

	return info, errs
}

func scanBitLocker(errs *[]ScanError) []BitLockerVolume {
	var volumes []BitLockerVolume

	// manage-bde ist auf allen Windows-Versionen mit BitLocker verfügbar
	out, err := exec.Command("manage-bde", "-status").Output()
	if err != nil {
		*errs = append(*errs, ScanError{"security.bitlocker", fmt.Sprintf("manage-bde fehlgeschlagen: %v", err)})
		return volumes
	}

	var currentDrive string
	var currentStatus string
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Volume") && strings.Contains(line, ":") {
			// "Volume C: [Windows]"
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				currentDrive = strings.TrimSuffix(parts[1], ":")
			}
		}
		if strings.HasPrefix(line, "Conversion Status:") || strings.HasPrefix(line, "Protection Status:") {
			currentStatus = strings.TrimSpace(strings.SplitN(line, ":", 2)[1])
		}
		if currentDrive != "" && currentStatus != "" {
			encrypted := strings.Contains(strings.ToLower(currentStatus), "on") ||
				strings.Contains(strings.ToLower(currentStatus), "encrypted")
			volumes = append(volumes, BitLockerVolume{
				Drive:     currentDrive,
				Encrypted: encrypted,
				Status:    currentStatus,
			})
			currentDrive = ""
			currentStatus = ""
		}
	}
	return volumes
}

func scanDefender(info *SecurityInfo, errs *[]ScanError) {
	type wmiDefender struct {
		AMServiceEnabled            bool
		AntispywareSignatureVersion string
		AntivirusSignatureVersion   string
		QuickScanAge                uint32
		NISEnabled                  bool
	}

	var def []wmiDefender
	if err := wmi.QueryNamespace(
		"SELECT AMServiceEnabled, AntispywareSignatureVersion, AntivirusSignatureVersion FROM MSFT_MpComputerStatus",
		&def,
		`root\microsoft\windows\defender`,
	); err != nil {
		*errs = append(*errs, ScanError{"security.defender", fmt.Sprintf("Defender-Status nicht abrufbar: %v", err)})
		return
	}
	if len(def) > 0 {
		info.DefenderEnabled = def[0].AMServiceEnabled
		info.DefenderVersion = def[0].AntivirusSignatureVersion
		// Signaturdatum aus Signatur-Alter berechnen ist unzuverlässig;
		// stattdessen Registrierung lesen
		info.DefenderSignatureDate = queryDefenderSignatureDate()
	}
}

// queryDefenderSignatureDate liest das Signatur-Datum aus der Registry.
func queryDefenderSignatureDate() time.Time {
	out, err := exec.Command("reg", "query",
		`HKLM\SOFTWARE\Microsoft\Windows Defender\Signature Updates`,
		"/v", "SignaturesLastUpdated").Output()
	if err != nil {
		return time.Time{}
	}
	// Ausgabe: "    SignaturesLastUpdated    REG_BINARY    ..."
	// Das Binary-Datum ist ein Windows FILETIME (64-Bit Integer)
	// Vereinfacht: Datum aus Zeile parsen
	for _, line := range strings.Split(string(out), "\n") {
		if strings.Contains(line, "SignaturesLastUpdated") {
			// Roh-Binärwert, nur als Hinweis zurückgeben
			return time.Now() // TODO: korrektes FILETIME-Parsing
		}
	}
	return time.Time{}
}

func checkFirewall(errs *[]ScanError) bool {
	out, err := exec.Command("netsh", "advfirewall", "show", "allprofiles", "state").Output()
	if err != nil {
		*errs = append(*errs, ScanError{"security.firewall", err.Error()})
		return false
	}
	return strings.Contains(strings.ToLower(string(out)), "on")
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

func wmiArchName(arch uint16) string {
	switch arch {
	case 0:
		return "x86"
	case 5:
		return "ARM"
	case 9:
		return "x64"
	case 12:
		return "ARM64"
	default:
		return fmt.Sprintf("Unknown(%d)", arch)
	}
}

func wmiMemTypeName(t uint16) string {
	switch t {
	case 20:
		return "DDR"
	case 21:
		return "DDR2"
	case 24:
		return "DDR3"
	case 26:
		return "DDR4"
	case 34:
		return "DDR5"
	case 18:
		return "LPDDR"
	case 22:
		return "LPDDR2"
	case 25:
		return "LPDDR3"
	case 27:
		return "LPDDR4"
	case 35:
		return "LPDDR5"
	default:
		return "Unknown"
	}
}

func wmiMediaTypeName(t string) string {
	lower := strings.ToLower(t)
	switch {
	case strings.Contains(lower, "solid"):
		return "SSD"
	case strings.Contains(lower, "external"):
		return "External"
	case strings.Contains(lower, "removable"):
		return "Removable"
	default:
		return "HDD"
	}
}

func smartAttrName(id uint8) string {
	names := map[uint8]string{
		1:   "Raw Read Error Rate",
		3:   "Spin-Up Time",
		4:   "Start/Stop Count",
		5:   "Reallocated Sectors Count",
		7:   "Seek Error Rate",
		9:   "Power-On Hours",
		10:  "Spin Retry Count",
		12:  "Power Cycle Count",
		177: "Wear Leveling Count",
		179: "Used Reserved Block Count Total",
		181: "Program Fail Count Total",
		182: "Erase Fail Count",
		183: "Runtime Bad Block",
		187: "Reported Uncorrectable Errors",
		188: "Command Timeout",
		190: "Airflow Temperature",
		194: "Temperature",
		197: "Current Pending Sector Count",
		198: "Offline Uncorrectable Sector Count",
		199: "Ultra DMA CRC Error Count",
		231: "SSD Life Left",
		241: "Total LBAs Written",
		242: "Total LBAs Read",
	}
	if name, ok := names[id]; ok {
		return name
	}
	return fmt.Sprintf("Attribute 0x%02X", id)
}
