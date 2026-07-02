# AdminKit-Hub – Standalone-Binary (Phase D, #80)
# Build-Kontext ist das Repo-Root:
#   docker build -f cmd/adminkit-hub/Dockerfile -t adminkit-hub .

# ── Build-Stufe ──
FROM golang:1.25-alpine AS build
WORKDIR /src

# Abhängigkeiten zuerst (bessere Layer-Caches).
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Statisches Binary ohne CGo (zeroconf ist reines Go → cross-compile-fähig).
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" \
    -o /out/adminkit-hub ./cmd/adminkit-hub

# ── Laufzeit-Stufe ──
FROM alpine:3.20
RUN adduser -D -u 10001 adminkit && apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /out/adminkit-hub /usr/local/bin/adminkit-hub

# Vault-Verzeichnis als Volume (Sessions überleben Container-Neustarts).
RUN mkdir -p /data && chown adminkit:adminkit /data
VOLUME ["/data"]
USER adminkit

EXPOSE 8767
ENTRYPOINT ["adminkit-hub", "--root", "/data", "--port", "8767"]
# mDNS im Container meist sinnlos → standardmäßig aus. Für LAN-Discovery
# Host-Networking nutzen und "--advertise" ergänzen.
CMD ["--advertise=false"]
