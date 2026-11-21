//go:build windows

package execx

import (
	"os/exec"
	"syscall"
)

// createNoWindow verhindert, dass für Konsolenprogramme ein Fenster aufgeht.
const createNoWindow = 0x08000000

func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
}
