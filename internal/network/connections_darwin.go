//go:build darwin

package network

import (
	"bufio"
	"os/exec"
	"strconv"
	"strings"
)

// scanConnections liest aktive TCP-Verbindungen via lsof auf macOS.
// Format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
func scanConnections() ([]NetworkConnection, error) {
	// lsof gibt TCP + UDP-Verbindungen mit PID und Prozessname zurück
	out, err := exec.Command("lsof", "-nP", "-iTCP", "-iUDP", "+c0").Output()
	if err != nil && len(out) == 0 {
		return nil, err
	}

	var conns []NetworkConnection
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	// Erste Zeile = Header überspringen
	scanner.Scan()

	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) < 9 {
			continue
		}

		procName := fields[0]
		pid, _ := strconv.Atoi(fields[1])
		// fields[7] = TYPE (IPv4/IPv6), fields[8] = NAME (addr->addr (STATE))
		// Manchmal gibt es mehr Spalten, der Name ist immer der letzte vor dem State
		name := fields[len(fields)-1]
		stateField := ""
		// State in Klammern am Ende: "addr->addr (ESTABLISHED)"
		if strings.HasSuffix(name, ")") && strings.Contains(name, "(") {
			idx := strings.LastIndex(name, "(")
			stateField = strings.Trim(name[idx:], "()")
			name = strings.TrimSpace(name[:idx])
		}

		// Protokoll aus NODE-Spalte (fields[7] bei lsof ist TYPE, fields[6]=NODE=TCP/UDP)
		nodeType := ""
		if len(fields) >= 8 {
			nodeType = strings.ToLower(fields[7])
		}
		proto := "tcp"
		if strings.Contains(nodeType, "udp") {
			proto = "udp"
		}
		if strings.Contains(fields[7], "6") || strings.HasSuffix(fields[len(fields)-2], "6") {
			proto += "6"
		}

		conn := NetworkConnection{
			Protocol:    proto,
			PID:         pid,
			ProcessName: procName,
			State:       stateField,
		}

		// NAME parsen: "localAddr:port->remoteAddr:port" oder "localAddr:port"
		if strings.Contains(name, "->") {
			parts := strings.SplitN(name, "->", 2)
			conn.LocalAddr, conn.LocalPort = splitAddrPort(parts[0])
			conn.RemoteAddr, conn.RemotePort = splitAddrPort(parts[1])
		} else {
			conn.LocalAddr, conn.LocalPort = splitAddrPort(name)
		}

		// Nur sinnvolle Einträge behalten
		if conn.LocalPort == 0 && conn.RemotePort == 0 {
			continue
		}
		conns = append(conns, conn)
	}
	return conns, nil
}

// splitAddrPort zerlegt "host:port" oder "[::1]:port" in Adresse und Port.
func splitAddrPort(s string) (string, int) {
	s = strings.TrimSpace(s)
	if s == "" || s == "*" {
		return "*", 0
	}
	// IPv6: "[::1]:80" oder "::1:80" (lsof-Format)
	if strings.HasPrefix(s, "[") {
		idx := strings.LastIndex(s, "]:")
		if idx >= 0 {
			addr := s[1:idx]
			port, _ := strconv.Atoi(s[idx+2:])
			return addr, port
		}
	}
	idx := strings.LastIndex(s, ":")
	if idx < 0 {
		return s, 0
	}
	addr := s[:idx]
	port, _ := strconv.Atoi(s[idx+1:])
	return addr, port
}
