// Package mcp serves MCP JSON-RPC 2024-11-05 over stdio and Streamable HTTP
// (POST /mcp), backed by the pilot allowlist (§7).
package mcp

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"browseragent/mcp-host/internal/bridge"
	"browseragent/mcp-host/internal/logs"
)

// ProtocolVersion is the MCP version spoken here.
const ProtocolVersion = "2024-11-05"

// ToolDef is one tools/list entry.
type ToolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

func schema(props map[string]any, required ...string) map[string]any {
	if required == nil {
		required = []string{} // Opencode rejeita "required": null; array vazio é válido
	}
	return map[string]any{
		"type": "object", "properties": props, "required": required,
		"additionalProperties": false,
	}
}

func tabIDProp() map[string]any {
	return map[string]any{"type": "number", "description": "Chrome tab id; omit for the active tab"}
}

// PilotDefs is exactly the 5 pilot tools (§7).
var PilotDefs = []ToolDef{
	{
		Name:        "snapshot",
		Description: "Accessibility snapshot of the tab: interactive tree with uids.",
		InputSchema: schema(map[string]any{"tabId": tabIDProp()}),
	},
	{
		Name:        "screenshot",
		Description: "Visible-tab screenshot; returns PNG as base64 images.",
		InputSchema: schema(map[string]any{"tabId": tabIDProp()}),
	},
	{
		Name:        "navigate",
		Description: "Navigate the tab (url or back|forward|reload). http/https only.",
		InputSchema: schema(map[string]any{
			"tabId":     tabIDProp(),
			"url":       map[string]any{"type": "string", "description": "http(s) URL to load"},
			"direction": map[string]any{"type": "string", "enum": []string{"back", "forward", "reload"}},
		}),
	},
	{
		Name:        "get_text",
		Description: "Rendered page text, truncated at 50 000 chars.",
		InputSchema: schema(map[string]any{
			"tabId":    tabIDProp(),
			"maxChars": map[string]any{"type": "number", "minimum": 1, "maximum": 50000},
		}),
	},
	{
		Name:        "tabs",
		Description: "List tabs, or create one when url is given.",
		InputSchema: schema(map[string]any{
			"tabId": tabIDProp(),
			"url":   map[string]any{"type": "string", "description": "http(s) URL to open in a new tab"},
		}),
	},
}

// Server dispatches JSON-RPC to the bridge hub.
type Server struct {
	Hub     *bridge.Hub
	Log     *logs.Logger
	Version string
	McpAuth string // optional Bearer for POST /mcp (--mcp-auth)
	Start   time.Time
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
		tools := make([]any, 0, len(PilotDefs))
		for _, t := range PilotDefs {
			tools = append(tools, t)
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
	known := false
	for _, t := range PilotDefs {
		if t.Name == p.Name {
			known = true
			break
		}
	}
	if !known {
		// Unknown tool: MCP -32602 without touching the extension (§7).
		return errResp(req.ID, -32602, "unknown tool "+p.Name+" (pilot: snapshot, screenshot, navigate, get_text, tabs)"), false
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
	if p.Name == "get_text" {
		if str, ok := content.(string); ok && len(str) > 50000 {
			content = str[:50000]
		}
	}
	blocks := []any{map[string]any{"type": "text", "text": content}}
	if imgs, _ := result["images"].([]string); len(imgs) > 0 {
		for _, img := range imgs {
			blocks = append(blocks, map[string]any{"type": "image", "data": img, "mimeType": "image/png"})
		}
	} else if raw, ok := result["images"].([]any); ok {
		for _, v := range raw {
			if str, ok := v.(string); ok {
				blocks = append(blocks, map[string]any{"type": "image", "data": str, "mimeType": "image/png"})
			}
		}
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
