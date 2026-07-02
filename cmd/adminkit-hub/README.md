# AdminKit-Hub (Standalone)

Eigenständiger Fleet-Hub ohne GUI – Server-Gegenstück zur Desktop-App
(Phase D, #74/#80). Nimmt Scan-Sessions von AdminKit-Clients entgegen und
stellt die Fleet-Übersicht bereit. Nutzt dieselben `internal/hub`-Pakete wie
die Desktop-App.

## Lokal bauen & starten

```bash
go build -o adminkit-hub ./cmd/adminkit-hub
./adminkit-hub --root ./hub_vault --port 8767
```

Beim Start wird ein **Pairing-PIN** ausgegeben. Für einen neuen PIN einfach
**Enter** drücken. Ein Client koppelt sich in AdminKit unter
*Einstellungen → Synchronisierung* mit Hub-Adresse + PIN.

## Flags

| Flag | Beschreibung | Default |
|------|--------------|---------|
| `--config` | Pfad zur `hub-config.yaml` | `hub-config.yaml` |
| `--root` | Vault-Verzeichnis des Hubs | `./hub_vault` |
| `--port` | Listen-Port | `8767` |
| `--advertise` | mDNS-Bekanntmachung im LAN | `true` |
| `--self-signed` | Selbstsigniertes TLS-Zertifikat erzeugen/nutzen | `false` |
| `--tls-cert` / `--tls-key` | Eigenes TLS-Zertifikat (aktiviert HTTPS) | – |

Konfiguration alternativ über `hub-config.yaml` (siehe `hub-config.example.yaml`).

## Docker

```bash
docker compose -f cmd/adminkit-hub/docker-compose.yml up -d
docker compose -f cmd/adminkit-hub/docker-compose.yml logs -f   # zeigt PIN
```

## HTTPS / Produktion

Für den Online-Betrieb ist TLS Pflicht. Zwei Wege:

1. **Self-signed** (`--self-signed`): schnell, löst aber Client-Warnungen aus.
2. **Reverse-Proxy** (empfohlen): Caddy oder nginx mit Let's Encrypt vor den
   Hub schalten und intern auf `http://adminkit-hub:8767` weiterleiten.

Kundendaten verlassen die Geräte im Online-Modus nur verschlüsselt.
