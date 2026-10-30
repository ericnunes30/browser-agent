// Package skill implements `daemon install-skill --client ...`: writes the
// MCP block into the client's config, idempotently (SPEC §2).
package skill

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"browseragent/mcp-host/internal/auth"
)

// Supported clients.
const (
	ClientClaudeCode    = "claude-code"
	ClientOpencode      = "opencode"
	ClientClaudeDesktop = "claude-desktop"
)

// Clients lists valid --client values.
var Clients = []string{ClientClaudeCode, ClientOpencode, ClientClaudeDesktop}

// Valid reports whether client is supported.
func Valid(client string) bool {
	for _, c := range Clients {
		if c == client {
			return true
		}
	}
	return false
}

func homeDir() string {
	h, _ := os.UserHomeDir()
	return h
}

// configPath returns the client config file for the current OS.
func configPath(client string) string {
	h := homeDir()
	switch client {
	case ClientClaudeCode:
		return filepath.Join(h, ".claude.json")
	case ClientOpencode:
		if runtime.GOOS == "windows" {
			return filepath.Join(os.Getenv("APPDATA"), "opencode", "opencode.json")
		}
		return filepath.Join(h, ".config", "opencode", "opencode.json")
	case ClientClaudeDesktop:
		if runtime.GOOS == "windows" {
			return filepath.Join(os.Getenv("APPDATA"), "Claude", "claude_desktop_config.json")
		}
		if runtime.GOOS == "darwin" {
			return filepath.Join(h, "Library", "Application Support", "Claude", "claude_desktop_config.json")
		}
		return filepath.Join(h, ".config", "Claude", "claude_desktop_config.json")
	}
	return ""
}

func mcpURL(port int) string { return fmt.Sprintf("http://127.0.0.1:%d/mcp", port) }

// desiredBlock returns the MCP server block for the client.
// HTTP clients point at the primary port (§6.4); Claude Desktop (legacy
// stdio-only) spawns the daemon via --stdio.
func desiredBlock(client string, port int, exePath string) map[string]any {
	switch client {
	case ClientClaudeCode:
		return map[string]any{"type": "http", "url": mcpURL(port)}
	case ClientOpencode:
		return map[string]any{"type": "remote", "url": mcpURL(port)}
	case ClientClaudeDesktop:
		args := []string{"--stdio"}
		if port != 0 {
			args = append([]string{"--port", fmt.Sprint(port)}, args...)
		}
		return map[string]any{"command": exePath, "args": args}
	}
	return nil
}

// serverKeyPath is the JSON path holding MCP servers per client.
func serverKeyPath(client string) []string {
	switch client {
	case ClientOpencode:
		return []string{"mcp"}
	default:
		return []string{"mcpServers"}
	}
}

func getPath(m map[string]any, path []string) map[string]any {
	cur := m
	for _, k := range path {
		next, ok := cur[k].(map[string]any)
		if !ok {
			next = map[string]any{}
			cur[k] = next
		}
		cur = next
	}
	return cur
}

func blocksEqual(a, b map[string]any) bool {
	ra, _ := json.Marshal(a)
	rb, _ := json.Marshal(b)
	return string(ra) == string(rb)
}

// Install writes the MCP block into the client config. Idempotent: a second
// run with the same inputs leaves the file untouched.
func Install(client string, port int, exePath string) (string, error) {
	if !Valid(client) {
		return "", fmt.Errorf("skill: unknown client %q (use %s)", client, strings.Join(Clients, "|"))
	}
	if port <= 0 {
		return "", fmt.Errorf("skill: port must come from the primary (config.json:{port})")
	}
	if client == ClientClaudeDesktop && exePath == "" {
		exe, err := os.Executable()
		if err != nil {
			return "", fmt.Errorf("skill: self path: %w", err)
		}
		exePath = exe
	}
	path := configPath(client)
	cfg := map[string]any{}
	if raw, err := os.ReadFile(path); err == nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, &cfg); err != nil {
			return "", fmt.Errorf("skill: parse %s: %w", path, err)
		}
	} else if err != nil && !os.IsNotExist(err) {
		return "", fmt.Errorf("skill: read %s: %w", path, err)
	}
	servers := getPath(cfg, serverKeyPath(client))
	want := desiredBlock(client, port, exePath)
	if cur, ok := servers["browser-agent"].(map[string]any); ok && blocksEqual(cur, want) {
		return path, nil // idempotent no-op
	}
	servers["browser-agent"] = want
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return "", err
	}
	raw, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(path, append(raw, '\n'), 0o600); err != nil {
		return "", fmt.Errorf("skill: write %s: %w", path, err)
	}
	return path, nil
}

// HelpText documents host setup per OS (emitted by `install-skill --help`,
// never a wiki, per acceptance §9.5).
func HelpText() string {
	lines := []string{
		"browser-agent daemon — host setup",
		"",
		"Token file (generated on first boot, 0600):",
		"  Windows: %APPDATA%\\BrowserAgent\\token",
		"  macOS/Linux: ~/.config/browser-agent/token  (or $XDG_CONFIG_HOME/browser-agent/token)",
		fmt.Sprintf("  This machine: %s", auth.TokenPath()),
		"",
		"Config (primary port):",
		fmt.Sprintf("  This machine: %s  {\"port\": 18765}", auth.ConfigPath()),
		"",
		"Ports:",
		"  Default 18765 on 127.0.0.1 only (--port overrides, --port 0 = ephemeral test).",
		"  A second instance on the same port becomes a client (forwards MCP to the",
		"  primary) instead of hijacking it. install-skill always points at the primary.",
		"",
		"Pairing:",
		"  First boot prints a 6-digit code; enter it once in the extension.",
		"  The extension stores the Bearer token in chrome.storage.local.",
		"  `daemon --reset-token` invalidates all pairings.",
		"",
		"Register (run at login):",
		"  Windows: Task Scheduler → `daemon --port 18765` at logon.",
		"  macOS:   launchd plist → `daemon --port 18765` (RunAtLoad).",
		"  Linux:   systemd --user unit → `daemon --port 18765` (WantedBy=default.target).",
		"",
		"Clients (--client " + strings.Join(Clients, "|") + "):",
		"  claude-code:    HTTP block {type:http, url:http://127.0.0.1:<port>/mcp} in ~/.claude.json",
		"  opencode:       remote block in <config>/opencode/opencode.json",
		"  claude-desktop: stdio block {command:<daemon>, args:[--stdio]} (legacy stdio-only)",
		"",
		"Commands: start|stop|status|logs [--tail N]|upgrade [--check]|install-skill --client X",
		"",
		"Manage: " + strings.Join(sortedClients(), ", "),
	}
	return strings.Join(lines, "\n")
}

func sortedClients() []string {
	out := append([]string{}, Clients...)
	sort.Strings(out)
	return out
}
