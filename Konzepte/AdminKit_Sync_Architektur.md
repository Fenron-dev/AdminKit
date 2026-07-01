# AdminKit — Sync & Hub-Architektur

> **Version:** 1.0  
> **Datum:** 25. Juni 2026  
> **Status:** Konzept / geplant

---

## Inhaltsverzeichnis

1. [Ziel & Motivation](#ziel--motivation)
2. [Drei-Stufen-Architektur](#drei-stufen-architektur)
3. [Warum Self-hosted statt SaaS](#warum-self-hosted-statt-saas)
4. [Technologie-Stack](#technologie-stack)
5. [Datenmodell](#datenmodell)
6. [REST-API](#rest-api)
7. [Pairing & Authentifizierung](#pairing--authentifizierung)
8. [USB-Stick-Portabilität](#usb-stick-portabilität)
9. [Air-Gap / Quarantäne-Geräte](#air-gap--quarantäne-geräte)
10. [Kunden- und Geräteverwaltung](#kunden--und-geräteverwaltung)
11. [Implementierungs-Phasen](#implementierungs-phasen)
12. [Sicherheit](#sicherheit)
13. [Bekannte Limitierungen](#bekannte-limitierungen)

---

## Ziel & Motivation

AdminKit wird bisher rein lokal betrieben. Für das Kunden-Inventar-Feature brauchen wir eine Möglichkeit, dass mehrere Techniker ihre Scan-Sessions zentral zusammenführen — um eine Flotten-Übersicht je Kunde zu erstellen, Trends zu erkennen und IT-Dokumentationen geräteübergreifend zu pflegen.

Anforderungen:
- **Offline-first**: Das Tool muss ohne Netzwerk voll funktionieren
- **LAN-Sync**: Sessions zwischen Techniker-Geräten im selben Netzwerk synchronisieren
- **Online-Option**: Optionaler zentraler Server (VPS/NAS) für standortübergreifende Teams
- **Portierbarkeit**: USB-Stick-Betrieb muss erhalten bleiben
- **Air-Gap**: Scan auf verdächtigen/isolierten Geräten ohne Netzwerkverbindung

---

## Drei-Stufen-Architektur

### Stufe 1 — Offline (bereits vorhanden, bleibt unverändert)
AdminKit läuft vollständig ohne Netzwerk. Vault ist lokal. Kein Sync. Für alle Szenarien, in denen kein Hub benötigt wird.

### Stufe 2 — LAN Hub (eingebetteter Server, kein externes Backend)
Eine AdminKit-Instanz startet einen leichten Go-HTTP-Server im Hintergrund ("Hub Mode"). Andere Instanzen im selben Netzwerk verbinden sich über mDNS-Discovery oder manuelle IP-Eingabe, pushen ihre Sessions und können die Fleet-Übersicht abrufen.

```
Techniker A (Laptop)          Techniker B (USB-Stick)
  AdminKit [Hub Mode]    ←→     AdminKit [Client Mode]
  Port 8767, mDNS              auto-discover via mDNS
  Sessions lokal               Sessions → push an Hub
  Fleet-Übersicht              Fleet-Übersicht via Hub
```

### Stufe 3 — Online Hub (separates Go-Binary, deploybar auf VPS/NAS)
Ein eigenständiges `adminkit-hub`-Binary (ohne Wails/GUI), das als Dienst oder Docker-Container läuft. Gleiche REST-API wie Stufe 2, aber mit HTTPS und erreichbar von überall.

```
                  ┌─────────────────────┐
                  │  adminkit-hub       │
                  │  (VPS / NAS / Pi)   │
                  │  HTTPS :443         │
                  └──────┬──────────────┘
          ┌──────────────┼──────────────┐
    Techniker A     Techniker B    Techniker C
    (Büro)          (Homeoffice)   (Vor-Ort USB)
```

---

## Warum Self-hosted statt SaaS

| Kriterium | Self-hosted Hub | Supabase / Firebase |
|---|---|---|
| Offline funktionsfähig | ✅ | ❌ |
| Datenschutz (Kundendaten!) | ✅ vollständig lokal | ⚠️ Daten in US-Cloud |
| Kein Internet erforderlich | ✅ | ❌ |
| DSGVO-konform out-of-the-box | ✅ | aufwändig |
| Betriebskosten | gering (eigener Server) | monatlich |
| Kontrolle über Daten | ✅ vollständig | ❌ |

→ **Self-hosted Hub** ist die einzig vertretbare Wahl für IT-Dienstleister, die Kundendaten verwalten.

---

## Technologie-Stack

| Komponente | Technologie | Begründung |
|---|---|---|
| HTTP-Server | `net/http` stdlib | bereits durch Wails genutzt, kein Extra-Framework |
| JWT | `github.com/golang-jwt/jwt/v5` | kleines, bewährtes Paket |
| mDNS Advertise/Discover | `github.com/grandcat/zeroconf` | reines Go, kein CGo, cross-compile-fähig |
| SQLite (Hub-Datenbank) | `modernc.org/sqlite` | kein CGo → GitHub CI cross-compile funktioniert |
| TLS (Online) | stdlib `crypto/tls` + self-signed oder Let's Encrypt | |
| Session-Format | bestehende JSON-Snapshots (Vault-Format unverändert) | kein Umbau bestehender Daten nötig |
| Bundle-Format | ZIP → `.adminkit` | Offline-Transfer, portabel |

> **Inspiration:** Das P2P-Muster wurde direkt von `pomtechflow_mobile` und `MindFeed_Mobile` (Flutter) übernommen — portiert von Dart/Shelf auf Go/net-http. Die Kern-Konzepte (embedded server, mDNS, JWT pairing, pull→push sync) sind identisch.

---

## Datenmodell

AdminKit hat **keine Sync-Konflikte**: jede Session ist ein einmaliger Scan eines bestimmten Geräts zu einem bestimmten Zeitpunkt. Sync = Upload + Download kompletter Session-Snapshots. Kein Merge nötig.

**Hub-Speicherstruktur** (identisch zum lokalen Vault-Format):
```
hub_vault/
  sessions/
    Musterfirma_GmbH/
      20260620_Empfang-PC/
        system.json
        network.json
        software.json
        meta.json        ← Techniker, Scan-Zeit, Source-DeviceID, Alias
        ...
      20260618_Buchhaltung-PC/
        ...
    Andere_Firma_GmbH/
      ...
  clients/
    musterfirma_gmbh.yaml   ← Kundenprofil
    andere_firma.yaml
  devices.json              ← registrierte Techniker-Geräte (deviceId, Name, lastSeen)
  config.yaml               ← Hub-Konfiguration
```

**Session-Identität:** `deviceId + sessionName` → global eindeutig, kein Konflikt möglich.

---

## REST-API

Identisch für LAN- und Online-Hub:

```
GET  /health
     → {"status":"ok","version":"1.x","sessionCount":42}

POST /api/pairing/claim
     Body: {"pin":"123456","deviceId":"uuid","deviceName":"Dennis-Stick"}
     → {"accessToken":"...","refreshToken":"..."}

POST /api/pairing/refresh
     → {"accessToken":"..."}

GET  /api/sessions
     → Liste aller Sessions mit Meta-Infos (für Fleet-Übersicht)

POST /api/sessions/{id}/snapshots/{key}
     → Snapshot hochladen (system, network, software, ...)

GET  /api/sessions/{id}/snapshots/{key}
     → Snapshot abrufen

POST /api/sessions/import
     → .adminkit-Bundle hochladen (Air-Gap-Import)

GET  /api/fleet
     → Aggregierte Fleet-Übersicht (Health-Scores, gruppiert nach Kunde)

GET  /api/clients
     → Kundenliste (für Dropdown in "Neue Session")

POST /api/clients
     → Neuen Kunden anlegen

GET  /api/nudge
     → Polling: Hat sich seit lastCheck etwas geändert? (push notification ohne WebSocket)
```

**Auth:** Bearer JWT in `Authorization`-Header bei allen `/api/*`-Routen. Automatischer Token-Refresh bei 401.

---

## Pairing & Authentifizierung

Portiert von `pomtechflow_mobile` auf Go:

```
Hub                              AdminKit Desktop
 │                                      │
 │─── Generiert 6-stelligen PIN ────────│
 │    (5 min gültig, einmalig)          │
 │                                      │
 │←── POST /api/pairing/claim ──────────│
 │    {pin, deviceId, deviceName}       │
 │                                      │
 │─── Access Token (24h) ───────────────│
 │    Refresh Token (7d)                │
 │                                      │
 │    ← alle weiteren Calls mit         │
 │      Bearer Token im Header →        │
 │                                      │
 │←── POST /api/pairing/refresh ────────│  (wenn 401)
 │─── neuer Access Token ───────────────│
```

**Token-Speicherung:** In `config.yaml` auf dem Gerät/Stick unter `sync.access_token` / `sync.refresh_token` — nie im Git, keine Hardcoded-Secrets.

**JWT-Signing-Key:** 256-bit Zufallsschlüssel, beim ersten Hub-Start generiert, im Hub-Vault gespeichert.

---

## USB-Stick-Portabilität

AdminKit auf einem USB-Stick findet den Hub **ohne manuelle Konfiguration** wieder:

1. **Gespeicherter Host**: Letzter Hub-Hostname/Port bleibt in `config.yaml` auf dem Stick
2. **mDNS-Discovery**: Selbst wenn sich die IP des Hub-Rechners geändert hat, wird er über `_adminkit._tcp` neu gefunden — kein re-pairing nötig
3. **Token-Persistenz**: Access + Refresh Token bleiben auf dem Stick. Automatischer Refresh wenn nötig
4. **Online-Hub**: Verbindet sich direkt über Domain — keine IP-Probleme

→ **Workflow:** Stick einstecken → AdminKit starten → Hub automatisch verbunden. Keine Nutzeraktion.

> **Hinweis:** Das Gerät, an dem der Stick steckt, muss im selben Netzwerk wie der Hub sein (LAN) oder Internetzugang haben (Online-Hub).

---

## Air-Gap / Quarantäne-Geräte

Für Geräte mit Verdacht auf Infektion: kein Netzwerk, kein Push zum Hub möglich. Lösung: **Offline Session Bundle Export/Import**.

### Workflow

```
Verdächtiges Gerät (kein Netzwerk)     Sauberes Gerät (mit Hub)
                                         
  Quarantäne-Stick                       Haupt-Stick oder
  (kein Hub-Token!)                      beliebiges AdminKit
       │                                        │
  AdminKit starten                              │
  Scan durchführen                              │
       │                                        │
  "Als Bundle exportieren"                      │
  → session_20260625_Kunde_Gerät.adminkit       │
       │                                        │
  USB-Stick physisch wechseln ────────────────→ │
                                         "Bundle importieren"
                                         → Session in Fleet
                                         → "Extern importiert"-Badge
```

### Bundle-Format (`.adminkit`)

ZIP-Archiv mit allen Session-Snapshots:
```
session_20260625_MusterFirma_Empfang-PC.adminkit
  ├── meta.json     ← Kunde, Alias, Hostname, Scan-Zeit, AdminKit-Version, DeviceID
  ├── system.json
  ├── network.json
  ├── software.json
  └── ...
```

### Neue Funktionen
- `ExportSessionBundle(sessionPath)` → ZIP → `.adminkit`-Datei auf Datenträger
- `ImportSessionBundle(filePath)` → entpacken → in Hub/lokalen Vault importieren

### Quarantäne-Stick Best Practice
- Günstiger zweiter USB-Stick, nur für verdächtige Geräte
- **Keine Hub-Credentials** auf diesem Stick (extra `config.yaml` ohne `sync.*`-Felder)
- Nach Import: Bundle-Datei vom Stick löschen
- UI-Hinweis beim Import: *"Session wurde von einem externen Gerät importiert — VirusTotal-Scan empfohlen."*

---

## Kunden- und Geräteverwaltung

OS-Hostnamen (`Desktop-GES3234SW`) und Benutzernamen (`Nutzer`) sind technisch korrekt aber für die Dokumentation unbrauchbar. Lösung: **Zwei-Ebenen-Namensgebung** beim Session-Start.

### Erweiterter "Neue Session"-Dialog

```
┌──────────────────────────────────────────┐
│  Neue Session                            │
│                                          │
│  Kunde:        [Musterfirma GmbH    ▾]   │  ← Dropdown aus Kundenliste
│                [+ Neuen Kunden anlegen]  │
│                                          │
│  Gerät-Alias:  [Empfang-PC          ]   │  ← Frei-Text
│  Standort:     [EG Büro 3           ]   │  ← Optional
│  Techniker:    Dennis M.                 │  ← aus config.yaml
│                                          │
│  ─────────────────────────────────────   │
│  Erkannter Hostname: Desktop-GES3234SW   │  ← Info, nicht editierbar
│  Angemeldeter Nutzer: Nutzer             │  │
│  ─────────────────────────────────────   │
│                                          │
│              [Abbrechen]  [Starten →]    │
└──────────────────────────────────────────┘
```

**Session-Ordnername:** `YYYYMMDD_KundenName_GerätAlias`  
(Vorher: `YYYYMMDD_Hostname` → oft nichtssagend)

### Kundenprofil (`vault/clients/musterfirma_gmbh.yaml`)

```yaml
id: "550e8400-e29b-41d4-a716-446655440000"
name: "Musterfirma GmbH"
short_name: "Musterfirma"
contact_name: "Max Muster"
contact_email: "it@musterfirma.de"
notes: "VPN: 192.168.10.x/24 — Ansprechpartner Buchhaltung: Maria M."
created_at: "2026-01-15"
```

### Fleet-Übersicht (gruppiert nach Kunde)

```
┌─ Musterfirma GmbH ─────────────── 5 Geräte ──────────────────────┐
│  Empfang-PC          ✅  92/100   letzter Scan: 20.06.2026        │
│  Buchhaltung-PC      ⚠️  71/100   letzter Scan: 18.06.2026        │
│  Server-Raum NAS     ✅  88/100   letzter Scan: 22.06.2026        │
│  Geschäftsführer-NB  ✅  95/100   letzter Scan: 19.06.2026        │
│  Drucker-PC          🔴  45/100   letzter Scan: 10.06.2026  ⚠️ alt│
└────────────────────────────────────────────────────────────────────┘

┌─ Andere Firma AG ──────────────── 2 Geräte ──────────────────────┐
│  ...                                                              │
└───────────────────────────────────────────────────────────────────┘
```

**Kundenliste via Hub synchronisiert** → alle Techniker haben denselben Kunden-Dropdown.

---

## Implementierungs-Phasen

### Phase A — Config + Go-Pakete (kein UI)

- `internal/config/config.go` — neues `Sync`-Struct + `Customer`-Struct
- `internal/hub/server.go` — HTTP-Server starten/stoppen
- `internal/hub/auth.go` — JWT + PIN-Verwaltung
- `internal/hub/routes.go` — API-Endpoints
- `internal/hub/store.go` — Session-Storage (Dateisystem)
- `internal/hub/mdns.go` — mDNS advertise via `grandcat/zeroconf`
- `internal/sync/client.go` — HTTP-Client (push, pull, health)
- `internal/sync/discovery.go` — mDNS-Discovery (browse)
- `internal/sync/bundle.go` — Export/Import `.adminkit`-Bundle

### Phase B — Desktop-Integration

Neue `app.go`-Methoden:
```go
StartHub() error
StopHub()
GetHubStatus() HubStatus
GetHubPairingCode() string
PairWithHub(host, port, pin string) error
PushSessionToHub(sessionPath string) error
GetFleetOverview() (*fleet.Overview, error)
DiscoverHubs() []HubInfo
ExportSessionBundle(sessionPath string) (string, error)
ImportSessionBundle(filePath string) error
GetClients() []config.Customer
SaveClient(customer config.Customer) error
```

- Settings: Sektion "Synchronisierung" (Rolle, Pairing, Status)
- "Neue Session"-Dialog: Kunde + Alias + Standort
- Wails-Stubs in `frontend/wailsjs/go/main/App.js`

### Phase C — Fleet-Übersicht (neuer Tab)

- `internal/fleet/overview.go` — `BuildOverview()` aggregiert Sessions zu Health-Scores
- Frontend: Tab "Flotte" mit Kunden-Gruppen, Device-Cards, Health-Badges
- Nur sichtbar wenn Hub oder Client aktiv

### Phase D — AdminKit Hub Binary (standalone, optional)

- `cmd/adminkit-hub/main.go` — eigenständiges Binary ohne Wails
- Gleiche `internal/hub/`-Pakete werden wiederverwendet
- HTTPS: eingebauter self-signed Cert-Generator + optionales Let's Encrypt
- `Dockerfile` + `docker-compose.yml` für VPS-Deployment
- `hub-config.yaml` für Konfiguration ohne GUI

---

## Sicherheit

### LAN-Modus
- JWT-Signing-Key: 256-bit random, beim ersten Hub-Start generiert, im Vault gespeichert
- PIN: 5-Minuten-TTL, einmalig verwendbar, max. 10 Versuche/Minute
- Hub lauscht nur wenn explizit aktiviert (nicht automatisch beim App-Start)
- Windows: Firewall-Prompt beim ersten Start → klarer Hinweis vorab

### Online-Modus
- **TLS Pflicht** — kein HTTP erlaubt bei Remote-Verbindungen
- Rate-Limiting auf `/api/pairing/claim`
- Empfehlung: Caddy oder nginx als Reverse Proxy (automatisches HTTPS)
- Kundendaten verlassen das Gerät nur verschlüsselt (TLS)

### Was AdminKit NICHT speichert
- Keine Passwörter von Kundengeräten
- Keine WLAN-Schlüssel (deaktivierbar in Einstellungen)
- Keine Screenshots oder Dateiinhalte

---

## Bekannte Limitierungen

| Limitierung | Auswirkung | Lösung |
|---|---|---|
| mDNS auf manchen Corporate-Netzwerken blockiert | Auto-Discovery schlägt fehl | Fallback: manuelle IP-Eingabe |
| Wails öffnet Port → Windows Firewall Prompt | Nutzer muss einmalig bestätigen | Klarer Hinweis vor Aktivierung |
| Hub muss laufen für Push | Client kann nicht pushen wenn Hub offline | Upload-Queue mit Auto-Retry beim nächsten Start |
| `modernc.org/sqlite` ohne CGo etwas langsamer | Bei <1000 Sessions nicht messbar | Acceptable |
| Online-Hub braucht Domain + TLS-Cert | Zusätzliche Infrastruktur | Docker-Compose + Dokumentation |
| Quarantäne-Stick: AdminKit läuft als .exe auf verdächtigem Windows | Theoretisches Ausführungsrisiko | Minimaler Footprint, kein Schreiben auf Host |
