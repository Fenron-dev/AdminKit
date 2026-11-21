//go:build !windows

package execx

import "os/exec"

func hideWindow(_ *exec.Cmd) {}
