package bridge

import (
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"

	"browseragent/mcp-host/internal/logs"
	"browseragent/mcp-host/internal/queue"
)

// fakeConn captures daemon→extension traffic and lets the test answer.
type fakeConn struct {
	mu   sync.Mutex
	sent []string
	fail error
}

func (f *fakeConn) SendText(s string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fail != nil {
		return f.fail
	}
	f.sent = append(f.sent, s)
	return nil
}
func (f *fakeConn) Close(code int, reason string) error { return nil }
func (f *fakeConn) RemoteAddr() string                  { return "fake" }
func (f *fakeConn) last() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.sent) == 0 {
		return ""
	}
	return f.sent[len(f.sent)-1]
}

func newTestHub() (*Hub, *fakeConn) {
	fc := &fakeConn{}
	h := NewHub(queue.New(), logs.NewNop())
	h.SetExtension(fc)
	return h, fc
}

func answer(t *testing.T, h *Hub, fc *fakeConn, build func(id string) string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for fc.last() == "" && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	raw := fc.last()
	if raw == "" {
		t.Fatal("daemon sent nothing")
	}
	var req ToolRequest
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		t.Fatal(err)
	}
	if req.ID == "" || req.Type != FrameRequest {
		t.Fatalf("bad request frame: %s", raw)
	}
	if err := h.HandleMessage(build(req.ID)); err != nil {
		t.Fatal(err)
	}
}

func TestCallSuccessRoundTrip(t *testing.T) {
	h, fc := newTestHub()
	done := make(chan struct{})
	var res map[string]any
	var terr *ErrorPayload
	var rerr error
	go func() {
		defer close(done)
		res, terr, rerr = h.Call("snapshot", map[string]any{}, 2000)
	}()
	answer(t, h, fc, func(id string) string {
		return `{"id":"` + id + `","type":"tool_response","ok":true,"result":{"content":"[uid_1] button"}}`
	})
	<-done
	if rerr != nil || terr != nil {
		t.Fatalf("rerr=%v terr=%+v", rerr, terr)
	}
	if !strings.Contains(res["content"].(string), "uid_1") {
		t.Fatalf("bad content: %v", res)
	}
}

func TestCallScreenshotImages(t *testing.T) {
	h, fc := newTestHub()
	done := make(chan struct{})
	var res map[string]any
	go func() {
		defer close(done)
		var terr *ErrorPayload
		var rerr error
		res, terr, rerr = h.Call("screenshot", map[string]any{}, 2000)
		if terr != nil || rerr != nil {
			t.Errorf("terr=%+v rerr=%v", terr, rerr)
		}
	}()
	answer(t, h, fc, func(id string) string {
		return `{"id":"` + id + `","type":"tool_response","ok":true,"result":{"content":"shot","images":["aGVsbG8="]}}`
	})
	<-done
	if res == nil {
		t.Fatal("nil result")
	}
}

func TestCallDeniedMaps(t *testing.T) {
	h, fc := newTestHub()
	done := make(chan struct{})
	var terr *ErrorPayload
	go func() {
		defer close(done)
		_, terr, _ = h.Call("navigate", map[string]any{"url": "https://blocked.example/"}, 2000)
	}()
	answer(t, h, fc, func(id string) string {
		return `{"id":"` + id + `","type":"tool_error","ok":false,"error":{"code":"DENIED","message":"domain not allowed"}}`
	})
	<-done
	if terr == nil || terr.Code != CodeDenied {
		t.Fatalf("want DENIED, got %+v", terr)
	}
}

func TestUnknownToolNeverTouchesExtension(t *testing.T) {
	h, fc := newTestHub()
	_, _, err := h.Call("browser_evaluate", map[string]any{}, 500)
	if err == nil {
		t.Fatal("want validation error")
	}
	if fc.last() != "" {
		t.Fatal("unknown tool must not reach the extension")
	}
}

func TestCallTimeoutSimulated(t *testing.T) {
	h, _ := newTestHub() // never answer
	_, terr, _ := h.Call("snapshot", map[string]any{}, 50)
	if terr == nil || terr.Code != CodeTimeout {
		t.Fatalf("want TIMEOUT, got %+v", terr)
	}
}

