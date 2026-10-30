// Package bridge hub: extension registry, per-tab queue, per-id correlation,
// plus the minimal stdlib-only WebSocket server for GET /ws (§3, §4).
package bridge

import (
	"bufio"
	"context"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"sync"
	"time"

	"browseragent/mcp-host/internal/auth"
	"browseragent/mcp-host/internal/logs"
	"browseragent/mcp-host/internal/queue"
)

// ErrAbuse signals 10 protocol errors within 10 s → close with 4400 (§4).
var ErrAbuse = errors.New("bridge: too many protocol errors")

// WSConn abstracts the extension socket so tests can use a fake.
type WSConn interface {
	SendText(string) error
	Close(code int, reason string) error
	RemoteAddr() string
}

type incoming struct {
	result  map[string]any
	toolErr *ErrorPayload
}

// Hub registers the single extension connection, correlates responses by id,
// and serializes calls per tab via queue.Queue.
type Hub struct {
	mu      sync.Mutex
	ext     WSConn
	pending map[string]chan incoming
	q       *queue.Queue
	log     *logs.Logger
	start   time.Time

	// OnAuth runs once per successful /ws handshake (used by the daemon to
	// close the one-click pairing window). Nil-safe; never blocks the loop.
	OnAuth func()

	errTimes []time.Time
}

// NewHub builds a Hub. lg may be logs.NewNop() in tests.
func NewHub(q *queue.Queue, lg *logs.Logger) *Hub {
	if q == nil {
		q = queue.New()
	}
	if lg == nil {
		lg = logs.NewNop()
	}
	return &Hub{pending: make(map[string]chan incoming), q: q, log: lg, start: time.Now()}
}

// SetExtension registers (or replaces) the extension connection.
func (h *Hub) SetExtension(c WSConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.ext = c
	h.log.Log("info", "extension connected", "", nil, nil)
}

// ClearExtension unregisters the extension; MCP keeps answering TAB_GONE (§5).
func (h *Hub) ClearExtension() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.ext = nil
	h.log.Log("info", "extension disconnected", "", nil, nil)
}

// Connected reports whether the extension socket is registered.
func (h *Hub) Connected() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.ext != nil
}

// PendingCount returns in-flight correlated calls (used for /status tabs).
func (h *Hub) PendingCount() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.pending)
}

// Uptime returns seconds since hub creation.
func (h *Hub) Uptime() int64 { return int64(time.Since(h.start).Seconds()) }

// extension returns the current conn (caller must hold no lock issues; safe copy).
func (h *Hub) extension() WSConn {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.ext
}

