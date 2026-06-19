// Package logging stellt das strukturierte Logging für AdminKit bereit.
// Logs werden priorisiert im Vault gespeichert (USB-Stick), mit Fallback auf
// einen wählbaren Ordner oder System-Temp.
package logging

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"
)

// Level definiert den Schweregrad einer Log-Meldung.
type Level int

const (
	LevelDebug Level = iota
	LevelInfo
	LevelWarn
	LevelError
)

var levelNames = map[Level]string{
	LevelDebug: "DEBUG",
	LevelInfo:  "INFO ",
	LevelWarn:  "WARN ",
	LevelError: "ERROR",
}

// Logger ist der zentrale Logger für AdminKit.
type Logger struct {
	level  Level
	logger *log.Logger
	file   *os.File
}

var global *Logger

// Init initialisiert den globalen Logger. Muss vor dem ersten Log-Aufruf gerufen werden.
func Init(level, location, customPath, vaultPath string) error {
	logLevel := parseLevel(level)
	logPath, err := resolveLogPath(location, customPath, vaultPath)
	if err != nil {
		return fmt.Errorf("log-pfad konnte nicht aufgelöst werden: %w", err)
	}

	if err := os.MkdirAll(filepath.Dir(logPath), 0755); err != nil {
		return fmt.Errorf("log-verzeichnis konnte nicht erstellt werden: %w", err)
	}

	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		// Fallback auf stderr wenn Datei nicht geöffnet werden kann
		f = nil
	}

	var writer io.Writer
	if f != nil {
		writer = io.MultiWriter(os.Stderr, f)
	} else {
		writer = os.Stderr
	}

	global = &Logger{
		level:  logLevel,
		logger: log.New(writer, "", 0),
		file:   f,
	}

	return nil
}

// Close schließt die Log-Datei.
func Close() {
	if global != nil && global.file != nil {
		global.file.Close()
	}
}

func Debug(module, msg string) { write(LevelDebug, module, msg) }
func Info(module, msg string)  { write(LevelInfo, module, msg) }
func Warn(module, msg string)  { write(LevelWarn, module, msg) }
func Error(module, msg string) { write(LevelError, module, msg) }

func Debugf(module, format string, args ...any) { write(LevelDebug, module, fmt.Sprintf(format, args...)) }
func Infof(module, format string, args ...any)  { write(LevelInfo, module, fmt.Sprintf(format, args...)) }
func Warnf(module, format string, args ...any)  { write(LevelWarn, module, fmt.Sprintf(format, args...)) }
func Errorf(module, format string, args ...any) { write(LevelError, module, fmt.Sprintf(format, args...)) }

func write(level Level, module, msg string) {
	if global == nil || level < global.level {
		return
	}
	ts := time.Now().Format("2006-01-02 15:04:05")
	global.logger.Printf("[%s] %s [%s] %s", ts, levelNames[level], module, msg)
}

func parseLevel(s string) Level {
	switch s {
	case "debug":
		return LevelDebug
	case "warn":
		return LevelWarn
	case "error":
		return LevelError
	default:
		return LevelInfo
	}
}

// resolveLogPath wählt den Log-Pfad nach Priorität:
// 1. vault (relativ zum Vault-Verzeichnis)
// 2. custom (beliebiger Pfad)
// 3. system_temp (OS-Temp-Verzeichnis als letzter Ausweg)
func resolveLogPath(location, customPath, vaultPath string) (string, error) {
	switch location {
	case "vault":
		return filepath.Join(vaultPath, "logs", "adminkit.log"), nil
	case "custom":
		if customPath == "" {
			return "", fmt.Errorf("custom_path ist leer")
		}
		return filepath.Join(customPath, "adminkit.log"), nil
	default: // system_temp
		return filepath.Join(os.TempDir(), "adminkit.log"), nil
	}
}
