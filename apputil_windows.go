//go:build windows

package main

import (
	"os/exec"
	"strings"
)

func openFilePlatform(path string) error {
	return exec.Command("cmd", "/c", "start", "", path).Run()
}

func revealFilePlatform(path string) error {
	winPath := strings.ReplaceAll(path, "/", "\\")
	return exec.Command("explorer", "/select,"+winPath).Run()
}

func openEventInConsolePlatform(_ string) error {
	return exec.Command("eventvwr").Run()
}