func TestNoExtensionTabGone(t *testing.T) {
	h := NewHub(queue.New(), logs.NewNop()) // no extension registered
	_, terr, _ := h.Call("snapshot", map[string]any{}, 500)
	if terr == nil || terr.Code != CodeTabGone {
		t.Fatalf("want TAB_GONE, got %+v", terr)
	}
}

func TestOutOfOrderResponses(t *testing.T) {
	h, fc := newTestHub()
	type out struct {
		res map[string]any
		err *ErrorPayload
	}
	aCh := make(chan out, 1)
	bCh := make(chan out, 1)
	go func() {
		// Different tabs → parallel queues; use explicit tabIds.
		res, terr, _ := h.Call("snapshot", map[string]any{"tabId": float64(1)}, 2000)
		aCh <- out{res, terr}
	}()
	go func() {
		res, terr, _ := h.Call("snapshot", map[string]any{"tabId": float64(2)}, 2000)
		bCh <- out{res, terr}
	}()
	deadline := time.Now().Add(2 * time.Second)
	for {
		fc.mu.Lock()
		n := len(fc.sent)
		fc.mu.Unlock()
		if n >= 2 || time.Now().After(deadline) {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	fc.mu.Lock()
	sent := append([]string{}, fc.sent...)
	fc.mu.Unlock()
	if len(sent) != 2 {
		t.Fatalf("want 2 requests, got %d", len(sent))
	}
	var ids []string
	for _, s := range sent {
		var req ToolRequest
		_ = json.Unmarshal([]byte(s), &req)
		ids = append(ids, req.ID)
	}
	// Answer in reverse order: correlation by id must still work.
	_ = h.HandleMessage(`{"id":"` + ids[1] + `","type":"tool_response","ok":true,"result":{"content":"second"}}`)
	_ = h.HandleMessage(`{"id":"` + ids[0] + `","type":"tool_response","ok":true,"result":{"content":"first"}}`)
	a := <-aCh
	b := <-bCh
	if a.res["content"] != "first" || b.res["content"] != "second" {
		t.Fatalf("mis-correlated: %+v %+v", a, b)
	}
}

func TestMalformedNeverKillsSocket(t *testing.T) {
	h, _ := newTestHub()
	for _, bad := range []string{"not json", `{"no":"id"}`, `{"id":"","type":""}`, `{"id":"x","type":"bogus"}`} {
		if err := h.HandleMessage(bad); err != nil {
			t.Fatalf("single bad frame must not error: %v", err)
		}
	}
}

func TestAbuseCloses(t *testing.T) {
	h := NewHub(queue.New(), logs.NewNop())
	var err error
	for i := 0; i < 10; i++ {
		err = h.HandleMessage("garbage-" + string(rune('0'+i)))
	}
	if err != ErrAbuse {
		t.Fatalf("want ErrAbuse after 10 bad frames, got %v", err)
	}
}

func TestOversizeDropped(t *testing.T) {
	h, fc := newTestHub()
	done := make(chan *ErrorPayload, 1)
	go func() {
		_, terr, _ := h.Call("screenshot", map[string]any{}, 2000)
		done <- terr
	}()
	deadline := time.Now().Add(2 * time.Second)
	for fc.last() == "" && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	// Extension answers with a frame larger than 8 MB.
	huge := strings.Repeat("A", MaxMessageBytes+1)
	var req ToolRequest
	_ = json.Unmarshal([]byte(fc.last()), &req)
	raw, _ := json.Marshal(map[string]any{
		"id": req.ID, "type": "tool_response", "ok": true,
		"result": map[string]any{"content": huge},
	})
	if err := h.HandleMessage(string(raw)); err != nil {
		t.Fatal(err)
	}
	select {
	case terr := <-done:
		if terr == nil || terr.Code != CodeOversize {
			t.Fatalf("want OVERSIZE, got %+v", terr)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("caller hung on oversize frame")
	}
}
