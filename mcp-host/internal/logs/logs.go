// Package logs writes daemon JSONL logs without page PII (SPEC §2).
package logs

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"time"

	"browseragent/mcp-host/internal/auth"
)

// Entry is one JSONL log line.
type Entry struct {
	Ts        string `json:"ts"`
	Level     string `json:"level"`
	Msg       string `json:"msg"`
	Tool      string `json:"tool,omitempty"`
	TabID     *int64 `json:"tabId,omitempty"`
	LatencyMs *int64 `json:"latencyMs,omitempty"`
}

// Logger appends Entries to a dated JSONL file. Use NewNop in tests.
type Logger struct {
	mu      sync.Mutex
	f       *os.File
	path    string
	discard bool
	lastErr *string
}

// New opens %APPDATA%/BrowserAgent/logs/daemon-<ts>.log for appending.
func New() (*Logger, error) {
	dir := filepath.Join(auth.DataDir(), "logs")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("logs: mkdir: %w", err)
	}
	name := fmt.Sprintf("daemon-%s.log", time.Now().Format("20060102-150405"))
	path := filepath.Join(dir, name)
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("logs: open: %w", err)
	}
	return &Logger{f: f, path: path}, nil
}

// NewNop returns a Logger that drops output (tests).
func NewNop() *Logger { return &Logger{discard: true} }

// Path returns the backing file path ("" for NewNop).
func (l *Logger) Path() string { return l.path }

// Log appends one entry.
func (l *Logger) Log(level, msg, tool string, tabID, latencyMs *int64) {
	e := Entry{
		Ts:        time.Now().UTC().Format(time.RFC3339Nano),
		Level:     level,
		Msg:       msg,
		Tool:      tool,
		TabID:     tabID,
		LatencyMs: latencyMs,
	}
	if level == "error" {
		l.mu.Lock()
		s := msg
		l.lastErr = &s
		l.mu.Unlock()
	}
	if l.discard {
		return
	}
	raw, err := json.Marshal(e)
	if err != nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.f != nil {
		_, _ = l.f.Write(append(raw, '\n'))
	}
}

// LastError returns the most recent error message, or nil.
func (l *Logger) LastError() *string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.lastErr
}

// Close flushes the log file.
func (l *Logger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.f != nil {
		return l.f.Close()
	}
	return nil
}

// LatestFile returns the most recently modified daemon-*.log path.
func LatestFile() (string, error) {
	dir := filepath.Join(auth.DataDir(), "logs")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", err
	}
	var best string
	var bestTs time.Time
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().After(bestTs) {
			bestTs = info.ModTime()
			best = filepath.Join(dir, e.Name())
		}
	}
	if best == "" {
		return "", fmt.Errorf("logs: no log files in %s", dir)
	}
	return best, nil
}

// DomainOf strips a URL down to its host for PII-safe logging (§2: domain only).
func DomainOf(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil || u.Host == "" {
		return ""
	}
	return u.Host
}
