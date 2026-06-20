package virustotal

// CheckRequest beschreibt einen zu prüfenden Eintrag.
type CheckRequest struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	ItemType string `json:"item_type"` // "service", "autostart", "ext", "software"
}

// CheckResult ist das Ergebnis einer VT-Prüfung.
type CheckResult struct {
	ItemID     string `json:"item_id"`     // key aus dem Frontend
	Name       string `json:"name"`
	Path       string `json:"path"`
	SHA256     string `json:"sha256"`
	Status     string `json:"status"`      // "clean", "malicious", "suspicious", "not_found", "error", "no_path"
	Detections int    `json:"detections"`  // Anzahl positiver Engines
	Engines    int    `json:"engines"`     // Gesamte Engines
	Permalink  string `json:"permalink"`   // Link zur VT-Seite
	ErrorMsg   string `json:"error_msg,omitempty"`
}

// BatchResult fasst alle Ergebnisse einer Batch-Prüfung zusammen.
type BatchResult struct {
	Results  []CheckResult `json:"results"`
	Errors   int           `json:"errors"`
}

// vtFileReport ist die relevante Teilstruktur der VT API v3 Antwort.
type vtFileReport struct {
	Data struct {
		Attributes struct {
			LastAnalysisStats struct {
				Malicious  int `json:"malicious"`
				Suspicious int `json:"suspicious"`
				Undetected int `json:"undetected"`
				Harmless   int `json:"harmless"`
			} `json:"last_analysis_stats"`
		} `json:"attributes"`
		ID   string `json:"id"`
		Type string `json:"type"`
	} `json:"data"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}
