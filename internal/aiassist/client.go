// Package aiassist stellt KI-Analyse-Funktionen für AdminKit bereit.
// Unterstützt OpenAI-kompatible APIs (OpenAI, Groq, Ollama, LM Studio) und Anthropic.
package aiassist

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const defaultTimeout = 60 * time.Second

// CallOpenAICompat sendet einen Prompt an eine OpenAI-kompatible API
// (OpenAI, Groq, Ollama, LM Studio).
// baseURL: z.B. "https://api.openai.com/v1" oder "http://localhost:11434/v1"
// apiKey: "" für lokale Instanzen ohne Auth
func CallOpenAICompat(baseURL, apiKey, model, prompt string) (string, error) {
	reqBody := openAIRequest{
		Model: model,
		Messages: []openAIMessage{
			{Role: "user", Content: prompt},
		},
	}
	data, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	url := strings.TrimRight(baseURL, "/") + "/chat/completions"
	req, err := http.NewRequest("POST", url, bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	client := &http.Client{Timeout: defaultTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("HTTP-Fehler: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", err
	}

	var result openAIResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("JSON-Parse: %w (HTTP %d)", err, resp.StatusCode)
	}
	if result.Error != nil {
		return "", fmt.Errorf("API-Fehler: %s", result.Error.Message)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("leere Antwort (HTTP %d)", resp.StatusCode)
	}
	return strings.TrimSpace(result.Choices[0].Message.Content), nil
}

// CallAnthropic sendet einen Prompt an die Anthropic API (Messages-Endpunkt).
func CallAnthropic(apiKey, model, prompt string) (string, error) {
	if model == "" {
		model = "claude-opus-4-8"
	}
	reqBody := anthropicRequest{
		Model:     model,
		MaxTokens: 4096,
		Messages: []anthropicMessage{
			{Role: "user", Content: prompt},
		},
	}
	data, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	client := &http.Client{Timeout: defaultTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("HTTP-Fehler: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", err
	}

	var result anthropicResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("JSON-Parse: %w (HTTP %d)", err, resp.StatusCode)
	}
	if result.Error != nil {
		return "", fmt.Errorf("API-Fehler: %s", result.Error.Message)
	}
	if len(result.Content) == 0 {
		return "", fmt.Errorf("leere Antwort (HTTP %d)", resp.StatusCode)
	}
	return strings.TrimSpace(result.Content[0].Text), nil
}

// OllamaBaseURL und LMStudioBaseURL sind die Standard-Endpunkte für lokale Modelle.
const (
	OllamaBaseURL   = "http://localhost:11434/v1"
	LMStudioBaseURL = "http://localhost:1234/v1"
)
