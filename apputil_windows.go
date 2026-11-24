//go:build windows

package main

import (
	"adminkit/internal/execx"
	"strings"
)

func openFilePlatform(path string) error {
	return execx.Command("cmd", "/c", "start", "", path).Run()
}

func revealFilePlatform(path string) error {
	winPath := strings.ReplaceAll(path, "/", "\\")
	return execx.Command("explorer", "/select,"+winPath).Run()
}

func openEventInConsolePlatform(_ string) error {
	return execx.Command("eventvwr").Run()
}
