// Package system – export.go speichert einen ScanResult als Markdown-Dateien
// in der Vault-Session-Struktur (kompatibel mit Obsidian.md).
package system

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// SaveToVault schreibt alle Scan-Ergebnisse als Markdown-Dateien in die Session.
// sessionPath ist der absolute Pfad zum Session-Ordner (z.B. vault/data/20260619_Kunde).
func SaveToVault(result *ScanResult, sessionPath string) error {
	if err := os.MkdirAll(filepath.Join(sessionPath, "system"), 0755); err != nil {
		return err
	}

	if err := writeFile(sessionPath, "system/hardware.md", renderHardware(result)); err != nil {
		return fmt.Errorf("hardware.md: %w", err)
	}
	if err := writeFile(sessionPath, "system/os.md", renderOS(result)); err != nil {
		return fmt.Errorf("os.md: %w", err)
	}
	if err := writeFile(sessionPath, "system/smart.md", renderSmart(result)); err != nil {
		return fmt.Errorf("smart.md: %w", err)
	}
	if err := writeFile(sessionPath, "security/users.md", renderUsers(result)); err != nil {
		return fmt.Errorf("users.md: %w", err)
	}
	if err := writeFile(sessionPath, "security/security.md", renderSecurity(result)); err != nil {
		return fmt.Errorf("security.md: %w", err)
	}

	return nil
}

// ─── Render-Funktionen ────────────────────────────────────────────────────────

func renderHardware(r *ScanResult) string {
	hw := r.Hardware
	sb := &strings.Builder{}

	fmt.Fprintf(sb, "# Hardware-Inventarisierung\n\n")
	fmt.Fprintf(sb, "> Scan: %s\n\n", r.Timestamp.Format("02.01.2006 15:04:05"))

	fmt.Fprintf(sb, "## CPU\n\n")
	fmt.Fprintf(sb, "| Eigenschaft | Wert |\n|---|---|\n")
	fmt.Fprintf(sb, "| Modell | %s |\n", hw.CPU.Name)
	fmt.Fprintf(sb, "| Kerne | %d |\n", hw.CPU.Cores)
	fmt.Fprintf(sb, "| Threads | %d |\n", hw.CPU.Threads)
	fmt.Fprintf(sb, "| Takt | %.1f GHz |\n", float64(hw.CPU.SpeedMHz)/1000)
	fmt.Fprintf(sb, "| Architektur | %s |\n\n", hw.CPU.Architecture)

	fmt.Fprintf(sb, "## Mainboard\n\n")
	fmt.Fprintf(sb, "| Eigenschaft | Wert |\n|---|---|\n")
	fmt.Fprintf(sb, "| Hersteller | %s |\n", hw.Motherboard.Manufacturer)
	fmt.Fprintf(sb, "| Produkt | %s |\n", hw.Motherboard.Product)
	fmt.Fprintf(sb, "| Version | %s |\n", hw.Motherboard.Version)
	fmt.Fprintf(sb, "| Seriennummer | %s |\n\n", hw.Motherboard.SerialNumber)

	fmt.Fprintf(sb, "## RAM (gesamt: %.0f GB)\n\n", hw.TotalRAMGB)
	if len(hw.RAM) > 0 {
		fmt.Fprintf(sb, "| Slot | Kapazität | Typ | Takt | Hersteller |\n|---|---|---|---|---|\n")
		for _, m := range hw.RAM {
			fmt.Fprintf(sb, "| %s | %.0f GB | %s | %d MHz | %s |\n",
				m.BankLabel, m.CapacityGB, m.MemoryType, m.SpeedMHz, m.Manufacturer)
		}
		fmt.Fprintln(sb)
	}

	fmt.Fprintf(sb, "## GPU\n\n")
	if len(hw.GPUs) > 0 {
		fmt.Fprintf(sb, "| Modell | VRAM | Treiber |\n|---|---|---|\n")
		for _, g := range hw.GPUs {
			vram := "–"
			if g.VRAMGB > 0 {
				vram = fmt.Sprintf("%.0f GB", g.VRAMGB)
			}
			fmt.Fprintf(sb, "| %s | %s | %s |\n", g.Name, vram, g.DriverVersion)
		}
		fmt.Fprintln(sb)
	}

	fmt.Fprintf(sb, "## Festplatten\n\n")
	if len(hw.Disks) > 0 {
		fmt.Fprintf(sb, "| Modell | Größe | Typ | Schnittstelle | Seriennummer |\n|---|---|---|---|---|\n")
		for _, d := range hw.Disks {
			fmt.Fprintf(sb, "| %s | %.0f GB | %s | %s | %s |\n",
				d.Model, d.SizeGB, d.MediaType, d.InterfaceType, d.SerialNumber)
		}
	}

	return sb.String()
}