// RecordProtocolError tracks malformed frames; true means abusive (close 4400).
func (h *Hub) RecordProtocolError() bool {
	now := time.Now()
	h.mu.Lock()
	defer h.mu.Unlock()
	h.errTimes = append(h.errTimes, now)
	cutoff := now.Add(-10 * time.Second)
	kept := h.errTimes[:0]
	for _, t := range h.errTimes {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	h.errTimes = kept
	return len(kept) >= 10
}

type envelope struct {
	ID     *string        `json:"id"`
	Type   string         `json:"type"`
	Ok     *bool          `json:"ok"`
	Result *ResultPayload `json:"result"`
	Error  *ErrorPayload  `json:"error"`
}

// route delivers to the waiter for id; false when unknown/stale.
func (h *Hub) route(id string, msg incoming) bool {
	h.mu.Lock()
	ch, ok := h.pending[id]
	h.mu.Unlock()
	if !ok {
		return false
	}
	select {
	case ch <- msg:
	default:
		// duplicate/late response; drop, keep the first.
	}
	return true
}

// FailOversize routes an OVERSIZE tool_error to a pending caller when the
// frame carried an id; otherwise the frame is dropped (§4, fluxo 10).
func (h *Hub) FailOversize(raw string) {
	var env envelope
	if err := json.Unmarshal([]byte(raw), &env); err != nil || env.ID == nil || *env.ID == "" {
		return
	}
	h.route(*env.ID, incoming{toolErr: &ErrorPayload{Code: CodeOversize, Message: "frame exceeds 8 MB"}})
}

// HandleMessage processes one extension→daemon frame. Malformed frames are
// dropped (counted); only abuse returns ErrAbuse — one bad frame never kills
// the socket (§4).
func (h *Hub) HandleMessage(raw string) error {
	if len(raw) > MaxMessageBytes {
		h.FailOversize(raw)
		return nil
	}
	var env envelope
	if err := json.Unmarshal([]byte(raw), &env); err != nil || env.ID == nil || *env.ID == "" || env.Type == "" {
		if h.RecordProtocolError() {
			return ErrAbuse
		}
		return nil
	}
	id := *env.ID
	switch env.Type {
	case FrameResponse:
		if env.Result == nil {
			if h.RecordProtocolError() {
				return ErrAbuse
			}
			return nil
		}
		if err := ValidateResultImages(env.Result.Images); err != nil {
			h.route(id, incoming{toolErr: &ErrorPayload{Code: CodeOversize, Message: err.Error()}})
			return nil
		}
		h.route(id, incoming{result: map[string]any{
			"content": env.Result.Content,
			"images":  env.Result.Images,
		}})
		return nil
	case FrameError:
		if env.Error == nil || env.Error.Code == "" {
			if h.RecordProtocolError() {
				return ErrAbuse
			}
			return nil
		}
		h.route(id, incoming{toolErr: env.Error})
		return nil
	default:
		if h.RecordProtocolError() {
			return ErrAbuse
		}
		return nil
	}
}

// Call validates, queues per tab, sends one tool_request, and waits for the
// correlated response or timeout. 1 tools/call = 1 executeTool, stateless (§4).
// Returns either result, toolErr (extension-side failure incl. TIMEOUT and
// TAB_GONE), or err for daemon-side invalid params (MCP -32602).
func (h *Hub) Call(tool string, args map[string]any, timeoutMs int) (map[string]any, *ErrorPayload, error) {
	if err := ValidateToolCall(tool, args); err != nil {
		return nil, nil, err
	}
	timeoutMs = ClampTimeout(tool, timeoutMs)
	if args == nil {
		args = map[string]any{}
	}
	key := queue.TabKey(args)
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()
	if err := h.q.AcquireContext(ctx, key); err != nil {
		return nil, &ErrorPayload{Code: CodeTimeout, Message: "queue wait exceeded budget"}, nil
	}
	defer h.q.Release(key)

	ext := h.extension()
	if ext == nil {
		return nil, &ErrorPayload{Code: CodeTabGone, Message: "extension not connected"}, nil
	}
	id := NewRequestID()
	ch := make(chan incoming, 1)
	h.mu.Lock()
	h.pending[id] = ch
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.pending, id)
		h.mu.Unlock()
	}()

	req := ToolRequest{ID: id, Type: FrameRequest, Tool: tool, Args: args, TimeoutMs: timeoutMs}
	raw, err := json.Marshal(req)
	if err != nil {
		return nil, &ErrorPayload{Code: CodeInternal, Message: "encode request"}, nil
	}
	tabID := tabIDOf(args)
	t0 := time.Now()
	if err := ext.SendText(string(raw)); err != nil {
		h.log.Log("error", "ws send failed", tool, tabID, nil)
		return nil, &ErrorPayload{Code: CodeTabGone, Message: "extension socket write failed"}, nil
	}
	select {
	case <-ctx.Done():
		ms := time.Since(t0).Milliseconds()
		h.log.Log("error", "TIMEOUT waiting extension", tool, tabID, &ms)
		return nil, &ErrorPayload{Code: CodeTimeout, Message: fmt.Sprintf("%s exceeded %d ms", tool, timeoutMs)}, nil
	case msg := <-ch:
		ms := time.Since(t0).Milliseconds()
		if msg.toolErr != nil {
			h.log.Log("error", msg.toolErr.Code+": "+truncate(msg.toolErr.Message, 200), tool, tabID, &ms)
			return nil, msg.toolErr, nil
		}
		h.log.Log("info", "tool ok", tool, tabID, &ms)
		return msg.result, nil, nil
	}
}

