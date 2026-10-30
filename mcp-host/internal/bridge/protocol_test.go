package bridge

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPilotAllowlist(t *testing.T) {
	if len(PilotTools) != 5 {
		t.Fatalf("want 5 pilot tools, got %d", len(PilotTools))
	}
	for _, tool := range []string{"snapshot", "screenshot", "navigate", "get_text", "tabs"} {
		if !IsPilot(tool) {
			t.Fatalf("%s should be pilot", tool)
		}
		if err := ValidateToolCall(tool, map[string]any{}); err != nil {
			if tool == "navigate" {
				continue // requires url|direction
			}
			t.Fatalf("%s empty args: %v", tool, err)
		}
	}
}

func TestValidateUnknownTool(t *testing.T) {
	if err := ValidateToolCall("browser_evaluate", map[string]any{}); err == nil {
		t.Fatal("non-pilot tool must be rejected")
	}
	if err := ValidateToolCall("browser_batch", map[string]any{}); err == nil {
		t.Fatal("browser_batch must be rejected")
	}
}

func TestValidateNavigate(t *testing.T) {
	if err := ValidateToolCall("navigate", map[string]any{"url": "https://example.com"}); err != nil {
		t.Fatal(err)
	}
	if err := ValidateToolCall("navigate", map[string]any{"direction": "back"}); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []map[string]any{
		{},
		{"url": "ftp://example.com/x"},
		{"url": "not a url"},
		{"direction": "sideways"},
		{"url": "https://example.com", "evil": 1},
	} {
		if err := ValidateToolCall("navigate", bad); err == nil {
			t.Fatalf("should reject %#v", bad)
		}
	}
}

func TestValidateTabs(t *testing.T) {
	if err := ValidateToolCall("tabs", map[string]any{}); err != nil {
		t.Fatal(err)
	}
	if err := ValidateToolCall("tabs", map[string]any{"url": "https://example.com"}); err != nil {
		t.Fatal(err)
	}
	if err := ValidateToolCall("tabs", map[string]any{"url": "file:///etc/passwd"}); err == nil {
		t.Fatal("non-http url must be rejected")
	}
}

func TestTabIDNormalization(t *testing.T) {
	args := map[string]any{"tabId": float64(0)}
	NormalizeArgs(args)
	if _, ok := args["tabId"]; ok {
		t.Fatal("tabId 0 must be stripped, never forwarded")
	}
	args = map[string]any{"tabId": float64(7)}
	NormalizeArgs(args)
	if args["tabId"] != float64(7) {
		t.Fatal("positive tabId must survive")
	}
	if err := ValidateToolCall("snapshot", map[string]any{"tabId": "abc"}); err == nil {
		t.Fatal("string tabId must be rejected")
	}
}

func TestTimeouts(t *testing.T) {
	if DefaultTimeoutMs != 60000 {
		t.Fatalf("default ceiling must be 60s, got %d", DefaultTimeoutMs)
	}
	cases := map[string]int{
		"navigate": 20000, "snapshot": 15000, "get_text": 15000,
		"tabs": 15000, "screenshot": 30000,
	}
	for tool, want := range cases {
		if got := TimeoutFor(tool); got != want {
			t.Fatalf("%s: want %d got %d", tool, want, got)
		}
	}
	if got := ClampTimeout("snapshot", 0); got != 15000 {
		t.Fatalf("default per tool, got %d", got)
	}
	if got := ClampTimeout("snapshot", 999999); got != 60000 {
		t.Fatalf("clamped to ceiling, got %d", got)
	}
}

func TestNewRequestID(t *testing.T) {
	a, b := NewRequestID(), NewRequestID()
	if a == b || len(a) != 36 || strings.Count(a, "-") != 4 {
		t.Fatalf("bad uuids %q %q", a, b)
	}
}

func TestIsBase64Strict(t *testing.T) {
	if !IsBase64Strict("aGVsbG8=") {
		t.Fatal("valid base64 rejected")
	}
	for _, bad := range []string{"", "data:image/png;base64,abc=", "!!!", "abc"} {
		if IsBase64Strict(bad) {
			t.Fatalf("should reject %q", bad)
		}
	}
}

func TestEnvelopeShapes(t *testing.T) {
	req := ToolRequest{ID: NewRequestID(), Type: FrameRequest, Tool: "snapshot", Args: map[string]any{}, TimeoutMs: 15000}
	raw, _ := json.Marshal(req)
	var back map[string]any
	if err := json.Unmarshal(raw, &back); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"id", "type", "tool", "args", "timeoutMs"} {
		if _, ok := back[k]; !ok {
			t.Fatalf("missing key %s", k)
		}
	}
}
