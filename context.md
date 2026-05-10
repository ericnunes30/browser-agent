# Code Context — BrowserAgent

## Complete Source Tree (excluding node_modules, .git)

```
browserAgent/
├── .bsd/                          # BSD debug markers
├── .docs/claude-extension/        # Reference docs from Claude extension
│   ├── 01-visao-geral.md
│   ├── 02-manifest-permissoes.md
│   ├── 03-arquitetura.md
│   ├── 04-capacidades-features.md
│   ├── 05-fluxo-comunicacao.md
│   ├── 06-analise-tecnica-para-replicacao.md
│   ├── 07-i18n-strings-uteis.md
│   ├── 08-mcp-architecture.md
│   ├── 09-plano-implementacao.md
│   └── PRD.md
├── .gitignore
├── .specs/                        # Specs & execution reviews
│   ├── features/
│   │   ├── browser-extension/     # Core extension specs (design, spec, tasks, execution T1-T14)
│   │   ├── commands-and-automation/
│   │   ├── file-tools/
│   │   ├── pi-model-tracker/
│   │   ├── pi-sdk-migration/      # Design + tasks + execution reviews
│   │   ├── popup-window/
│   │   ├── site-permissions/
│   │   ├── tab-groups/
│   │   ├── visual-indicators-complete/
│   │   └── web-search-fetch/
│   └── project/
│       ├── PROJECT.md
│       ├── ROADMAP.md
│       └── STATE.md
├── dist/                          # Built extension output
│   ├── _locales/en/messages.json
│   ├── _locales/pt_BR/messages.json
│   ├── assets/*.js, *.css
│   ├── config/
│   │   ├── models.custom.json
│   │   └── models.default.json
│   ├── icons/
│   ├── manifest.json
│   ├── offscreen.html
│   ├── options.html
│   ├── service-worker-loader.js
│   └── sidepanel.html
├── extension/                     # Extension source (Vite root)
│   ├── _locales/en|pt_BR/messages.json
│   ├── config/
│   │   ├── models.custom.json     # Custom model overrides (API keys visible!)
│   │   └── models.default.json    # Default models (openai, anthropic)
│   ├── docs/mcp-bridge.md
│   ├── icons/
│   ├── manifest.json              # Chrome MV3 manifest
│   ├── offscreen.html
│   ├── options.html
│   ├── sidepanel.html
│   └── src/
│       ├── content-scripts/
│       │   ├── accessibility-tree.ts
│       │   ├── agent-indicator.ts
│       │   └── file-bridge.ts
│       ├── offscreen/
│       │   ├── offscreen.tsx
│       │   └── style.css
│       ├── options/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   └── style.css
│       ├── service-worker/
│       │   ├── index.ts           # Main SW: message routing, NativeBridge init
│       │   ├── messages.ts
│       │   ├── native-bridge.ts   # NativeBridge class — connects to native host
│       │   ├── permissions.ts
│       │   ├── providers/types.ts
│       │   ├── scheduled-tasks.ts
│       │   ├── tab-group.ts
│       │   └── tools.ts
│       ├── side-panel/
│       │   ├── App.tsx
│       │   ├── ChatContext.tsx
│       │   ├── chat-stream.ts
│       │   ├── components/
│       │   │   ├── ChatInput.tsx
│       │   │   ├── ChatWindow.tsx
│       │   │   ├── CommandsMenu.tsx
│       │   │   ├── Header.tsx
│       │   │   ├── MessageBubble.tsx
│       │   │   ├── PermissionPrompt.tsx
│       │   │   └── TaskManager.tsx
│       │   ├── index.tsx
│       │   └── style.css
│       └── utils/i18n.ts
├── features-pendentes.md
├── native-host/                   # Native Messaging Host (Node.js)
│   ├── dist/                      # Compiled output (built)
│   │   ├── browser-tools.js      # 19 custom tool definitions
│   │   ├── index.js              # Entry point: stdin/stdout JSONL loop
│   │   ├── pisdk-host.js         # PiSDKHost class
│   │   ├── protocol.js           # BridgeMessage/HostEvent types (minimal)
│   │   └── *.d.ts, *.js.map
│   ├── package.json
│   ├── package-lock.json
│   └── src/
│       ├── index.ts              # Main entry: reads stdin, dispatches messages
│       ├── pisdk-host.ts         # Session lifecycle, tool routing, event forwarding
│       ├── browser-tools.ts      # 19 Pi SDK custom tools (defineTool)
│       ├── protocol.ts           # Type definitions
│       └── tsconfig.json
├── nul                           # (empty file)
├── package.json
├── package-lock.json
├── review-sync-models-watch.json
├── review-t6.json
├── scripts/sync-models.js
├── tsconfig.json
└── vite.config.ts
```