func tabIDOf(args map[string]any) *int64 {
	if args == nil {
		return nil
	}
	if v, ok := args["tabId"]; ok {
		if n, isNum := asInt(v); isNum && n >= 1 {
			return &n
		}
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// ---------------------------------------------------------------------------
// Minimal WebSocket server (stdlib only): handshake + text frames.
// ---------------------------------------------------------------------------

func wsAccept(key string) string {
	h := sha1.New()
	h.Write([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

type rawConn struct {
	mu   sync.Mutex
	conn net.Conn
}

func (r *rawConn) SendText(s string) error {
	return writeFrame(r.conn, &r.mu, 0x1, []byte(s))
}

func (r *rawConn) Close(code int, reason string) error {
	payload := make([]byte, 2+len(reason))
	binary.BigEndian.PutUint16(payload, uint16(code))
	copy(payload[2:], reason)
	_ = writeFrame(r.conn, &r.mu, 0x8, payload)
	return r.conn.Close()
}

func (r *rawConn) RemoteAddr() string { return r.conn.RemoteAddr().String() }

func writeFrame(conn net.Conn, mu *sync.Mutex, opcode byte, payload []byte) error {
	mu.Lock()
	defer mu.Unlock()
	_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	header := []byte{0x80 | opcode}
	n := len(payload)
	switch {
	case n < 126:
		header = append(header, byte(n))
	case n < 65536:
		header = append(header, 126, byte(n>>8), byte(n))
	default:
		header = append(header, 127, 0, 0, 0, 0, byte(n>>24), byte(n>>16), byte(n>>8), byte(n))
	}
	if _, err := conn.Write(header); err != nil {
		return err
	}
	if n > 0 {
		if _, err := conn.Write(payload); err != nil {
			return err
		}
	}
	return nil
}

func readFrame(r *bufio.Reader) (opcode byte, payload []byte, err error) {
	hdr := make([]byte, 2)
	if _, err = io.ReadFull(r, hdr); err != nil {
		return 0, nil, err
	}
	fin := hdr[0]&0x80 != 0
	opcode = hdr[0] & 0x0f
	masked := hdr[1]&0x80 != 0
	length := int64(hdr[1] & 0x7f)
	switch length {
	case 126:
		var ext [2]byte
		if _, err = io.ReadFull(r, ext[:]); err != nil {
			return 0, nil, err
		}
		length = int64(binary.BigEndian.Uint16(ext[:]))
	case 127:
		var ext [8]byte
		if _, err = io.ReadFull(r, ext[:]); err != nil {
			return 0, nil, err
		}
		length = int64(binary.BigEndian.Uint64(ext[:]))
	}
	if length < 0 || length > 64<<20 {
		return 0, nil, fmt.Errorf("bridge: absurd frame length %d", length)
	}
	var mask [4]byte
	if masked {
		if _, err = io.ReadFull(r, mask[:]); err != nil {
			return 0, nil, err
		}
	}
	payload = make([]byte, length)
	if _, err = io.ReadFull(r, payload); err != nil {
		return 0, nil, err
	}
	if masked {
		for i := range payload {
			payload[i] ^= mask[i%4]
		}
	}
	_ = fin
	return opcode, payload, nil
}

// ServeWS upgrades GET /ws after Bearer validation (§3). Invalid token → 403.
func ServeWS(h *Hub, expectedToken string, w http.ResponseWriter, r *http.Request) {
	token := ""
	if ah := r.Header.Get("Authorization"); ah != "" {
		if len(ah) > 7 && ah[:7] == "Bearer " {
			token = ah[7:]
		}
	}
	if token == "" {
		// Only the initial pairing handshake may use ?token=.
		token = r.URL.Query().Get("token")
	}
	// Trust-on-first-use (SPEC §3): loopback SEM token passa uma única vez,
	// antes de qualquer pareamento. O 1º handshake válido grava `paired`
	// (via OnAuth) e trava a janela; depois disso, token sempre exigido.
	if token == "" && !auth.IsPaired() {
		// segue para o upgrade sem token
	} else if !auth.Accepts(token, expectedToken) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	key := r.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		http.Error(w, "websocket upgrade required", http.StatusBadRequest)
		return
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "hijack unsupported", http.StatusInternalServerError)
		return
	}
	conn, rw, err := hj.Hijack()
	if err != nil {
		http.Error(w, "hijack failed", http.StatusInternalServerError)
		return
	}
	accept := wsAccept(key)
	resp := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\nConnection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
	if _, err := rw.WriteString(resp); err != nil {
		conn.Close()
		return
	}
	if err := rw.Flush(); err != nil {
		conn.Close()
		return
	}
	rc := &rawConn{conn: conn}
	h.SetExtension(rc)
	if h.OnAuth != nil {
		h.OnAuth()
	}
	defer h.ClearExtension()
	defer conn.Close()

	br := bufio.NewReader(conn)
	var frag []byte
	var fragOp byte
	for {
		_ = conn.SetReadDeadline(time.Now().Add(5 * time.Minute))
		op, payload, err := readFrame(br)
		if err != nil {
			return // client gone; daemon stays up (§5)
		}
		switch op {
		case 0x8: // close
			_ = writeFrame(conn, &rc.mu, 0x8, payload)
			return
		case 0x9: // ping
			_ = writeFrame(conn, &rc.mu, 0xA, payload)
		case 0xA: // pong
			continue
		case 0x1, 0x2, 0x0:
			if op == 0x2 {
				if h.RecordProtocolError() {
					_ = rc.Close(4400, "protocol abuse")
					return
				}
				continue
			}
			if op != 0x0 {
				fragOp = op
				frag = payload
			} else {
				frag = append(frag, payload...)
			}
			// Our writer always sets FIN; treat every text frame as complete.
			_ = fragOp
			text := string(frag)
			frag = nil
			if len(text) > MaxMessageBytes {
				h.FailOversize(text)
				continue
			}
			if err := h.HandleMessage(text); err != nil {
				_ = rc.Close(4400, "protocol abuse")
				return
			}
		default:
			if h.RecordProtocolError() {
				_ = rc.Close(4400, "protocol abuse")
				return
			}
		}
	}
}

// authCompare is kept for tests callers; prefer auth.Accepts (token or pairing code).
func authCompare(a, b string) bool { return auth.Validate(a, b) }
