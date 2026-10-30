// Package bridge implements the daemon↔extension framing and the
// extension registry with per-id correlation (SPEC §4).
//
// Request (daemon→extension):
//
//	{"id":"<uuid>","type":"tool_request","tool":"snapshot","args":{"tabId":123},"timeoutMs":60000}
//
// Response (extension→daemon):
//
//	{"id":"<uuid>","type":"tool_response","ok":true,"result":{"content":"...","images":["<base64 png>"]}}
//	{"id":"<uuid>","type":"tool_error","ok":false,"error":{"code":"...","message":"..."}}
package bridge

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/url"
	"strings"
)

const (
	// DefaultTimeoutMs is the end-to-end ceiling per call (§5).
	DefaultTimeoutMs = 60000
	// MaxMessageBytes drops frames above 8 MB with OVERSIZE (§4).
	MaxMessageBytes = 8 << 20

	CodeTimeout  = "TIMEOUT"
	CodeDenied   = "DENIED"
	CodeTabGone  = "TAB_GONE"
	CodeProtocol = "PROTOCOL"
	CodeInternal = "INTERNAL"
	CodeOversize = "OVERSIZE"
)

const (
	FrameRequest  = "tool_request"
	FrameResponse = "tool_response"
	FrameError    = "tool_error"
)

// PilotTools is the phase-1 allowlist (§7). Anything else is rejected with
// PROTOCOL without touching the extension.
var PilotTools = []string{"snapshot", "screenshot", "navigate", "get_text", "tabs"}

// toolTimeouts are the per-tool budgets; the 60 s default is the ceiling (§5).
var toolTimeouts = map[string]int{
	"navigate":   20000,
	"snapshot":   15000,
	"get_text":   15000,
	"tabs":       15000,
	"screenshot": 30000,
}

// ToolRequest is the daemon→extension frame.
type ToolRequest struct {
	ID        string         `json:"id"`
	Type      string         `json:"type"`
	Tool      string         `json:"tool"`
	Args      map[string]any `json:"args"`
	TimeoutMs int            `json:"timeoutMs"`
}

// ResultPayload is the extension success payload. Images are raw base64
// (no data: URI) (falta 15).
type ResultPayload struct {
	Content string   `json:"content"`
	Images  []string `json:"images,omitempty"`
}

// ErrorPayload is the extension error payload.
type ErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ToolSuccessFrame is the extension→daemon success frame.
type ToolSuccessFrame struct {
	ID     string         `json:"id"`
	Type   string         `json:"type"`
	Ok     bool           `json:"ok"`
	Result *ResultPayload `json:"result"`
}

// ToolErrorFrame is the extension→daemon error frame.
type ToolErrorFrame struct {
	ID    string        `json:"id"`
	Type  string        `json:"type"`
	Ok    bool          `json:"ok"`
	Error *ErrorPayload `json:"error"`
}

// IsPilot reports whether tool is in the phase-1 allowlist.
func IsPilot(tool string) bool {
	for _, t := range PilotTools {
		if t == tool {
			return true
		}
	}
	return false
}

// TimeoutFor returns the per-tool budget (§5 table).
func TimeoutFor(tool string) int {
	if ms, ok := toolTimeouts[tool]; ok {
		return ms
	}
	return DefaultTimeoutMs
}

// ClampTimeout applies the per-call timeout rule: default per tool when
// ms <= 0, never above the 60 s ceiling without an explicit flag (no such
// flag exists in phase 1, so always clamp).
func ClampTimeout(tool string, ms int) int {
	if ms <= 0 {
		return TimeoutFor(tool)
	}
	if ms > DefaultTimeoutMs {
		return DefaultTimeoutMs
	}
	return ms
}

// NewRequestID generates a uuid v4 correlation id.
func NewRequestID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant 10
	hex := func(x []byte) string {
		const d = "0123456789abcdef"
		out := make([]byte, 0, len(x)*2)
		for _, c := range x {
			out = append(out, d[c>>4], d[c&0x0f])
		}
		return string(out)
	}
	return fmt.Sprintf("%s-%s-%s-%s-%s",
		hex(b[0:4]), hex(b[4:6]), hex(b[6:8]), hex(b[8:10]), hex(b[10:16]))
}

func asInt(v any) (int64, bool) {
	switch n := v.(type) {
	case float64:
		return int64(n), true
	case float32:
		return int64(n), true
	case int:
		return int64(n), true
	case int64:
		return n, true
	case int32:
		return int64(n), true
	default:
		return 0, false
	}
}

