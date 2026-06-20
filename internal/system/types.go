// Package system sammelt Hardware-, OS-, SMART-, Benutzer- und Sicherheitsinformationen.
// Plattformspezifische Implementierungen liegen in scanner_windows.go / scanner_darwin.go.
package system

import "time"

// ScanResult ist das vollständige Ergebnis eines System-Scans.
// Nicht-fatale Fehler (z.B. fehlende Adminrechte) landen in Errors,
// damit der Rest der Daten trotzdem angezeigt werden kann.
type ScanResult struct {
	Timestamp time.Time    `json:"timestamp"`
	Hardware  HardwareInfo `json:"hardware"`
	OS        OSInfo       `json:"os"`
	Smart     []DiskSmart  `json:"smart"`
	Users     []UserInfo   `json:"users"`
	Security  SecurityInfo `json:"security"`
	Errors    []ScanError  `json:"errors,omitempty"`
}

// ─── Hardware ─────────────────────────────────────────────────────────────────

type HardwareInfo struct {
	CPU         CPUInfo         `json:"cpu"`
	RAM         []RAMModule     `json:"ram"`
	TotalRAMGB  float64         `json:"total_ram_gb"`
	Motherboard MotherboardInfo `json:"motherboard"`
	GPUs        []GPUInfo       `json:"gpus"`
	Disks       []DiskInfo      `json:"disks"`
	Volumes     []VolumeInfo    `json:"volumes"`
	Battery     *BatteryInfo    `json:"battery,omitempty"` // nil = kein Akku
}

type CPUInfo struct {
	Name         string  `json:"name"`
	Cores        int     `json:"cores"`
	Threads      int     `json:"threads"`
	SpeedMHz     uint32  `json:"speed_mhz"`
	Architecture string  `json:"architecture"`
}

type RAMModule struct {
	CapacityGB   float64 `json:"capacity_gb"`
	SpeedMHz     uint32  `json:"speed_mhz"`
	MemoryType   string  `json:"memory_type"`   // DDR4, DDR5, LPDDR5 …
	BankLabel    string  `json:"bank_label"`
	Manufacturer string  `json:"manufacturer"`
}

type MotherboardInfo struct {
	Manufacturer string `json:"manufacturer"`
	Product      string `json:"product"`
	Version      string `json:"version"`
	SerialNumber string `json:"serial_number"`
}

type GPUInfo struct {
	Name          string `json:"name"`
	VRAMGB        float64 `json:"vram_gb"`
	DriverVersion string `json:"driver_version"`
}

type DiskInfo struct {
	Model         string `json:"model"`
	SizeGB        float64 `json:"size_gb"`
	MediaType     string `json:"media_type"`     // SSD, HDD, NVMe, Unknown
	InterfaceType string `json:"interface_type"` // SATA, NVMe, USB, …
	SerialNumber  string `json:"serial_number"`
}

// BatteryInfo beschreibt den Akku-Status eines Geräts (nil = kein Akku vorhanden).
type BatteryInfo struct {
	Present          bool   `json:"present"`
	ChargePct        int    `json:"charge_pct"`        // 0–100 %
	Status           string `json:"status"`             // "Lädt", "Entlädt", "Voll (Netz)", "Netz"
	RemainingMinutes int    `json:"remaining_minutes"`  // -1 = unbekannt
}

// VolumeInfo beschreibt eine gemountete Partition mit Speichernutzung.
type VolumeInfo struct {
	Letter     string  `json:"letter"`       // Laufwerksbuchstabe (C:) oder Volume-Name
	MountPoint string  `json:"mount_point"`  // Einhängepunkt (/  oder C:\)
	TotalGB    float64 `json:"total_gb"`
	UsedGB     float64 `json:"used_gb"`
	FreeGB     float64 `json:"free_gb"`
	FileSystem string  `json:"file_system"`  // NTFS, APFS, ext4 …
}

// ─── Betriebssystem ───────────────────────────────────────────────────────────

type OSInfo struct {
	Name             string    `json:"name"`
	Version          string    `json:"version"`
	Build            string    `json:"build"`
	Architecture     string    `json:"architecture"`
	InstallDate      time.Time `json:"install_date"`
	LastBootTime     time.Time `json:"last_boot_time"`
	LicenseStatus    string    `json:"license_status"`   // Licensed, Unlicensed, Unknown
	SerialNumber     string    `json:"serial_number"`
	LastUpdateDate   time.Time `json:"last_update_date,omitempty"`
	PendingUpdates   int       `json:"pending_updates,omitempty"` // -1 = nicht ermittelt
}

// ─── SMART ────────────────────────────────────────────────────────────────────

// SmartStatus beschreibt den Gesamtzustand einer Festplatte.
type SmartStatus string

const (
	SmartOK       SmartStatus = "OK"
	SmartWarning  SmartStatus = "WARNING"
	SmartCritical SmartStatus = "CRITICAL"
	SmartUnknown  SmartStatus = "UNKNOWN"
)

type DiskSmart struct {
	Model              string      `json:"model"`
	SerialNumber       string      `json:"serial_number"`
	Status             SmartStatus `json:"status"`
	TemperatureC       int         `json:"temperature_c"`
	PowerOnHours       uint64      `json:"power_on_hours"`
	ReallocatedSectors uint64      `json:"reallocated_sectors"`
	LifeLeftPercent    int         `json:"life_left_percent"` // -1 = nicht verfügbar (HDD)
	Attributes         []SmartAttr `json:"attributes,omitempty"`
}

type SmartAttr struct {
	ID       uint8  `json:"id"`
	Name     string `json:"name"`
	RawValue uint64 `json:"raw_value"`
	Status   string `json:"status"` // "OK", "WARNING", "CRITICAL"
}

// ─── Benutzer ─────────────────────────────────────────────────────────────────

type UserInfo struct {
	Name      string    `json:"name"`
	FullName  string    `json:"full_name"`
	IsAdmin   bool      `json:"is_admin"`
	IsEnabled bool      `json:"is_enabled"`
	LastLogon time.Time `json:"last_logon"`
}

// ─── Sicherheit ───────────────────────────────────────────────────────────────

type SecurityInfo struct {
	Platform              string            `json:"platform"`              // "darwin", "windows", "linux"
	BitLockerVolumes      []BitLockerVolume `json:"bitlocker_volumes"`
	DefenderEnabled       bool              `json:"defender_enabled"`
	DefenderSignatureDate time.Time         `json:"defender_signature_date"`
	DefenderVersion       string            `json:"defender_version"`
	FirewallEnabled       bool              `json:"firewall_enabled"`
	FirewallKnown         bool              `json:"firewall_known"`        // true = Status konnte ermittelt werden
	RDPEnabled            bool              `json:"rdp_enabled"`
	RDPPort               int               `json:"rdp_port,omitempty"`
	NLAEnabled            bool              `json:"nla_enabled"`
	LocalShares           []LocalShare      `json:"local_shares,omitempty"`
}

// LocalShare beschreibt eine lokale Netzwerkfreigabe des Systems.
type LocalShare struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	Description string `json:"description"`
	IsSystem    bool   `json:"is_system"` // ADMIN$, C$, IPC$
}

type BitLockerVolume struct {
	Drive     string `json:"drive"`
	Encrypted bool   `json:"encrypted"`
	Status    string `json:"status"`
}

// ─── Fehler-Tracking ──────────────────────────────────────────────────────────

// ScanError ist ein nicht-fataler Fehler während des Scans.
// Der Scan läuft weiter; das Ergebnis ist möglicherweise unvollständig.
type ScanError struct {
	Module  string `json:"module"`
	Message string `json:"message"`
}
