package sync

import (
	"context"
	"fmt"
	"time"

	"github.com/grandcat/zeroconf"

	"adminkit/internal/hub"
)

// HubInfo beschreibt einen im LAN gefundenen Hub.
type HubInfo struct {
	Name    string `json:"name"`
	Host    string `json:"host"` // erste IPv4-Adresse
	Port    int    `json:"port"`
	Version string `json:"version"`
	BaseURL string `json:"base_url"` // http://host:port, direkt für NewClient nutzbar
}

// Discover durchsucht das LAN für die Dauer von timeout nach AdminKit-Hubs
// (mDNS-Service _adminkit._tcp). Doppelte Einträge werden zusammengeführt.
func Discover(ctx context.Context, timeout time.Duration) ([]HubInfo, error) {
	resolver, err := zeroconf.NewResolver(nil)
	if err != nil {
		return nil, fmt.Errorf("mDNS-Resolver: %w", err)
	}

	entries := make(chan *zeroconf.ServiceEntry, 16)
	browseCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	if err := resolver.Browse(browseCtx, hub.ServiceType, "local.", entries); err != nil {
		return nil, fmt.Errorf("mDNS-Browse: %w", err)
	}

	seen := map[string]HubInfo{}
	for {
		select {
		case entry, ok := <-entries:
			if !ok {
				return mapValues(seen), nil
			}
			info := entryToHub(entry)
			if info.Host != "" {
				seen[info.BaseURL] = info
			}
		case <-browseCtx.Done():
			return mapValues(seen), nil
		}
	}
}

func entryToHub(e *zeroconf.ServiceEntry) HubInfo {
	info := HubInfo{Name: e.Instance, Port: e.Port}
	if len(e.AddrIPv4) > 0 {
		info.Host = e.AddrIPv4[0].String()
	} else if len(e.AddrIPv6) > 0 {
		info.Host = e.AddrIPv6[0].String()
	}
	for _, txt := range e.Text {
		if v, ok := trimPrefix(txt, "version="); ok {
			info.Version = v
		}
	}
	if info.Host != "" {
		info.BaseURL = fmt.Sprintf("http://%s:%d", info.Host, info.Port)
	}
	return info
}

func trimPrefix(s, prefix string) (string, bool) {
	if len(s) >= len(prefix) && s[:len(prefix)] == prefix {
		return s[len(prefix):], true
	}
	return "", false
}

func mapValues(m map[string]HubInfo) []HubInfo {
	out := make([]HubInfo, 0, len(m))
	for _, v := range m {
		out = append(out, v)
	}
	return out
}
