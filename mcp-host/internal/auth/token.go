// Package auth manages the pairing token stored on disk (SPEC §2, §8).
//
// Windows: %APPDATA%/BrowserAgent/token
// linux/mac: $HOME/.config/browser-agent/token (or $XDG_CONFIG_HOME/browser-agent)
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// DataDir returns the per-user BrowserAgent data directory.
func DataDir() string {
	if runtime.GOOS == "windows" {
		if a := os.Getenv("APPDATA"); a != "" {
			return filepath.Join(a, "BrowserAgent")
		}
	}
	if x := os.Getenv("XDG_CONFIG_HOME"); x != "" {
		return filepath.Join(x, "browser-agent")
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return filepath.Join(".", ".browser-agent")
	}
	if runtime.GOOS == "windows" {
		return filepath.Join(home, "AppData", "Roaming", "BrowserAgent")
	}
	return filepath.Join(home, ".config", "browser-agent")
}

// TokenPath returns the token file path for the current OS.
func TokenPath() string { return filepath.Join(DataDir(), "token") }

// ConfigPath returns the daemon config file path for the current OS.
func ConfigPath() string { return filepath.Join(DataDir(), "config.json") }

// generate creates a fresh 32-byte crypto/rand hex token (64 chars).
func generate() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", fmt.Errorf("auth: rand: %w", err)
	}
	return hex.EncodeToString(b[:]), nil
}

// ReadToken reads the stored token. Empty string + nil error when absent.
func ReadToken() (string, error) {
	raw, err := os.ReadFile(TokenPath())
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", fmt.Errorf("auth: read token: %w", err)
	}
	return strings.TrimSpace(string(raw)), nil
}

func writeToken(token string) error {
	dir := DataDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("auth: mkdir: %w", err)
	}
	// 0600 equivalent; on Windows ACLs apply per-user via APPDATA.
	if err := os.WriteFile(TokenPath(), []byte(token+"\n"), 0o600); err != nil {
		return fmt.Errorf("auth: write token: %w", err)
	}
	return nil
}

// LoadOrCreate loads the token, generating and storing it on first boot.
// Returns the token and whether it was just created.
func LoadOrCreate() (token string, created bool, err error) {
	token, err = ReadToken()
	if err != nil {
		return "", false, err
	}
	if token != "" {
		return token, false, nil
	}
	token, err = generate()
	if err != nil {
		return "", false, err
	}
	if err := writeToken(token); err != nil {
		return "", false, err
	}
	return token, true, nil
}

// Reset regenerates the token, invalidating previously paired extensions.
// It also clears the paired marker so one-click pairing reopens once.
func Reset() (string, error) {
	token, err := generate()
	if err != nil {
		return "", err
	}
	if err := writeToken(token); err != nil {
		return "", err
	}
	_ = os.Remove(PairedPath())
	return token, nil
}

// PairedPath marks that one-click pairing already happened (SPEC §3).
// Persisted so a daemon restart does not reopen the pairing window.
func PairedPath() string { return filepath.Join(DataDir(), "paired") }

// IsPaired reports whether one-click pairing already claimed this daemon.
func IsPaired() bool {
	_, err := os.Stat(PairedPath())
	return err == nil
}

// MarkPaired closes the one-click pairing window. Best-effort: a missing
// data dir must not break the WS handshake.
func MarkPaired() {
	_ = os.MkdirAll(DataDir(), 0o700)
	_ = os.WriteFile(PairedPath(), []byte("1"), 0o600)
}

// Validate compares a presented bearer against the expected token.
func Validate(presented, expected string) bool {
	if presented == "" || expected == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(presented), []byte(expected)) == 1
}

// Accepts reports whether presented authorizes the /ws handshake: either the
// full 64-char hex token or the derived 6-digit pairing code. The extension
// stores the code the user typed and reuses it as Bearer on every
// (re)connect (MV3 SW cannot set an Authorization header, so each reconnect
// is a fresh ?token= handshake), so the daemon must accept both.
func Accepts(presented, token string) bool {
	if Validate(presented, token) {
		return true
	}
	if token == "" || presented == "" {
		return false
	}
	return Validate(presented, PairingCode(token))
}

// PairingCode derives a stable 6-digit code from the token for one-time
// pairing display (stdout + /status). Stable so restarts show the same code
// until --reset-token.
func PairingCode(token string) string {
	sum := sha256.Sum256([]byte(token))
	n := (uint32(sum[0])<<24 | uint32(sum[1])<<16 | uint32(sum[2])<<8 | uint32(sum[3])) % 1000000
	return fmt.Sprintf("%06d", n)
}

// Bearer strips the "Bearer " prefix from an Authorization header value.
func Bearer(h string) string {
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	}
	return ""
}
