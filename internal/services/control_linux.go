//go:build !darwin && !windows

package services

import "fmt"

// StartService ist auf Linux nicht implementiert.
func StartService(name string) (string, error) {
	return "", fmt.Errorf("StartService auf dieser Plattform nicht unterstützt")
}

// StopService ist auf Linux nicht implementiert.
func StopService(name string) (string, error) {
	return "", fmt.Errorf("StopService auf dieser Plattform nicht unterstützt")
}
