// Package mcp serves MCP JSON-RPC 2024-11-05 over stdio and Streamable HTTP
// (POST /mcp). The tool inventory is dynamic: the extension owns ALL_TOOLS
// and the daemon fetches it via list_tools (§7).
package mcp

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"browseragent/mcp-host/internal/bridge"
	"browseragent/mcp-host/internal/logs"
)

// ProtocolVersion is the MCP version spoken here.
const ProtocolVersion = "2024-11-05"

// ToolDef is one tools/list entry, as served from the extension inventory.
type ToolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

// Server dispatches JSON-RPC to the bridge hub.
type Server struct {
	Hub     *bridge.Hub
	Log     *logs.Logger
	Version string
	McpAuth string // optional Bearer for POST /mcp (--mcp-auth)
	Start   time.Time

	mu          sync.Mutex
	cachedTools []any
	haveCache   bool
}

// New builds a Server.
func New(hub *bridge.Hub, lg *logs.Logger, version string) *Server {
	if lg == nil {
		lg = logs.NewNop()
	}
	return &Server{Hub: hub, Log: lg, Version: version, Start: time.Now()}
}

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

func errResp(id json.RawMessage, code int, msg string) rpcResponse {
	if id == nil {
		id = json.RawMessage("null")
	}
	return rpcResponse{JSONRPC: "2.0", ID: id, Error: &rpcError{Code: code, Message: msg}}
}

func okResp(id json.RawMessage, result any) rpcResponse {
	if id == nil {
		id = json.RawMessage("null")
	}
	return rpcResponse{JSONRPC: "2.0", ID: id, Result: result}
}

// listTools returns the live extension inventory, falling back to the last
// good snapshot when the extension is momentarily unreachable.
func (s *Server) listTools() ([]any, error) {
	tools, err := s.Hub.ListTools(10000)
	if err == nil {
		s.mu.Lock()
		s.cachedTools = tools
		s.haveCache = true
		s.mu.Unlock()
		return tools, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.haveCache {
		return s.cachedTools, nil
	}
	return nil, err
}

// dispatch routes one JSON-RPC request. notify=true means no id → no reply.
func (s *Server) dispatch(req rpcRequest) (rpcResponse, bool) {
	if req.JSONRPC != "2.0" || req.Method == "" {
		return errResp(req.ID, -32600, "invalid request"), false
	}
	if len(req.ID) == 0 {
		// Notification: acknowledge without a body on stdio nothing is written.
		return rpcResponse{}, true
	}
	switch req.Method {
	case "initialize":
		return okResp(req.ID, map[string]any{
			"protocolVersion": ProtocolVersion,
			"serverInfo":      map[string]any{"name": "browser-agent", "version": s.Version},
			"capabilities":    map[string]any{"tools": map[string]any{}},
		}), false
	case "ping":
		return okResp(req.ID, map[string]any{}), false
	case "tools/list":
		tools, err := s.listTools()
		if err != nil {
			return errResp(req.ID, -32000, "extension unavailable: "+err.Error()), false
		}
		return okResp(req.ID, map[string]any{"tools": tools}), false
	case "tools/call":
		return s.call(req)
	default:
		return errResp(req.ID, -32601, "method not found: "+req.Method), false
	}
}

type callParams struct {
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments"`
}

func (s *Server) call(req rpcRequest) (rpcResponse, bool) {
	var p callParams
	if err := json.Unmarshal(req.Params, &p); err != nil || p.Name == "" {
		return errResp(req.ID, -32602, "tools/call requires {name, arguments}"), false
	}
	args := p.Arguments
	if args == nil {
		args = map[string]any{}
	}
	timeoutMs := 0
	if v, ok := args["_timeoutMs"]; ok {
		if f, ok := v.(float64); ok {
			timeoutMs = int(f)
		}
		delete(args, "_timeoutMs")
	}
	result, toolErr, err := s.Hub.Call(p.Name, args, timeoutMs)
	if err != nil {
		return errResp(req.ID, -32602, err.Error()), false
	}
	if toolErr != nil {
		return okResp(req.ID, map[string]any{
			"content": []any{map[string]any{"type": "text", "text": toolErr.Code + ": " + toolErr.Message}},
			"isError": true,
		}), false
	}
	content := result["content"]
	if str, ok := content.(string); ok && len(str) > 50000 {
		content = str[:50000] + "…[truncated]"
	}
	blocks := []any{map[string]any{"type": "text", "text": content}}
	appendImages := func(list []any) {
		for _, v := range list {
			str, ok := v.(string)
			if !ok {
				continue
			}
			blocks = append(blocks, map[string]any{"type": "image", "data": str, "mimeType": "image/jpeg"})
		}
	}
	if imgs, ok := result["images"].([]string); ok {
		anys := make([]any, 0, len(imgs))
		for _, img := range imgs {
			anys = append(anys, img)
		}
		appendImages(anys)
	} else if raw, ok := result["images"].([]any); ok {
		appendImages(raw)
	}
	return okResp(req.ID, map[string]any{"content": blocks}), false
}

// HandleHTTP serves Streamable HTTP: POST /mcp with one JSON-RPC per body (§3).
func (s *Server) HandleHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.McpAuth != "" {
		got := ""
		if ah := r.Header.Get("Authorization"); strings.HasPrefix(ah, "Bearer ") {
			got = strings.TrimPrefix(ah, "Bearer ")
		}
		if got != s.McpAuth {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, (8<<20)+1024))
	if err != nil {
		http.Error(w, "read failed", http.StatusBadRequest)
		return
	}
	var req rpcRequest
	if err := json.Unmarshal(body, &req); err != nil {
		raw, _ := json.Marshal(errResp(nil, -32700, "parse error"))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(raw)
		return
	}
	resp, notify := s.dispatch(req)
	w.Header().Set("Content-Type", "application/json")
	if notify {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	raw, _ := json.Marshal(resp)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(raw)
}

// ServeStdio runs MCP JSON-RPC on in/out, one JSON per line (§2).
// EOF on in ends the stdio session without killing the daemon (§5).
func (s *Server) ServeStdio(in io.Reader, out io.Writer) {
	sc := bufio.NewScanner(in)
	sc.Buffer(make([]byte, 64<<10), 16<<20)
	bw := bufio.NewWriter(out)
	defer bw.Flush()
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var req rpcRequest
		if err := json.Unmarshal([]byte(line), &req); err != nil {
			raw, _ := json.Marshal(errResp(nil, -32700, "parse error"))
			_, _ = bw.Write(append(raw, '\n'))
			_ = bw.Flush()
			continue
		}
		resp, notify := s.dispatch(req)
		if notify {
			continue
		}
		raw, _ := json.Marshal(resp)
		_, _ = bw.Write(append(raw, '\n'))
		_ = bw.Flush()
	}
	_, _ = fmt.Fprintln(out)
}