## Files Retrieved

1. **`package.json`** (full) — Project root: Vite+React Chrome extension, uses `@crxjs/vite-plugin` for building
2. **`vite.config.ts`** (full) — Builds from `extension/` dir, outputs to `dist/`, copies `models.custom.json`
3. **`tsconfig.json`** (full) — ESNext target, bundler module resolution
4. **`extension/manifest.json`** (full) — MV3 manifest with `nativeMessaging` permission, sidePanel, content scripts
5. **`extension/src/service-worker/native-bridge.ts`** (full) — NativeBridge class connecting to `com.pi.browseragent`
6. **`extension/src/service-worker/index.ts`** (full) — Main SW: init, message routing, chat streaming
7. **`native-host/package.json`** (full) — Deps: `@mariozechner/pi-coding-agent`, `@sinclair/typebox`
8. **`native-host/tsconfig.json`** (full) — ESM, NodeNext, output to `dist/`
9. **`native-host/src/index.ts`** (full) — stdin/stdout JSONL loop, dispatches messages to PiSDKHost
10. **`native-host/src/protocol.ts`** (full) — BridgeMessage & HostEvent types
11. **`native-host/src/pisdk-host.ts`** (full) — AgentSession lifecycle, tool routing via execTool callback
12. **`native-host/src/browser-tools.ts`** (full) — 19 custom tools (computer, navigate, read_page, etc.)
13. **`extension/config/models.default.json`** (full) — OpenAI & Anthropic model configs
14. **`extension/config/models.custom.json`** (full) — Custom providers (opencode-go, minimax, etc.) with API keys
15. **`.specs/features/pi-sdk-migration/design.md`** (lines 420-500) — Installation design spec for native host manifest

## Key Code

### NativeBridge — the bridge from SW to native host
- **File:** `extension/src/service-worker/native-bridge.ts`
- **Line 94:** `this.port = chrome.runtime.connectNative('com.pi.browseragent');`
- **Line 107:** Detects `"Specified native messaging host not found"` → sets `permanentFailure = true`
- When host is unavailable, falls back to `directChat()` (text-only, NO tools)

### PiSDKHost — native host logic
- **File:** `native-host/src/pisdk-host.ts`
- **Line 268:** `tools: []` (no built-in read/bash/edit)
- **Line 269:** `customTools: createBrowserTools(execToolCallback)` — all 19 browser tools
- **Line 222:** Tool execution: sends `toolExec` event to SW, awaits reply via `pendingToolCalls` map

### Browser Tools (19 tools)
- **File:** `native-host/src/browser-tools.ts`
- Tools: computer, navigate, read_page, javascript_tool, form_input, file_upload, get_page_text, read_console_messages, read_network_requests, resize_window, tabs_context, tabs_create, browser_batch, web_search, web_fetch, download, read_file, create_file, edit_file
- Each tool calls `execTool(toolCallId, name, args)` which sends a `toolExec` message to the Service Worker

### Manifest
- **File:** `extension/manifest.json`
- Permission `nativeMessaging` listed (line 28)
- Extension connects to host named `com.pi.browseragent`

## Architecture