func renderOS(r *ScanResult) string {
	o := r.OS
	sb := &strings.Builder{}

	fmt.Fprintf(sb, "# Betriebssystem\n\n")
	fmt.Fprintf(sb, "> Scan: %s\n\n", r.Timestamp.Format("02.01.2006 15:04:05"))

	fmt.Fprintf(sb, "| Eigenschaft | Wert |\n|---|---|\n")
	fmt.Fprintf(sb, "| Name | %s |\n", o.Name)
	fmt.Fprintf(sb, "| Version | %s |\n", o.Version)
	fmt.Fprintf(sb, "| Build | %s |\n", o.Build)
	fmt.Fprintf(sb, "| Architektur | %s |\n", o.Architecture)
	if !o.InstallDate.IsZero() {
		fmt.Fprintf(sb, "| Installiert | %s |\n", o.InstallDate.Format("02.01.2006"))
	}
	if !o.LastBootTime.IsZero() {
		fmt.Fprintf(sb, "| Letzter Neustart | %s |\n", o.LastBootTime.Format("02.01.2006 15:04"))
		uptime := time.Since(o.LastBootTime)
		days := int(uptime.Hours()) / 24
		hours := int(uptime.Hours()) % 24
		fmt.Fprintf(sb, "| Uptime | %d Tage, %d Stunden |\n", days, hours)
	}
	fmt.Fprintf(sb, "| Lizenzstatus | %s |\n", o.LicenseStatus)
	if o.SerialNumber != "" {
		fmt.Fprintf(sb, "| Seriennummer | %s |\n", o.SerialNumber)
	}

	return sb.String()
}

func renderSmart(r *ScanResult) string {
	sb := &strings.Builder{}

	fmt.Fprintf(sb, "# SMART-Status\n\n")
	fmt.Fprintf(sb, "> Scan: %s\n\n", r.Timestamp.Format("02.01.2006 15:04:05"))

	if len(r.Smart) == 0 {
		fmt.Fprintln(sb, "_Keine SMART-Daten verfügbar._")
		return sb.String()
	}

	for _, d := range r.Smart {
		statusIcon := map[SmartStatus]string{
			SmartOK:       "🟢",
			SmartWarning:  "🟡",
			SmartCritical: "🔴",
			SmartUnknown:  "⚪",
		}[d.Status]

		fmt.Fprintf(sb, "## %s %s\n\n", statusIcon, d.Model)
		fmt.Fprintf(sb, "| Eigenschaft | Wert |\n|---|---|\n")
		fmt.Fprintf(sb, "| Status | %s %s |\n", statusIcon, d.Status)
		if d.SerialNumber != "" {
			fmt.Fprintf(sb, "| Seriennummer | %s |\n", d.SerialNumber)
		}
		if d.TemperatureC > 0 {
			fmt.Fprintf(sb, "| Temperatur | %d °C |\n", d.TemperatureC)
		}
		if d.PowerOnHours > 0 {
			days := d.PowerOnHours / 24
			fmt.Fprintf(sb, "| Betriebsstunden | %d h (%d Tage) |\n", d.PowerOnHours, days)
		}
		fmt.Fprintf(sb, "| Reallocated Sectors | %d |\n", d.ReallocatedSectors)
		if d.LifeLeftPercent >= 0 {
			fmt.Fprintf(sb, "| SSD-Restlebensdauer | %d%% |\n", d.LifeLeftPercent)
		}

		if len(d.Attributes) > 0 {
			fmt.Fprintf(sb, "\n### SMART-Attribute\n\n")
			fmt.Fprintf(sb, "| ID | Name | Rohwert | Status |\n|---|---|---|---|\n")
			for _, attr := range d.Attributes {
				icon := "🟢"
				if attr.Status == "WARNING" {
					icon = "🟡"
				} else if attr.Status == "CRITICAL" {
					icon = "🔴"
				}
				fmt.Fprintf(sb, "| 0x%02X | %s | %d | %s %s |\n",
					attr.ID, attr.Name, attr.RawValue, icon, attr.Status)
			}
		}
		fmt.Fprintln(sb)
	}

	return sb.String()
}

