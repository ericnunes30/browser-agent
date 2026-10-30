package skill

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func withTempHome(t *testing.T) string {
	t.Helper()
	h := t.TempDir()
	t.Setenv("USERPROFILE", h)
	t.Setenv("HOME", h)
	t.Setenv("APPDATA", t.TempDir())
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	return h
}

func TestInstallClaudeCodeIdempotent(t *testing.T) {
	h := withTempHome(t)
	path, err := Install(ClientClaudeCode, 18765, "")
	if err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(path)
	if _, err := Install(ClientClaudeCode, 18765, ""); err != nil {
		t.Fatal(err)
	}
	after, _ := os.ReadFile(path)
	if string(before) != string(after) {
		t.Fatal("second install must be a no-op")
	}
	var cfg map[string]any
	_ = json.Unmarshal(after, &cfg)
	srv := cfg["mcpServers"].(map[string]any)["browser-agent"].(map[string]any)
	args, _ := srv["args"].([]any)
	if srv["command"] == nil || len(args) != 3 || args[2] != "--stdio" {
		t.Fatalf("wrong block (want stdio spawn): %v", srv)
	}
	_ = h
	_ = filepath.Separator
}

func TestInstallUnknownClient(t *testing.T) {
	withTempHome(t)
	if _, err := Install("vscode", 18765, ""); err == nil {
		t.Fatal("unknown client must fail")
	}
}

func TestHelpText(t *testing.T) {
	h := HelpText()
	for _, want := range []string{"token", "18765", "claude-code", "opencode", "claude-desktop"} {
		found := false
		for i := 0; i+len(want) <= len(h); i++ {
			if h[i:i+len(want)] == want {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("help missing %q", want)
		}
	}
}
