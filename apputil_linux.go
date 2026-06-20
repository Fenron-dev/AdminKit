//go:build !darwin && !windows

package main

import "fmt"

func openFilePlatform(path string) error {
	return fmt.Errorf("nicht unterstützt auf diesem Betriebssystem")
}

func revealFilePlatform(path string) error {
	return fmt.Errorf("nicht unterstützt auf diesem Betriebssystem")
}

func openEventInConsolePlatform(_ string) error {
	return fmt.Errorf("nicht unterstützt auf diesem Betriebssystem")
}
