package aiassist

// Provider-Konstanten
const (
	ProviderOpenAI    = "openai"
	ProviderAnthropic = "anthropic"
	ProviderGroq      = "groq"
)

// ProviderInfo beschreibt einen konfigurierten KI-Anbieter.
type ProviderInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	HasKey  bool   `json:"has_key"`
	IsLocal bool   `json:"is_local"`
}

// openAIRequest ist das Request-Format für OpenAI-kompatible APIs.
type openAIRequest struct {
	Model    string          `json:"model"`
	Messages []openAIMessage `json:"messages"`
}

type openAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIResponse struct {
	Choices []struct {
		Message openAIMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// anthropicRequest ist das Request-Format für die Anthropic API.
type anthropicRequest struct {
	Model     string              `json:"model"`
	MaxTokens int                 `json:"max_tokens"`
	Messages  []anthropicMessage  `json:"messages"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicResponse struct {
	Content []struct {
		Text string `json:"text"`
	} `json:"content"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}
