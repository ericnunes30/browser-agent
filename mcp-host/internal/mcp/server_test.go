package mcp

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"browseragent/mcp-host/internal/bridge"
	"browseragent/mcp-host/internal/logs"
	"browseragent/mcp-host/internal/queue"
)

type fakeConn struct {
	sent chan string
}

func (f *fakeConn) SendText(s string) error             { f.sent <- s; return nil }
func (f *fakeConn) Close(code int, reason string) error { return nil }
func (f *fakeConn) RemoteAddr() string                  { return "fake" }

func testServer() (*Server, *bridge.Hub, *fakeConn) {
	h := bridge.NewHub(queue.New(), logs.NewNop())
	fc := &fakeConn{sent: make(chan string, 8)}
	h.SetExtension(fc)
	return New(h, logs.NewNop(), "0.1.0-test"), h, fc
}

func rpc(t *testing.T, s *Server, method string, id any, params any) map[string]any {
	t.Helper()
	body, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params})
	req := httptest.NewRequest(http.MethodPost, "/mcp", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	s.HandleHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func answerFrames(t *testing.T, h *bridge.Hub, fc *fakeConn, n int, toolReply func(id, tool string) string) {
	t.Helper()
	go func() {
		for i := 0; i < n; i++ {
			raw := <-fc.sent
			var req map[string]any
			if err := json.Unmarshal([]byte(raw), &req); err != nil {
				t.Errorf("bad frame: %v", err)
				continue
			}
			id, _ := req["id"].(string)
			if req["type"] == "list_tools" {
				_ = h.HandleMessage(`{"id":"` + id + `","type":"tools_response","ok":true,"tools":[` +
					`{"name":"take_snapshot","description":"Accessibility snapshot","inputSchema":{"type":"object","properties":{"tabId":{"type":"number"}},"required":[]}},` +
					`{"name":"navigate","description":"Navigate","inputSchema":{"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}}]}`)
				continue
			}
			tool, _ := req["tool"].(string)
			_ = h.HandleMessage(toolReply(id, tool))
		}
	}()
}

func TestToolsListDynamic(t *testing.T) {
	s, h, fc := testServer()
	answerFrames(t, h, fc, 1, nil)
	out := rpc(t, s, "tools/list", 1, map[string]any{})
	res := out["result"].(map[string]any)
	tools := res["tools"].([]any)
	if len(tools) != 2 {
		t.Fatalf("want 2 dynamic tools, got %d", len(tools))
	}
	names := map[string]bool{}
	for _, tool := range tools {
		m := tool.(map[string]any)
		names[m["name"].(string)] = true
		if _, ok := m["inputSchema"].(map[string]any)["required"].([]any); !ok {
			t.Fatalf("required must be an array for %v", m["name"])
		}
	}
	if !names["take_snapshot"] || !names["navigate"] {
		t.Fatalf("missing canonical tools: %v", names)
	}
}

func TestToolsCallEmptyNameIs32602(t *testing.T) {
	s, _, fc := testServer()
	out := rpc(t, s, "tools/call", 2, map[string]any{"name": "", "arguments": map[string]any{}})
	e := out["error"].(map[string]any)
	if int(e["code"].(float64)) != -32602 {
		t.Fatalf("want -32602, got %v", e)
	}
	select {
	case msg := <-fc.sent:
		t.Fatalf("empty name must not reach extension: %s", msg)
	default:
	}
}

func TestToolsCallUnknownForwards(t *testing.T) {
	s, h, fc := testServer()
	answerFrames(t, h, fc, 1, func(id, tool string) string {
		return `{"id":"` + id + `","type":"tool_error","ok":false,"error":{"code":"INTERNAL","message":"unknown tool ` + tool + `"}}`
	})
	out := rpc(t, s, "tools/call", 3, map[string]any{"name": "browser_evaluate", "arguments": map[string]any{}})
	res := out["result"].(map[string]any)
	if res["isError"] != true {
		t.Fatalf("want isError, got %v", res)
	}
	if !strings.Contains(res["content"].([]any)[0].(map[string]any)["text"].(string), "INTERNAL") {
		t.Fatalf("want extension INTERNAL error, got %v", res)
	}
}

func TestToolsCallSnapshotRoundTrip(t *testing.T) {
	s, h, fc := testServer()
	answerFrames(t, h, fc, 1, func(id, tool string) string {
		if tool != "take_snapshot" {
			t.Errorf("want take_snapshot forwarded, got %s", tool)
		}
		return `{"id":"` + id + `","type":"tool_response","ok":true,"result":{"content":"[uid_7] link"}}`
	})
	out := rpc(t, s, "tools/call", 3, map[string]any{"name": "take_snapshot", "arguments": map[string]any{}})
	res := out["result"].(map[string]any)
	if res["isError"] == true {
		t.Fatalf("unexpected isError: %v", res)
	}
	blocks := res["content"].([]any)
	if !strings.Contains(blocks[0].(map[string]any)["text"].(string), "uid_7") {
		t.Fatalf("bad content: %v", res)
	}
}

func TestToolsCallDeniedIsError(t *testing.T) {
	s, h, fc := testServer()
	answerFrames(t, h, fc, 1, func(id, tool string) string {
		return `{"id":"` + id + `","type":"tool_error","ok":false,"error":{"code":"DENIED","message":"needs approval"}}`
	})
	out := rpc(t, s, "tools/call", 4, map[string]any{"name": "navigate", "arguments": map[string]any{"url": "https://x.example/"}})
	res := out["result"].(map[string]any)
	if res["isError"] != true {
		t.Fatalf("want isError, got %v", res)
	}
	if !strings.Contains(res["content"].([]any)[0].(map[string]any)["text"].(string), "DENIED") {
		t.Fatalf("bad error text: %v", res)
	}
}

func TestToolsCallScreenshotImageBlock(t *testing.T) {
	s, h, fc := testServer()
	answerFrames(t, h, fc, 1, func(id, tool string) string {
		return `{"id":"` + id + `","type":"tool_response","ok":true,"result":{"content":"shot","images":["aGVsbG8="]}}`
	})
	out := rpc(t, s, "tools/call", 5, map[string]any{"name": "computer", "arguments": map[string]any{"action": "screenshot"}})
	blocks := out["result"].(map[string]any)["content"].([]any)
	if len(blocks) != 2 || blocks[1].(map[string]any)["type"] != "image" {
		t.Fatalf("want text+image blocks, got %v", blocks)
	}
	if blocks[1].(map[string]any)["mimeType"] != "image/jpeg" {
		t.Fatalf("want image/jpeg, got %v", blocks[1])
	}
}

func TestNoExtensionTabGone(t *testing.T) {
	h := bridge.NewHub(queue.New(), logs.NewNop())
	s := New(h, logs.NewNop(), "0.1.0-test")
	out := rpc(t, s, "tools/call", 6, map[string]any{"name": "take_snapshot", "arguments": map[string]any{}})
	res := out["result"].(map[string]any)
	if res["isError"] != true {
		t.Fatalf("want isError TAB_GONE, got %v", res)
	}
	out = rpc(t, s, "tools/list", 7, map[string]any{})
	if e, ok := out["error"].(map[string]any); !ok || int(e["code"].(float64)) != -32000 {
		t.Fatalf("want -32000 extension unavailable, got %v", out)
	}
}

func TestInitialize(t *testing.T) {
	s, _, _ := testServer()
	out := rpc(t, s, "initialize", 7, map[string]any{})
	if out["result"].(map[string]any)["protocolVersion"] != ProtocolVersion {
		t.Fatalf("bad protocol version: %v", out)
	}
}

func TestStdioRoundTrip(t *testing.T) {
	s, h, fc := testServer()
	answerFrames(t, h, fc, 2, func(id, tool string) string {
		return `{"id":"` + id + `","type":"tool_error","ok":false,"error":{"code":"INTERNAL","message":"unknown tool ` + tool + `"}}`
	})
	in := strings.NewReader(
		"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}\n" +
			"{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"nope\",\"arguments\":{}}}\n",
	)
	var out bytes.Buffer
	s.ServeStdio(in, &out)
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 2 {
		t.Fatalf("want 2 response lines, got %q", out.String())
	}
	var r1 map[string]any
	_ = json.Unmarshal([]byte(lines[0]), &r1)
	if len(r1["result"].(map[string]any)["tools"].([]any)) != 2 {
		t.Fatalf("stdio tools/list wrong: %s", lines[0])
	}
	var r2 map[string]any
	_ = json.Unmarshal([]byte(lines[1]), &r2)
	res := r2["result"].(map[string]any)
	if res["isError"] != true {
		t.Fatalf("stdio unknown tool must forward+error, got %s", lines[1])
	}
}

func TestGetTextTruncates(t *testing.T) {
	s, h, fc := testServer()
	big := strings.Repeat("x", 60000)
	go func() {
		raw := <-fc.sent
		var req map[string]any
		_ = json.Unmarshal([]byte(raw), &req)
		payload, _ := json.Marshal(map[string]any{
			"id": req["id"], "type": "tool_response", "ok": true,
			"result": map[string]any{"content": big},
		})
		_ = h.HandleMessage(string(payload))
	}()
	out := rpc(t, s, "tools/call", 8, map[string]any{"name": "get_page_text", "arguments": map[string]any{}})
	text := out["result"].(map[string]any)["content"].([]any)[0].(map[string]any)["text"].(string)
	if len(text) != 50000+len("…[truncated]") || text[len(text)-len("[truncated]"):] != "[truncated]" {
		t.Fatalf("want truncated marker, got %d chars", len(text))
	}
}
