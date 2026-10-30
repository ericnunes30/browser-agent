package auth

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func withTempData(t *testing.T) {
	t.Helper()
	if os.Getenv("APPDATA") != "" {
		t.Setenv("APPDATA", t.TempDir())
	} else {
		t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	}
}

func TestLoadOrCreate(t *testing.T) {
	withTempData(t)
	tok, created, err := LoadOrCreate()
	if err != nil || !created || len(tok) != 64 {
		t.Fatalf("tok=%q created=%v err=%v", tok, created, err)
	}
	tok2, created2, err := LoadOrCreate()
	if err != nil || created2 || tok2 != tok {
		t.Fatalf("must be stable: %q %v %v", tok2, created2, err)
	}
	info, err := os.Stat(TokenPath())
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0o077 != 0 {
		t.Fatalf("token too open: %v", info.Mode())
	}
	// Windows: isolation comes from the per-user %APPDATA% ACL, not mode bits.
	_ = filepath.Separator
}

func TestPairingCode(t *testing.T) {
	c := PairingCode("abc")
	if len(c) != 6 {
		t.Fatalf("want 6 digits, got %q", c)
	}
	for _, ch := range c {
		if ch < '0' || ch > '9' {
			t.Fatalf("non-digit in %q", c)
		}
	}
	if PairingCode("abc") != c {
		t.Fatal("code must be stable per token")
	}
	if PairingCode("abd") == c {
		t.Fatal("code should differ per token")
	}
}

func TestReset(t *testing.T) {
	withTempData(t)
	a, _, _ := LoadOrCreate()
	b, err := Reset()
	if err != nil || a == b {
		t.Fatalf("reset must change token: %v", err)
	}
	if !Validate(b, b) || Validate(a, b) {
		t.Fatal("validate broken")
	}
}
