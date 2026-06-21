// Package quickactions führt häufige IT-Support-Aktionen aus.
// Plattformspezifische Implementierungen in actions_darwin.go / actions_windows.go.
package quickactions

// Result ist das Ergebnis einer Quick-Action.
type Result struct {
	Action  string `json:"action"`
	Output  string `json:"output"`
	Success bool   `json:"success"`
}