```
Side Panel (React)                    Service Worker (MV3)
     │                                      │
     │──chat:send──────────────────────────►│
     │    (chrome.runtime.connect)          │
     │                                      ├── NativeBridge.connectNative('com.pi.browseragent')
     │                                      │         │
     │                                      │    ┌────▼──────────────────────────────┐
     │                                      │    │  Native Messaging Host (Node.js)  │
     │◄──delta/reasoning/toolEnd/done───────┤    │  - index.ts (stdin/stdout loop)   │
     │                                      │    │  - PiSDKHost (AgentSession)       │
     │                                      │    │  - browser-tools.ts (19 tools)    │
     │                                      │    │  - Pi SDK (@mariozechner/...)     │
     │                                      │    └───────────────────────────────────┘
     │                                      │
     │                                      ├── Fallback: directChat() (no tools)
     │                                      │    (when native host not available)
     │                                      │
     │                                      └── Content Scripts (via tabs)
     │                                          (accessibility-tree, agent-indicator, file-bridge)
```

**Data flow:**
1. User types message → Side Panel → `chat:send` port message → SW
2. SW checks `NativeBridge.isHostAvailable`
3. **If host available:** Creates NativeBridge instance → `connectNative('com.pi.browseragent')` → sends prompt → Host's PiSDKHost creates AgentSession → SDK streams events → Host forwards `delta`/`toolExec`/`done` events → SW routes to Side Panel
4. **If host unavailable:** Uses `directChat()` fallback (raw HTTP fetch to API) — **text only, no tool execution**

**Tool execution flow (when host available):**
1. Pi SDK decides to call a tool → PiSDKHost sends `toolExec` to SW via NativeBridge
2. SW's `onToolExec` callback → `executeTool(name, args, tabId)` in `tools.ts`
3. Result sent back via `sendToolResult(toolCallId, content, error)`
4. Pi SDK receives result and continues generating

## Start Here

Open **`native-host/src/index.ts`** first — it's the entry point of the native messaging host. Then `extension/src/service-worker/native-bridge.ts` to understand the connection attempt.

## Critical Finding: Missing Native Messaging Host Manifest

**Root cause of "Native messaging host not found" error:**

1. The extension calls `chrome.runtime.connectNative('com.pi.browseragent')` (native-bridge.ts:94)
2. **There is NO native messaging host manifest registered for `com.pi.browseragent`**
3. The registry key `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.pi.browseragent` does **not** exist
4. The file `native-host/manifests/com.pi.browseragent.json` does **not** exist (mentioned in design docs at `.specs/features/pi-sdk-migration/design.md` line 438)
5. The install script `native-host/src/install.ts` does **not** exist (mentioned in design docs line 455)
6. The native host binary is compiled at `native-host/dist/index.js` but there's no mechanism to register it with Chrome

**What needs to happen to fix:**
- Create the native messaging host manifest JSON file (`com.pi.browseragent.json`)
- Register it in the Windows registry at `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.pi.browseragent`
- The manifest must point to a working native host executable (e.g., `node G:/novosApps/pi-softwares-ideias/browserAgent/native-host/dist/index.js`)
- Or create `native-host/src/install.ts` and run `npm run install:host` to automate this

**Fallback behavior (current):**
- When the host is not found, `NativeBridge` sets `permanentFailure = true` (native-bridge.ts:108)
- `isHostAvailable` returns `false`
- SW uses `directChat()` fallback (index.ts:748-773) — direct HTTP fetch to LLM API
- **Custom tools (19 browser tools) do NOT load or function** without the native host
- Only basic text chat works

**Other observations:**
- `extension/config/models.custom.json` contains plaintext API keys — this is bundled into the extension and accessible via `chrome.runtime.getURL()`
- The `@mariozechner/pi-coding-agent` SDK is deprecated (package-lock.json shows deprecation notice: "please use @earendil-works/pi-coding-agent")
- The native host is compiled (ESM) and ready at `native-host/dist/index.js` — only registration is missing
