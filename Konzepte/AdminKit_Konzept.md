# AdminKit — Konzeptdokument

> **Version:** 1.0  
> **Datum:** 19. Juni 2026  
> **Status:** Entwurf zur Übergabe an Claude Code / Vibe Coding

---

## Inhaltsverzeichnis

1. [Vision & Zielsetzung](#1-vision--zielsetzung)
2. [Plattformen & Portabilität](#2-plattformen--portabilität)
3. [Vault-Struktur](#3-vault-struktur)
4. [Funktionsumfang](#4-funktionsumfang)
5. [Technologie-Stack](#5-technologie-stack)
6. [Datenverarbeitung & Sicherheit](#6-datenverarbeitung--sicherheit)
7. [Benutzeroberfläche](#7-benutzeroberfläche)
8. [Backup & Export](#8-backup--export)
9. [Logging & Fehlerbehandlung](#9-logging--fehlerbehandlung)
10. [Entwicklungsphasen](#10-entwicklungsphasen)

---

## 1. Vision & Zielsetzung

### 1.1 Was ist AdminKit?

AdminKit ist ein portables IT-Service-Tool für IT-Dienstleister, das auf Kunden-Systemen läuft, ohne Installation, ohne Spuren im System (außer temporären Dateien bei Bedarf) und ohne Adminrechte-Pflicht (mit eingeschränktem Funktionsumfang).

### 1.2 Kernprinzipien

| Prinzip | Beschreibung |
|---------|--------------|
| **Portabel** | Eine ausführbare Datei pro Plattform. Keine Installation. Kein Installer. |
| **Vault-basiert** | Alle Daten in einer Vault-Struktur nach Obsidian.md-Vorbild (relative Pfade). Einfache Sicherung und Weitergabe. |
| **Minimal-Fußabdruck** | Nur zwingend notwendige temporäre Dateien. Logs standardmäßig auf USB-Stick. |
| **Offline-fähig** | Keine Cloud-Anbindung. Keine externen Dienste. Keine Internetverbindung nötig. |
| **AV-freundlich** | Kompilierte Binaries mit minimalen Fehlalarmen bei Virenscannern. |

### 1.3 Zielgruppe

- IT-Dienstleister im Außendienst
- Managed-Services-Provider (MSP)
- Systemadministratoren bei Vor-Ort-Einsätzen
- EDV-Beratung mit Kundenbesuchen

---

## 2. Plattformen & Portabilität

### 2.1 Unterstützte Plattformen

| Priorität | Plattform | Bemerkung |
|-----------|-----------|-----------|
| **1 (P0)** | Windows 10/11 | Primary target. Webbasiert, da die meisten Clients Windows nutzen. |
| **2 (P1)** | macOS 12+ | Secondary target. Für Kunden mit Apple-Umgebungen. |
| **3 (P2)** | Linux (Ubuntu/Debian) | Optional. Für spezielle Einsätze. |

### 2.2 Portabilitäts-Mechanismus

```
┌─────────────────────────────────────────────────────────────┐
│                      AdminKit.exe                           │
│  (Kompilierte Go-Binary + Wails/WebView2 Runtime)          │
├─────────────────────────────────────────────────────────────┤
│  ├── AdminKit.exe              # Hauptanwendung             │
│  ├── resources/               # Frontend-Assets (HTML/CSS/JS)│
│  └── adminkit_vault/          # Daten-Vault                 │
│       ├── config.yaml         # Konfiguration              │
│       ├── data/               # Gesammelte Daten           │
│       │   ├── system/         #   System-Spezifikationen   │
│       │   ├── network/        #   Netzwerk-Informationen   │
│       │   ├── software/       #   Installierte Software    │
│       │   ├── printers/       #   Drucker-Konfiguration   │
│       │   └── wifi/           #   WiFi-Profile             │
│       ├── exports/            # Exporte (HTML, CSV, PDF)   │
│       └── logs/               # Log-Dateien                │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 WebView2-Anforderung

- **Windows 10/11:** WebView2 ist ab Build 1803 aufwärts systemweit vorhanden (Edge Chromium).
- **Fallback:** Falls WebView2 fehlt, wird eine minimale Runtime mitgeliefert (~120MB).
- **macOS/Linux:** Nutzen die systemeigenen WebViews über Wails-Bindings.

### 2.4 Externe Abhängigkeiten

| Abhängigkeit | Windows | macOS | Linux |
|--------------|---------|-------|-------|
| WebView2/GTK WebKit | ✅ (systemweit) | ✅ (systemweit) | ✅ (systemweit) |
| Python | ❌ Nicht nötig | ❌ Nicht nötig | ❌ Nicht nötig |
| .NET Runtime | ❌ Nicht nötig | ❌ Nicht nötig | ❌ Nicht nötig |
| Node.js | ❌ Nicht nötig | ❌ Nicht nötig | ❌ Nicht nötig |

---

## 3. Vault-Struktur

### 3.1 Obsidian.md-inspirierte Struktur

Die Vault-Struktur folgt dem bewährten Obsidian.md-Prinzip: Alle Daten sind lokal gespeichert, Pfade sind relativ, und die Struktur ist selbsterklärend.

```
adminkit_vault/
├── config.yaml                 # Globale Konfiguration
│
├── data/                       # Gesammelte Daten (pro Kunde/Session)
│   ├── YYYYMMDD_Kundenname/   # Session-Ordner
│   │   ├── system/
│   │   │   ├── hardware.md    # CPU, RAM, Motherboard etc.
│   │   │   ├── os.md          # OS-Version, Updates, Lizenzen
│   │   │   └── smart.md       # SMART-Status aller Festplatten
│   │   ├── network/
│   │   │   ├── interfaces.md   # Netzwerkadapter
│   │   │   ├── shares.md      # Netzlaufwerke
│   │   │   └── wifi.md        # WiFi-Profile & Passwörter
│   │   ├── software/
│   │   │   └── installed.md    # Installierte Programme
│   │   ├── printers/
│   │   │   └── configured.md   # Drucker-Konfiguration
│   │   └── security/
│   │       ├── users.md       # Lokale Benutzer
│   │       └── antivirus.md    # Sicherheitssoftware
│   │
│   └── clients/               # Dauerhafte Kundendaten
│       └── kundenname/
│           ├── config.yaml    # Kundenspezifische Einstellungen
│           └── history/       # Historische Sessions
│
├── exports/                    # Export-Dateien
│   ├── reports/               # Generierte Berichte
│   └── backups/               # Backup-Archive
│
└── logs/                       # Log-Dateien
    └── adminkit.log           # Haupt-Logdatei
```

### 3.2 config.yaml (Beispiel)

```yaml
version: "1.0"
vault_path: "./adminkit_vault"

defaults:
  log_location: "./logs"        # Relativer Pfad
  export_format: "html"         # Standard-Exportformat
  include_wifi_passwords: true
  include_smart_data: true

backup:
  auto_backup_before_export: true
  compression: "gzip"

ui:
  theme: "system"               # "light", "dark", "system"
  language: "de"                # "de", "en"
  show_advanced: false          # Erweiterte Optionen anzeigen
```

### 3.3 Vorteile der Vault-Struktur

| Vorteil | Beschreibung |
|---------|--------------|
| **Relative Pfade** | Vault funktioniert von jedem Ort: USB-Stick, Netzwerkpfad, lokale Festplatte. |
| **Obsidian-kompatibel** | Die `.md`-Dateien können direkt in Obsidian.md geöffnet werden. |
| **Einfache Sicherung** | Vault-Ordner komplett kopieren = vollständiges Backup. |
| **Git-freundlich** | Vault kann in ein Git-Repo überführt werden für Versionskontrolle. |
| **Keine Datenbank** | Kein SQL, kein Lock, keine DB-Engine nötig. Alles ist lesbarer Text. |

---

## 4. Funktionsumfang

### 4.1 Tab-Struktur (Hauptoberfläche)

```
┌────────────────────────────────────────────────────────────────┐
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│  │ Dashboard│ │ System  │ │ Netzwerk│ │Software │ │  Tools  │ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                      [Tab-Inhalt]                              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 4.2 Dashboard

| Element | Beschreibung |
|---------|--------------|
| **System-Übersicht** | OS, Hostname, Uptime, letzte Neustarts |
| **Quick-Check-Badge** | Rot/Gelb/Grün basierend auf kritischen Checks |
| **Letzte Aktionen** | Chronologischer Verlauf der letzten Scans |
| **Schnellzugriff-Buttons** | "Neuer Scan", "Export", "Backup erstellen" |

### 4.3 System

```
┌─────────────────────────────────────────────────────────────┐
│  HARDWARE                                                    │
│  ├─ CPU: Intel Core i7-10700 @ 2.9GHz (8 Kerne)            │
│  ├─ RAM: 32 GB DDR4                                         │
│  ├─ Motherboard: ASUS PRIME Z490-A                         │
│  └─ GPU: Intel UHD Graphics 630                            │
├─────────────────────────────────────────────────────────────┤
│  BETRIEBSSYSTEM                                              │
│  ├─ Windows 11 Pro 23H2 (Build 22631.2506)                  │
│  ├─ Letzte Updates: 12.06.2026 (KB5053603)                  │
│  ├─ Windows Defender: Aktiv (Signatur: 1.421.2148.0)       │
│  └─ BitLocker: Aktiviert (C:, D:)                           │
├─────────────────────────────────────────────────────────────┤
│  SMART STATUS                                                │
│  ├─ SSD Samsung 980 PRO 1TB: OK (Gesundheit: 98%)         │
│  ├─ HDD WD Blue 4TB: WARNUNG (Reallocated Sectors: 42)     │
│  └─ [Details anzeigen]                                      │
└─────────────────────────────────────────────────────────────┘
```

**Funktionen:**

| Funktion | Beschreibung | Admin nötig? |
|----------|--------------|--------------|
| Hardware-Inventarisierung | CPU, RAM, Motherboard, GPU, BIOS | ❌ Nein |
| OS-Details | Version, Build, Updates, Lizenzstatus | ❌ Nein |
| SMART-Daten | Festplatten-Gesundheit (S.M.A.R.T.) | ⚠️ Teilweise |
| BitLocker-Status | Verschlüsselungsstatus | ❌ Nein |
| Windows Defender | Status, letzte Signaturaktualisierung | ⚠️ Teilweise |

### 4.4 Netzwerk

```
┌─────────────────────────────────────────────────────────────┐
│  NETZWERKADAPTER                                             │
│  ├─ Ethernet: Realtek PCIe GbE Family Controller           │
│  │   ├─ MAC: 00:1A:2B:3C:4D:5E                            │
│  │   ├─ IPv4: 192.168.1.100                               │
│  │   ├─ Subnet: 255.255.255.0                             │
│  │   └─ Gateway: 192.168.1.1                              │
│  └─ WiFi: Intel Wi-Fi 6 AX201                              │
│      ├─ Verbunden mit: MeinWLAN                            │
│      └─ Signalstärke: -45 dBm (Gut)                       │
├─────────────────────────────────────────────────────────────┤
│  NETZLAUFWERKE                                              │
│  ├─ Y: \\fileserver\documents  → Aktueller Benutzer        │
│  └─ Z: \\nas\daten             → Nur lesen                │
├─────────────────────────────────────────────────────────────┤
│  WIFI-PROFILE                                               │
│  ├─ MeinWLAN    WPA2  ✓ Passwort sichtbar                  │
│  ├─ GastNetz    Open  -                                    │
│  └─ Büro5GHz    WPA3  ✓ Passwort sichtbar                  │
└─────────────────────────────────────────────────────────────┘
```

**Funktionen:**

| Funktion | Beschreibung | Admin nötig? |
|----------|--------------|--------------|
| Netzwerkadapter | Auflistung aller Adapter mit IPs | ❌ Nein |
| DNS-Server | Aktuelle DNS-Konfiguration | ❌ Nein |
| Netzlaufwerke | Verbundene Netzwerklaufwerke | ❌ Nein |
| WiFi-Profile | Gespeicherte WiFi-Netze inkl. Passwörter | ⚠️ Ja |
| Firewall-Regeln | Grundregeln der Windows Firewall | ⚠️ Ja |

### 4.5 Software

```
┌─────────────────────────────────────────────────────────────┐
│  INSTALLIERTE SOFTWARE                     [Export CSV]    │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Name              │ Version    │ Installiert │ Größe │  │
│  ├─────────────────────────────────────────────────────┤  │
│  │ Microsoft 365 E3  │ 2412...   │ 01.01.2025 │ 2.1GB │  │
│  │ Google Chrome     │ 126.0...  │ 15.03.2025 │ 250MB │  │
│  │ Adobe Acrobat DC  │ 24.002... │ 20.05.2024 │ 890MB │  │
│  │ 7-Zip             │ 24.06     │ 12.11.2023 │  15MB │  │
│  └─────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  BETRIEBSSYSTEM-PAKETE                                      │
│  ├─ .NET Framework 4.8: Installiert                        │
│  ├─ Visual C++ Redistributables: Installiert               │
│  └─ Java 8 Update 411: NICHT installiert                   │
└─────────────────────────────────────────────────────────────┘
```

**Funktionen:**

| Funktion | Beschreibung | Admin nötig? |
|----------|--------------|--------------|
| Software-Inventarisierung | Name, Version, Installationsdatum, Größe | ❌ Nein |
| Betriebssystem-Pakete | .NET, VC++, Java | ❌ Nein |
| Browser-Plugins | Chrome Extensions, Firefox Addons | ❌ Nein |
| Deinstallations-Befehl | Kopierbaren Uninstall-String generieren | ❌ Nein |

### 4.6 Tools

```
┌─────────────────────────────────────────────────────────────┐
│  DIAGNOSE-WERKZEUGE                                          │
│                                                             │
│  [🔍 System-Scan]     [📋 Clipboard]     [💾 Vault-Backup] │
│                                                             │
│  [🔑 WiFi-Passwörter]  [⏱️ Uptime-Test]   [📦 Treiber-Export]│
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  KONSOLEN-TOOLS                                              │
│                                                             │
│  [🔲 Ping]    [🌐 Traceroute]   [🔄 DNS-Lookup]           │
│  [📡 Netstat] [📋 ARP-Tabelle]   [🔍 Port-Scan]           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Diagnose-Werkzeuge:**

| Werkzeug | Beschreibung |
|----------|--------------|
| System-Scan | Vollständiger System-Scan (alle Tabs) |
| Clipboard | Inhalt der Zwischenablage anzeigen/kopieren |
| Vault-Backup | Vault komprimiert als ZIP sichern |
| WiFi-Passwörter | WiFi-Profile inkl. Passwörter anzeigen |
| Uptime-Test | Zeit seit letztem Neustart |
| Treiber-Export | Installierte Treiber auflisten |

**Konsolen-Tools:**

| Werkzeug | Beschreibung |
|----------|--------------|
| Ping | Host anpingen mit Ergebnissen |
| Traceroute | Route zum Host verfolgen |
| DNS-Lookup | DNS-Einträge abfragen |
| Netstat | Offene Ports und Verbindungen |
| ARP-Tabelle | ARP-Cache anzeigen |
| Port-Scan | Bestimmte Ports auf localhost prüfen |

---

## 5. Technologie-Stack

### 5.1 Programmiersprache: Go

| Kriterium | Bewertung |
|-----------|-----------|
| Kompilierte Binary | ✅ Eine .exe-Datei pro Plattform |
| Geringe AV-Fehlalarme | ✅ Go-Binaries werden seltener als Python geflaggt |
| Klein Binary (~10-15MB) | ✅ Deutlich kleiner als PyInstaller (~100MB+) |
| Schnelle Kompilierung | ✅ Build-Times in Sekunden statt Minuten |
| Cross-Platform | ✅ Linux, macOS, Windows aus einer Codebasis |
| System-API-Zugriff | ✅ packages.os, syscall, golang.org/x/sys/* |

### 5.2 Framework: Wails

| Komponente | Technologie |
|------------|-------------|
| Frontend | HTML5 + CSS3 + Vanilla JavaScript (oder Vue/React optional) |
| Backend | Go |
| Runtime | WebView2 (Windows), systemeigener WebKit (Mac/Linux) |
| Bindings | Wails generiert TypeScript-Bindings aus Go-Funktionen |

### 5.3 Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                      AdminKit.exe                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Frontend                          │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────────────┐ │   │
│  │  │  HTML/CSS  │ │  JavaScript│ │  Wails-Bindings  │ │   │
│  │  │   (UI)    │ │  (Logic)  │ │  (TypeScript)    │ │   │
│  │  └───────────┘ └───────────┘ └───────────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                     Wails IPC                               │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Backend (Go)                     │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────────────┐ │   │
│  │  │  System/  │ │  Network/ │ │    Vault/         │ │   │
│  │  │  Hardware │ │  WiFi     │ │    Storage        │ │   │
│  │  └───────────┘ └───────────┘ └───────────────────┘ │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────────────┐ │   │
│  │  │ Software/ │ │  Printer/ │ │    Export/        │ │   │
│  │  │ Inventory │ │  Config   │ │    Generator      │ │   │
│  │  └───────────┘ └───────────┘ └───────────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Go-Packages (Auswahl)

| Package | Verwendung |
|---------|------------|
| `github.com/wailsapp/wails/v3` | Wails v3 Framework |
| `github.com/go-ole/go-ole` | Windows COM/OLE für WMI |
| `github.com/matishsengo/hwinfo` | Hardware-Informationssammlung |
| `github.com/diskfs/go-diskfs` | SMART-Daten auslesen |
| `github.com/go-yaml/yaml/v3` | YAML-Konfiguration lesen/schreiben |
| `github.com/skip2/go-qrcode` | QR-Codes für WLAN-generieren |
| `github.com/charmbracelet/glamour` | Markdown-Rendering im Export |

---

## 6. Datenverarbeitung & Sicherheit

### 6.1 Datenschutzprinzip

| Prinzip | Umsetzung |
|---------|-----------|
| **Lokal** | Keine Daten verlassen das System ohne expliziten Export |
| **Kein Upload** | Keine Cloud-Anbindung, kein Telemetrie |
| **Klarer Speicherort** | Logs und Daten nur dort, wo der Techniker es möchte |

### 6.2 Log-Speicherung

```
Log-Speicherung (priorisiert):

1. Vault/logs/adminkit.log       # Auf USB-Stick (wenn Schreibrechte)
       ↓ (Fallback)
2. Vom Techniker wählbarer Ordner
       ↓ (Fallback)
3. System-Temp (als letztes Mittel)
```

**Konfigurierbar in config.yaml:**

```yaml
logging:
  level: "info"                  # "debug", "info", "warn", "error"
  location: "vault"             # "vault", "custom", "system_temp"
  custom_path: ""               # Pfad wenn location = "custom"
  max_size_mb: 10               # Maximale Log-Größe bevor Rotation
```

### 6.3 Sensible Daten

| Datentyp | Gespeichert? | Verschlüsselt? | Export? |
|----------|--------------|----------------|---------|
| WiFi-Passwörter | ✅ Auf Wunsch | ❌ v1.0 | ✅ als Markdown |
| Benutzer-Passwörter | ❌ Nie | - | - |
| Lizenzschlüssel | ✅ (wenn sichtbar) | ❌ v1.0 | ✅ |
| Netzwerk-Konfiguration | ✅ | ❌ | ✅ |
| System-Specs | ✅ | ❌ | ✅ |

### 6.4 Verschlüsselung

> **Status v1.0:** Unverschlüsselt  
> **Optionen für spätere Versionen:**
> - Integriertes verschlüsseltes Vault (GPG oder AES)
> - Separate verschlüsselte Partition auf USB-Stick
> - Integration mit Hardware-Tokens

---

## 7. Benutzeroberfläche

### 7.1 Design-Prinzipien

| Prinzip | Beschreibung |
|---------|--------------|
| **Funktional vor Form** | Klare, übersichtliche Oberfläche. Kein Schnickschnack. |
| **Dunkel/Hell-Modus** | Systempräferenz übernehmen oder manuell wählen |
| **Responsive** | Funktioniert auf kleinen Laptops (1366x768) bis 4K-Monitoren |
| **Barrierefrei** | Mindestens Kontrastverhältnis 4.5:1 |
| **Deutsch & Englisch** | Sprachauswahl in config.yaml |

### 7.2 Farbschema (Vorschlag)

```
Hell-Modus:
  Primary:     #2563EB (Blau)
  Secondary:    #64748B (Slate)
  Success:      #16A34A (Grün)
  Warning:      #CA8A04 (Gelb)
  Error:        #DC2626 (Rot)
  Background:   #FFFFFF
  Surface:      #F8FAFC
  Text:         #1E293B

Dunkel-Modus:
  Primary:      #3B82F6
  Secondary:     #94A3B8
  Success:       #22C55E
  Warning:       #EAB308
  Error:         #EF4444
  Background:    #0F172A
  Surface:       #1E293B
  Text:          #F1F5F9
```

### 7.3 Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  🛠️ AdminKit              [Vault: MeinKunde]    [⚙️] [🌙] [📤] │
├──────────────────────────────────────────────────────────────────┤
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │
│  │Dashboard│ │ System │ │Netzwerk│ │Software│ │ Tools  │        │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │                    Tab-Inhalt                              │ │
│  │                                                            │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Status: Bereit          Session: KundeXYZ    [🔄 Aktuali.]│ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. Backup & Export

### 8.1 System-Backup (Vollständige Spezifikationen)

```
Backup-Inhalt:
├─ system/
│   ├─ hardware.json        # CPU, RAM, Motherboard
│   ├─ os.json             # Windows-Version, Updates
│   ├─ smart.json          # SMART-Daten aller Festplatten
│   ├─ security.json       # Defender, Firewall, BitLocker
│   └─ users.json          # Lokale Benutzerkonten
├─ network/
│   ├─ interfaces.json     # Netzwerkadapter
│   ├─ shares.json         # Netzlaufwerke
│   ├─ wifi.json           # WiFi-Profile + Passwörter
│   └─ dns.json            # DNS-Server
├─ software/
│   └─ installed.json      # Installierte Programme
├─ printers/
│   └─ configured.json     # Drucker-Konfiguration
└─ metadata.json           # Timestamp, Hostname, Operator
```

### 8.2 Export-Formate

| Format | Beschreibung | Anwendungsfall |
|--------|--------------|----------------|
| **Interaktive HTML** | Vollständig klickbar, mit Farben und Icons | Schnelle Übersicht beim Kunden |
| **Markdown (.md)** | Vault-kompatibel, in Obsidian öffenbar | Dokumentation, Git-Tracking |
| **CSV** | Tabellenformat für Excel/Import | Software-Inventarisierung |
| **JSON** | Rohdaten für weitere Verarbeitung | API-Integration, eigene Tools |
| **PDF** | Druckfertiges Dokument | Kundenübergabe, Archivierung |

### 8.3 Interaktive HTML-Export

Der HTML-Export ist das Flagship-Feature für schnelle Übersichten:

```html
┌──────────────────────────────────────────────────────────────────┐
│  🖥️ SYSTEM BERICHT                                             │
│  ════════════════════════════════════════════════════════════════│
│  Hostname:    KUNDE-PC                              [🔄 Refresh]│
│  OS:          Windows 11 Pro 23H2                   [📅 19.06.26]│
│  Uptime:      3 Tage, 7 Stunden                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │ 🟢 Hardware      │  │ 🟢 Betriebssystem│                      │
│  │ CPU: i7-10700   │  │ Version: 23H2    │                      │
│  │ RAM: 32 GB      │  │ Updates: Aktuell│                      │
│  └─────────────────┘  └─────────────────┘                      │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │ 🟢 SMART         │  │ 🟢 Netzwerk      │                      │
│  │ SSD: 98% OK     │  │ LAN: Verbunden  │                      │
│  │ HDD: ⚠️ WARNUNG │  │ WiFi: 3 Profile │                      │
│  └─────────────────┘  └─────────────────┘                      │
│                                                                  │
│  ┌──────────────────────────────────────────────┐              │
│  │ 📦 SOFTWARE (24 Programme)        [Mehr ▼]  │              │
│  │ ┌──────────────────────────────────────────┐ │              │
│  │ │ 1. Microsoft 365 E3        2.1 GB       │ │              │
│  │ │ 2. Google Chrome           250 MB        │ │              │
│  │ │ 3. Adobe Acrobat DC        890 MB        │ │              │
│  │ └──────────────────────────────────────────┘ │              │
│  └──────────────────────────────────────────────┘              │
│                                                                  │
│  [📥 Exportieren als: HTML] [MD] [CSV] [PDF]                   │
└──────────────────────────────────────────────────────────────────┘
```

**Features des HTML-Exports:**

| Feature | Beschreibung |
|---------|--------------|
| **SMART-Details** | Klickbare Festplatten mit Temperatur, Reallocated Sectors, Power-On Hours |
| **Farbcodierung** | Rot/Gelb/Grün basierend auf Status |
| **Filter & Sortierung** | Software nach Größe, Name, Datum sortierbar |
| **QR-Code** | WiFi-QR-Code generieren für schnelle WLAN-Freigabe |
| **Responsive** | Funktioniert auf Tablet und Smartphone |
| **Druckbar** | Optimiertes CSS für Print-Medium |

### 8.4 SMART-Informationen (Detail)

```
┌─────────────────────────────────────────────────────────────┐
│  SMART: Samsung 980 PRO 1TB (NVMe)                        │
├─────────────────────────────────────────────────────────────┤
│  Overall Health:  🟢 OK                                   │
│  Temperature:     42°C                                    │
│  Power-On Hours:  8,432 (ca. 351 Tage)                    │
├─────────────────────────────────────────────────────────────┤
│  Attribut          Rohwert   Thresh.  Status              │
│  ──────────────────────────────────────────────            │
│  Reallocated Sectors  0       10      🟢 OK               │
│  Power Cycle Count   1,247   --      🟢 OK               │
│  Total Writes        45.2 TB --      🟢 OK               │
│  Available Spare     100%    10%     🟢 OK               │
│  SSD Life Left       98%     10%     🟢 OK               │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Logging & Fehlerbehandlung

### 9.1 Log-Level

| Level | Verwendung | Ausgabe |
|-------|------------|---------|
| `debug` | Entwicklungsmodus, sehr detailliert | Alle Funktionsaufrufe, Variablen-Werte |
| `info` | Normalbetrieb | Wichtige Aktionen, Scan-Ergebnisse |
| `warn` | Warnungen | Fehlende Adminrechte, unvollständige Scans |
| `error` | Fehler | Systemfehler, Ausnahmesituationen |

### 9.2 Log-Format

```
[2026-06-19 07:34:15] INFO  [System] Hardware-Scan abgeschlossen
[2026-06-19 07:34:16] INFO  [System] CPU: Intel Core i7-10700 (8 Kerne)
[2026-06-19 07:34:16] INFO  [System] RAM: 32 GB DDR4
[2026-06-19 07:34:17] WARN  [Network] WiFi-Passwörter: Adminrechte erforderlich
[2026-06-19 07:34:18] INFO  [Vault] Session 'KundeXYZ' erstellt
[2026-06-19 07:34:20] ERROR [SMART] Festplatte WD Blue: Read Error Rate (Critical)
```

### 9.3 Fehlerbehandlung

| Situation | Reaktion |
|-----------|----------|
| Adminrechte fehlen | Gelbe Warnung anzeigen, Funktion mit eingeschränktem Ergebnis ausführen |
| WMI nicht verfügbar | Fallback auf registry-basierte Abfragen |
| SMART nicht lesbar | "Nicht verfügbar" anzeigen, kein Hard-Fehler |
| Vault nicht beschreibbar | Fallback-Pfad anbieten, Warnung anzeigen |
| Externe Datei fehlt | Graceful degradation, Feature deaktivieren |

---

## 10. Entwicklungsphasen

### Phase 1: Fundament (Grundstruktur)

**Ziel:** Lauffähige Basis-Anwendung

| Aufgabe | Beschreibung |
|---------|--------------|
| Go + Wails Setup | Projektstruktur, Build-Pipeline |
| Basis-UI | Tab-Navigation, Dashboard-Layout |
| Vault-Initialisierung | Ordnerstruktur, config.yaml |
| Logging-System | Log-Level, Datei-Rotation |
| Konfigurations-GUI | Sprache, Theme, Pfade |

**Deliverable:** AdminKit.exe, das startet und Grundstruktur zeigt

---

### Phase 2: System-Scan

**Ziel:** Vollständige Hardware- und OS-Erfassung

| Aufgabe | Beschreibung |
|---------|--------------|
| Hardware-Erfassung | CPU, RAM, Motherboard, GPU |
| OS-Details | Version, Build, Updates |
| SMART-Auslesen | Festplatten-Gesundheit |
| Benutzer-Liste | Lokale Konten |

**Deliverable:** System-Tab vollständig funktionsfähig

---

### Phase 3: Netzwerk-Scan

**Ziel:** Netzwerk- und WiFi-Erfassung

| Aufgabe | Beschreibung |
|---------|--------------|
| Netzwerkadapter | Auflistung aller Adapter |
| IP-Konfiguration | IPv4/IPv6, DNS, Gateway |
| Netzlaufwerke | Verbundene Netzfreigaben |
| WiFi-Profile | SSIDs, Passwörter (mit Adminrechten) |

**Deliverable:** Netzwerk-Tab vollständig funktionsfähig

---

### Phase 4: Software-Inventarisierung

**Ziel:** Vollständige Software-Erfassung

| Aufgabe | Beschreibung |
|---------|--------------|
| Software-Liste | Alle installierten Programme |
| OS-Pakete | .NET, VC++, Java |
| Deinstallations-Infos | Uninstall-Strings sammeln |

**Deliverable:** Software-Tab vollständig funktionsfähig

---

### Phase 5: Tools & Konsolen-Tools

**Ziel:** Werkzeuge und Diagnose-Funktionen

| Aufgabe | Beschreibung |
|---------|--------------|
| System-Scan Button | Alle Scans auf einmal |
| Konsolen-Tools | Ping, Traceroute, Netstat |
| Clipboard-Tool | Zwischenablage anzeigen |
| Vault-Backup | ZIP-Export der Vault |

**Deliverable:** Tools-Tab vollständig funktionsfähig

---

### Phase 6: Export-System

**Ziel:** Alle Export-Formate funktionsfähig

| Aufgabe | Beschreibung |
|---------|--------------|
| HTML-Export | Interaktiver Bericht |
| Markdown-Export | Vault-kompatible Dateien |
| CSV-Export | Für Tabellenkalkulation |
| JSON-Export | Rohdaten |
| PDF-Export | Druckfertiges Dokument |

**Deliverable:** Export-Funktionen für alle Formate

---

### Phase 7: macOS-Port

**Ziel:** Funktionsfähige macOS-Version

| Aufgabe | Beschreibung |
|---------|--------------|
| macOS-Build | Go + Wails für macOS |
| System-APIs | Apple System Profiler |
| Keychain-Zugriff | WiFi-Passwörter aus Keychain |
| SMART | Festplatten-Gesundheit |

**Deliverable:** AdminKit.app für macOS

---

### Phase 8: Linux-Port (optional)

**Ziel:** Funktionsfähige Linux-Version

| Aufgabe | Beschreibung |
|---------|--------------|
| Linux-Build | Go + Wails für Linux |
| /proc-Analyse | Hardware-Erfassung über /proc |
| Network-Manager | WiFi-Profile aus NM |

**Deliverable:** AdminKit für Linux

---

## Anhang

### A. Dateistruktur (final)

```
AdminKit/
├── AdminKit.exe              # Windows-Binary
├── AdminKit.app             # macOS-Bundle
├── adminkit                  # Linux-Binary
│
├── resources/               # Frontend-Assets
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
└── adminkit_vault/          # Daten-Vault (wird bei Erststart erstellt)
    ├── config.yaml
    ├── data/
    ├── exports/
    └── logs/
```

### B. Build-Befehle

```bash
# Windows
wails build -platform windows/amd64 -name AdminKit

# macOS
wails build -platform darwin/arm64 -name AdminKit

# Linux
wails build -platform linux/amd64 -name adminkit
```

### C. Glossary

| Begriff | Definition |
|---------|------------|
| **Vault** | Ordnerstruktur für alle Daten nach Obsidian.md-Prinzip |
| **Wails** | Framework zur Erstellung von Desktop-Apps mit Go + Web-Frontend |
| **SMART** | Self-Monitoring, Analysis and Reporting Technology |
| **Vibe Coding** | KI-gestützte Softwareentwicklung mit Claude Code o.ä. |

---

## Nächste Schritte

1. ✅ **Konzept finalisieren** — Dieses Dokument
2. 🟡 **Technische Spezifikation** — Detaillierte API/Interface-Definitionen
3. 🟡 **Prototyp entwickeln** — Phase 1 in Angriff nehmen
4. 🟡 **Iteration & Testing** — Außendienst-Tests beim Kunden

---

*Dieses Dokument dient als Grundlage für die Entwicklung mit Claude Code (Vibe Coding). Alle Kernentscheidungen sind getroffen und können direkt in die Implementierung überführt werden.*
