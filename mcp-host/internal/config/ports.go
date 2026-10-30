// Package config resolves the daemon port and the primary/client rule (SPEC §6).
package config

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"browseragent/mcp-host/internal/auth"
)

// DefaultPort is the default loopback port (§6).
const DefaultPort = 18765

// ServiceMarker identifies our own /status so a second instance never
// hijacks a port owned by a third party.
const ServiceMarker = "browser-agent-mcp"

type fileConfig struct {
	Port int `json:"port"`
}

// ReadConfigPort reads config.json:{port}. Returns 0 when absent/unset.
func ReadConfigPort() (int, error) {
	raw, err := os.ReadFile(auth.ConfigPath())
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, fmt.Errorf("config: read: %w", err)
	}
	var c fileConfig
	if err := json.Unmarshal(raw, &c); err != nil {
		return 0, fmt.Errorf("config: parse: %w", err)
	}
	return c.Port, nil
}

// WriteConfigPort persists the primary port for install-skill (§6.4).
func WriteConfigPort(port int) error {
	if err := os.MkdirAll(auth.DataDir(), 0o700); err != nil {
		return fmt.Errorf("config: mkdir: %w", err)
	}
	raw, err := json.MarshalIndent(fileConfig{Port: port}, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(auth.ConfigPath(), append(raw, '\n'), 0o600); err != nil {
		return fmt.Errorf("config: write: %w", err)
	}
	return nil
}

// ResolvePort applies --port flag > config.json > default.
// flagPort: -1 = unset, 0 = ephemeral (test only, always primary), >0 explicit.
func ResolvePort(flagPort int) int {
	if flagPort >= 0 {
		return flagPort
	}
	if p, err := ReadConfigPort(); err == nil && p > 0 {
		return p
	}
	return DefaultPort
}

// StatusProbe is the subset of /status used for primary detection.
type StatusProbe struct {
	OK      bool   `json:"ok"`
	Service string `json:"service"`
	Version string `json:"version"`
	Port    int    `json:"port"`
}

// ProbePrimary GETs 127.0.0.1:port/status and reports whether a
// browser-agent primary owns the port.
func ProbePrimary(port int) (isOurs bool, probe *StatusProbe, err error) {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/status", port))
	if err != nil {
		return false, nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return false, nil, fmt.Errorf("config: status=%d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if err != nil {
		return false, nil, err
	}
	var p StatusProbe
	if err := json.Unmarshal(body, &p); err != nil {
		return false, nil, err
	}
	if p.Service == ServiceMarker && p.OK {
		return true, &p, nil
	}
	return false, &p, nil
}

// IsAddrInUse reports whether err is EADDRINUSE (portable string match:
// Unix "address already in use", Windows "Only one usage of each socket").
func IsAddrInUse(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	return strings.Contains(s, "address already in use") ||
		strings.Contains(s, "only one usage")
}
