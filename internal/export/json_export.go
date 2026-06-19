package export

import "encoding/json"

// GenerateJSON serialisiert alle Scan-Ergebnisse als eingerücktes JSON.
func GenerateJSON(data *SessionExport) ([]byte, error) {
	return json.MarshalIndent(data, "", "  ")
}
