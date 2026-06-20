//go:build windows

package network

import (
	"bufio"
	"fmt"
	"os/exec"
	"strconv"
	"strings"

	"github.com/yusufpapurcu/wmi"
)

type win32Process struct {
	ProcessID uint32
	Name      string
}

// scanConnections liest aktive Verbindungen via netstat -ano auf Windows.
// Prozessnamen werden per WMI nachgeschlagen.
func scanConnections() ([]NetworkConnection, error) {
	out, err := exec.Command("netstat", "-ano").Output()
	if err != nil && len(out) == 0 {
		return nil, err
	}

	// PID → Prozessname Lookup via WMI
	pidNames := buildPIDNameMap()

	var conns []NetworkConnection
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		// Beispiel: "TCP    0.0.0.0:80    0.0.0.0:0    LISTENING    4"
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		proto := strings.ToLower(fields[0])
		if proto != "tcp" && proto != "udp" && proto != "tcp6" && proto != "udp6" {
			continue
		}

		conn := NetworkConnection{Protocol: proto}

		if proto == "tcp" || proto == "tcp6" {
			if len(fields) < 5 {
				continue
			}
			conn.LocalAddr, conn.LocalPort = splitWinAddrPort(fields[1])
			conn.RemoteAddr, conn.RemotePort = splitWinAddrPort(fields[2])
			conn.State = fields[3]
			pid, _ := strconv.Atoi(fields[4])
			conn.PID = pid
		} else {
			// UDP: kein State, kein Remote
			if len(fields) < 4 {
				continue
			}
			conn.LocalAddr, conn.LocalPort = splitWinAddrPort(fields[1])
			conn.State = "UDP"
			pid, _ := strconv.Atoi(fields[3])
			conn.PID = pid
		}

		if name, ok := pidNames[conn.PID]; ok {
			conn.ProcessName = name
		} else if conn.PID > 0 {
			conn.ProcessName = fmt.Sprintf("PID %d", conn.PID)
		}

		conns = append(conns, conn)
	}
	return conns, nil
}

func buildPIDNameMap() map[int]string {
	var procs []win32Process
	wmi.Query("SELECT ProcessID, Name FROM Win32_Process", &procs)
	m := make(map[int]string, len(procs))
	for _, p := range procs {
		m[int(p.ProcessID)] = strings.TrimSuffix(p.Name, ".exe")
	}
	return m
}

// splitWinAddrPort zerlegt "0.0.0.0:80" oder "[::]:80" in Adresse und Port.
func splitWinAddrPort(s string) (string, int) {
	s = strings.TrimSpace(s)
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
