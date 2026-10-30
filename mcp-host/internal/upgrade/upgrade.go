// Package upgrade implements `daemon upgrade [--check]`: compare local
// version with a release endpoint, download, sha256-verify, atomic swap.
// Never auto-upgrades without the command (SPEC §2).
package upgrade

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// DefaultEndpoint is queried by `upgrade --check`. Override with --endpoint.
const DefaultEndpoint = "https://example.com/browser-agent/releases/latest.json"

// ReleaseInfo is the expected endpoint payload.
type ReleaseInfo struct {
	Version string `json:"version"`
	URL     string `json:"url"`
	SHA256  string `json:"sha256"`
}

// Check compares current against the endpoint. checkOnly paths never write.
func Check(current, endpoint string, client *http.Client) (latest string, update bool, info *ReleaseInfo, err error) {
	if endpoint == "" {
		endpoint = DefaultEndpoint
	}
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	resp, err := client.Get(endpoint)
	if err != nil {
		return "", false, nil, fmt.Errorf("upgrade: endpoint unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", false, nil, fmt.Errorf("upgrade: endpoint status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", false, nil, err
	}
	var ri ReleaseInfo
	if err := json.Unmarshal(body, &ri); err != nil || ri.Version == "" {
		return "", false, nil, fmt.Errorf("upgrade: bad release payload")
	}
	return ri.Version, ri.Version != current && ri.Version != "", &ri, nil
}

// Run executes `daemon upgrade [--check]`. With checkOnly it never alters
// anything; otherwise it downloads, verifies sha256, and atomically swaps.
func Run(current, endpoint string, checkOnly bool, out io.Writer) error {
	latest, update, info, err := Check(current, endpoint, nil)
	if err != nil {
		return err
	}
	fmt.Fprintf(out, "local: %s  latest: %s\n", current, latest)
	if !update {
		fmt.Fprintln(out, "already up to date")
		return nil
	}
	if checkOnly {
		fmt.Fprintln(out, "update available (use `daemon upgrade` to apply)")
		return nil
	}
	if info.URL == "" || info.SHA256 == "" {
		return fmt.Errorf("upgrade: release missing url/sha256")
	}
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("upgrade: self path: %w", err)
	}
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Get(info.URL)
	if err != nil {
		return fmt.Errorf("upgrade: download: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("upgrade: download status %d", resp.StatusCode)
	}
	tmp, err := os.CreateTemp(filepath.Dir(exe), ".daemon-update-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // removed after successful rename (no-op then)
	h := sha256.New()
	if _, err := io.Copy(io.MultiWriter(tmp, h), io.LimitReader(resp.Body, 200<<20)); err != nil {
		tmp.Close()
		return fmt.Errorf("upgrade: download: %w", err)
	}
	tmp.Close()
	got := hex.EncodeToString(h.Sum(nil))
	if !strings.EqualFold(got, strings.TrimSpace(info.SHA256)) {
		return fmt.Errorf("upgrade: sha256 mismatch (got %s)", got)
	}
	if err := os.Chmod(tmpName, 0o755); err != nil {
		return err
	}
	// Atomic swap: rename over the running binary. On Windows the running
	// .exe cannot be replaced, so leave <exe>.new + instructions instead.
	if err := os.Rename(tmpName, exe); err != nil {
		next := exe + ".new"
		_ = os.Remove(next)
		if rerr := os.Rename(tmpName, next); rerr != nil {
			return fmt.Errorf("upgrade: swap: %w", err)
		}
		fmt.Fprintf(out, "downloaded verified build to %s\n", next)
		fmt.Fprintln(out, "stop the daemon and replace the binary manually, then restart")
		return nil
	}
	fmt.Fprintln(out, "upgraded; restart the daemon to run the new build")
	return nil
}
