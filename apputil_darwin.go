//go:build darwin

package main

import "os/exec"

func openFilePlatform(path string) error {
	return exec.Command("open", path).Run()
}

func revealFilePlatform(path string) error {
	return exec.Command("open", "-R", path).Run()
}