func renderUsers(r *ScanResult) string {
	sb := &strings.Builder{}

	fmt.Fprintf(sb, "# Lokale Benutzerkonten\n\n")
	fmt.Fprintf(sb, "> Scan: %s\n\n", r.Timestamp.Format("02.01.2006 15:04:05"))

	if len(r.Users) == 0 {
		fmt.Fprintln(sb, "_Keine Benutzer gefunden._")
		return sb.String()
	}

	fmt.Fprintf(sb, "| Name | Vollständiger Name | Admin | Aktiv |\n|---|---|---|---|\n")
	for _, u := range r.Users {
		admin := "Nein"
		if u.IsAdmin {
			admin = "**Ja**"
		}
		enabled := "✓"
		if !u.IsEnabled {
			enabled = "✗ (deaktiviert)"
		}
		fmt.Fprintf(sb, "| %s | %s | %s | %s |\n", u.Name, u.FullName, admin, enabled)
	}

	return sb.String()
}

func renderSecurity(r *ScanResult) string {
	sec := r.Security
	sb := &strings.Builder{}

	fmt.Fprintf(sb, "# Sicherheitsstatus\n\n")
	fmt.Fprintf(sb, "> Scan: %s\n\n", r.Timestamp.Format("02.01.2006 15:04:05"))

	// BitLocker / FileVault
	fmt.Fprintf(sb, "## Festplattenverschlüsselung\n\n")
	if len(sec.BitLockerVolumes) > 0 {
		fmt.Fprintf(sb, "| Laufwerk | Verschlüsselt | Status |\n|---|---|---|\n")
		for _, v := range sec.BitLockerVolumes {
			icon := "✗"
			if v.Encrypted {
				icon = "✓"
			}
			fmt.Fprintf(sb, "| %s | %s | %s |\n", v.Drive, icon, v.Status)
		}
	} else {
		fmt.Fprintln(sb, "_Keine Verschlüsselungsdaten verfügbar._")
	}
	fmt.Fprintln(sb)

	// Virenschutz / Defender
	fmt.Fprintf(sb, "## Virenschutz\n\n")
	fmt.Fprintf(sb, "| Eigenschaft | Wert |\n|---|---|\n")
	defEnabled := "✗ Deaktiviert"
	if sec.DefenderEnabled {
		defEnabled = "✓ Aktiv"
	}
	fmt.Fprintf(sb, "| Status | %s |\n", defEnabled)
	if sec.DefenderVersion != "" {
		fmt.Fprintf(sb, "| Signatur | %s |\n", sec.DefenderVersion)
	}
	if !sec.DefenderSignatureDate.IsZero() {
		fmt.Fprintf(sb, "| Signatur-Datum | %s |\n", sec.DefenderSignatureDate.Format("02.01.2006"))
	}
	fmt.Fprintln(sb)

	// Firewall
	fmt.Fprintf(sb, "## Firewall\n\n")
	fwStatus := "✗ Deaktiviert"
	if sec.FirewallEnabled {
		fwStatus = "✓ Aktiv"
	}
	fmt.Fprintf(sb, "Status: %s\n", fwStatus)

	return sb.String()
}

// writeFile erstellt eine Datei im sessionPath (legt Unterverzeichnis an falls nötig).
func writeFile(sessionPath, relPath, content string) error {
	fullPath := filepath.Join(sessionPath, relPath)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		return err
	}
	return os.WriteFile(fullPath, []byte(content), 0644)
}