// NormalizeArgs applies the §4 tabId rule in place: absent means "active
// tab" (resolved by the extension); a zero/negative tabId is stripped so a
// literal 0 is never forwarded.
func NormalizeArgs(args map[string]any) {
	if args == nil {
		return
	}
	if v, ok := args["tabId"]; ok {
		if n, isNum := asInt(v); !isNum || n <= 0 {
			if !isNum {
				return // leave for ValidateToolCall to reject
			}
			delete(args, "tabId")
		}
	}
}

var navigateDirections = map[string]bool{"back": true, "forward": true, "reload": true}

func checkURL(v any) error {
	s, ok := v.(string)
	if !ok || s == "" {
		return fmt.Errorf("url must be a non-empty string")
	}
	u, err := url.Parse(s)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return fmt.Errorf("url must be http/https with a host")
	}
	return nil
}

func rejectUnknown(args map[string]any, allowed map[string]bool) error {
	for k := range args {
		if !allowed[k] {
			return fmt.Errorf("unexpected arg %q", k)
		}
	}
	return nil
}

// ValidateToolCall enforces the pilot allowlist + input_schema before
// anything crosses the WS (§7, falta 11). browser_batch (nested or not) is
// rejected with PROTOCOL.
func ValidateToolCall(tool string, args map[string]any) error {
	if tool == "browser_batch" {
		return fmt.Errorf("PROTOCOL: browser_batch nesting is blocked (§4)")
	}
	if !IsPilot(tool) {
		return fmt.Errorf("PROTOCOL: unknown tool %q (pilot: %s)", tool, strings.Join(PilotTools, ","))
	}
	if args == nil {
		args = map[string]any{}
	}
	NormalizeArgs(args)
	if v, ok := args["tabId"]; ok {
		if _, isNum := asInt(v); !isNum {
			return fmt.Errorf("PROTOCOL: tabId must be a number")
		}
	}
	switch tool {
	case "snapshot", "screenshot":
		return rejectUnknown(args, map[string]bool{"tabId": true})
	case "get_text":
		if err := rejectUnknown(args, map[string]bool{"tabId": true, "maxChars": true}); err != nil {
			return fmt.Errorf("PROTOCOL: %w", err)
		}
		if v, ok := args["maxChars"]; ok {
			n, isNum := asInt(v)
			if !isNum || n < 1 || n > 50000 {
				return fmt.Errorf("PROTOCOL: maxChars must be 1..50000")
			}
		}
		return nil
	case "navigate":
		if err := rejectUnknown(args, map[string]bool{"tabId": true, "url": true, "direction": true}); err != nil {
			return fmt.Errorf("PROTOCOL: %w", err)
		}
		_, hasURL := args["url"]
		_, hasDir := args["direction"]
		if !hasURL && !hasDir {
			return fmt.Errorf("PROTOCOL: navigate requires url or direction")
		}
		if hasURL {
			if err := checkURL(args["url"]); err != nil {
				return fmt.Errorf("PROTOCOL: %w", err)
			}
		}
		if hasDir {
			d, ok := args["direction"].(string)
			if !ok || !navigateDirections[d] {
				return fmt.Errorf("PROTOCOL: direction must be back|forward|reload")
			}
		}
		return nil
	case "tabs":
		if err := rejectUnknown(args, map[string]bool{"tabId": true, "url": true}); err != nil {
			return fmt.Errorf("PROTOCOL: %w", err)
		}
		if _, ok := args["url"]; ok {
			if err := checkURL(args["url"]); err != nil {
				return fmt.Errorf("PROTOCOL: %w", err)
			}
		}
		return nil
	}
	return fmt.Errorf("PROTOCOL: unknown tool %q", tool)
}

// IsBase64Strict checks the screenshot charset (raw base64, no data: URI).
func IsBase64Strict(s string) bool {
	if s == "" || len(s)%4 != 0 {
		return false
	}
	if strings.HasPrefix(s, "data:") {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		ok := c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' ||
			c >= '0' && c <= '9' || c == '+' || c == '/'
		if !ok {
			if c == '=' {
				// padding only allowed as the last 1-2 chars
				if i < len(s)-2 {
					return false
				}
				continue
			}
			return false
		}
	}
	// '=' may only appear at the very end.
	if idx := strings.IndexByte(s, '='); idx >= 0 && idx < len(s)-2 {
		return false
	}
	return true
}

// ValidateResultImages enforces the 8 MB cap + strict base64 on image payloads.
func ValidateResultImages(images []string) error {
	total := 0
	for _, img := range images {
		total += len(img)
		if total > MaxMessageBytes {
			return fmt.Errorf("OVERSIZE: images exceed 8 MB")
		}
		if !IsBase64Strict(img) {
			return fmt.Errorf("PROTOCOL: image is not strict base64 (no data: URI)")
		}
	}
	// Exercise the encoding package so oversized-but-valid payloads are real.
	_ = base64.StdEncoding
	return nil
}
