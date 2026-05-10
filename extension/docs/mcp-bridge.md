# MCP Bridge — Model Context Protocol Integration

## Overview

The MCP Bridge exposes BrowserAgent tools as an MCP server, allowing coding agents (like pi) to control a browser through natural language commands.

## Architecture

```
┌────────────┐   stdio/SSE   ┌──────────────────┐   chrome.runtime   ┌────────────┐
│ pi agent   │◄────────────►│ Native Host Binary│◄─────────────────►│ Service    │
│ (coding)   │              │ (mcp-host.exe)    │                    │ Worker     │
└────────────┘              └──────────────────┘                    └────────────┘
                                                                          │
                                                                          ▼
                                                                    ┌──────────┐
                                                                    │ Tool     │
                                                                    │ Executor │
                                                                    └──────────┘
```

## MCP Protocol

MCP uses JSON-RPC 2.0 over stdio or SSE. The server exposes:
- **Tools**: Executable actions (browser_navigate, browser_click, etc.)
- **Resources**: Read-only data (accessibility tree, page content)
- **Prompts**: Predefined templates

## Available Tools

| MCP Tool Name | BrowserAgent Tool | Description |
|---|---|---|
| `browser_navigate` | navigate | Navigate to a URL |
| `browser_click` | click | Click an element |
| `browser_type` | type | Type into input fields |
| `browser_scroll` | scroll | Scroll the page |
| `browser_read_page` | read_page | Read page text |
| `browser_screenshot` | screenshot | Capture a screenshot |
| `browser_accessibility_tree` | accessibility_tree | Get interactive elements |

## Message Format

### Initialize
```json
{ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {} }
```

### List Tools
```json
{ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }
```

### Call Tool
```json
{ "jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": { "name": "browser_navigate", "arguments": { "url": "https://example.com" } } }
```

## v1 vs v2

**v1 (current):** Placeholder implementation. The `MCPBridge` class exists but doesn't actively handle requests. The native host binary is not implemented.

**v2 (planned):**
1. Implement a native messaging host binary (`mcp-host`) that bridges stdio ↔ chrome.runtime
2. Use `@modelcontextprotocol/sdk` for the MCP server framework
3. Properly wire `handleToolCall` to `executeTool` via message passing

## Security Considerations

- MCP connections should be authenticated (future: API key or OAuth)
- Tools should respect the permission system (check origin before executing)
- Rate limiting on tool calls to prevent abuse
- Audit logging for all MCP tool executions
