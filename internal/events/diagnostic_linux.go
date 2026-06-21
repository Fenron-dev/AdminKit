//go:build !darwin && !windows

package events

import "time"

// GetCrashReports ist unter Linux nicht implementiert.
func GetCrashReports(from, to time.Time) []CrashReport {
	return nil
}
