# Tasks — Browser Extension

> Feature: `browser-extension`  
> Phase: Tasks  
> Total: 14 tasks (T1–T14) + dependencies graph

---

## Task Dependency Graph

```
T1 ────┬──── T2 ────┬──── T3 ────┬──── T6 ────┬──── T13
       │            │            │            │
       │            │            ├──── T7 ────┤
       │            │            │            │
       │            │            ├──── T11    │
       │            │            │            │
       │            ├──── T5 ────┴──── T8     │
       │            │                         │
       │            └──── T12                 │
       │                                      │
       ├──── T4 ────┬──── T9                  │
       │            │                         │
       │            └──── T5 (CS tools)       │
       │                                      │
       └──── T10                              │
                                              │
T14 ──── (depends on T3, runs independently)  │
```

---

## T1 — Extension Scaffold

| Field | Value |
|-------|-------|
| **Depends on** | — |
| **Depended by** | T2, T4, T10 |
| **Estimate** | Small (1-2 files created, < 10 files total) |
| **Files** | `extension/manifest.json`, `vite.config.ts`, `tsconfig.json`, `package.json`, `public/*.html`, `public/icons/*.png`, `src/` structure |

### Subtasks

| ID | Description | File |
|----|-------------|------|
| T1.1 | Create `manifest.json` with MV3 config, permissions, CSP | `extension/manifest.json` |
| T1.2 | Configure Vite build with MV3 plugin (service worker + HTML pages) | `vite.config.ts` |
| T1.3 | Create TypeScript config (base, strict mode) | `tsconfig.json` |
| T1.4 | Setup package.json with scripts (dev, build, pack) | `package.json` |
| T1.5 | Create HTML shells: sidepanel, options, offscreen | `public/*.html` |
| T1.6 | Generate placeholder icons (16/32/48/128) | `public/icons/` |
| T1.7 | Create empty feature modules with placeholder exports | `src/service-worker/index.ts`, `src/content-scripts/`, `src/sidepanel/`, `src/options/` |
| T1.8 | Verify build: `npm run build` → `dist/` loads in Chrome without errors | — |

### Reuses
- Manifest structure from `.docs/claude-extension/02-manifest-permissoes.md`
- Vite plugin: `@crxjs/vite-plugin` or `vite-plugin-web-extension`

### Done When
- [ ] `npm run build` exits 0
- [ ] Extension loads in `chrome://extensions` with zero errors
- [ ] Side panel opens (blank, no crashes)
- [ ] Service worker console shows `[SW] browser-agent v1.0 loaded`
- [ ] HMR works: `npm run dev` reloads extension on save

---

## T2 — Service Worker Core

| Field | Value |
|-------|-------|
| **Depends on** | T1 |
| **Depended by** | T3, T5, T12 |
| **Estimate** | Medium (~200 lines) |
| **Files** | `src/service-worker/index.ts`, `src/service-worker/messages.ts`, `src/service-worker/tab-group.ts` |

### Subtasks

| ID | Description | File |
|----|-------------|------|
| T2.1 | Implement lifecycle handlers (onInstalled, onStartup) | `src/service-worker/index.ts` |
| T2.2 | Implement MessageRouter with typed dispatch | `src/service-worker/messages.ts` |
| T2.3 | Define all message types as TypeScript discriminated unions | `src/service-worker/messages.ts` |
| T2.4 | Implement TabGroupManager (create, close, track events) | `src/service-worker/tab-group.ts` |
| T2.5 | Implement side panel lifecycle (open → init, track active tab) | `src/service-worker/index.ts` |
| T2.6 | Setup keep-alive alarm (chrome.alarms every 0.5 min) | `src/service-worker/index.ts` |
| T2.7 | Connect React port from side panel (chrome.runtime.connect) | `src/service-worker/index.ts` |

### Reuses
- Communication patterns from `.docs/claude-extension/05-fluxo-comunicacao.md`
- Message types from PRD.md Section 7

### Done When
- [ ] Side panel sends `ping` → SW responds `pong`
- [ ] SW detects tab URL changes and stores state
- [ ] Tab group closes cleanly when last tab removed
- [ ] SW stays alive > 60s idle (keep-alive working)
- [ ] Invalid messages return controlled errors (not crash)
- [ ] `chrome://serviceworker-internals` shows active worker

---

## T3 — Provider Layer

| Field | Value |
|-------|-------|
| **Depends on** | T2 |
| **Depended by** | T6, T7, T11, T14 |
| **Estimate** | Medium (~300 lines) |
| **Files** | `src/service-worker/providers/index.ts`, `openai.ts`, `anthropic.ts`, `models-loader.ts`, `types.ts` |

### Subtasks

| ID | Description | File |
|----|-------------|------|
| T3.1 | Define TypeScript interfaces (ProviderConfig, ModelDef, ChatParams, ChatChunk) | `src/service-worker/providers/types.ts` |
| T3.2 | Implement ModelsLoader (read from chrome.storage, validate, fallback) | `src/service-worker/providers/models-loader.ts` |
| T3.3 | Implement ProviderFactory (dispatch by `api` field) | `src/service-worker/providers/index.ts` |
| T3.4 | Implement OpenAI-compatible adapter (fetch + SSE parse + tool call extract) | `src/service-worker/providers/openai.ts` |
| T3.5 | Implement Anthropic adapter (fetch + SSE parse + tool use extract) | `src/service-worker/providers/anthropic.ts` |
| T3.6 | Handle compat flags (reasoningEffort, thinkingFormat, developerRole) | `src/service-worker/providers/openai.ts`, `anthropic.ts` |
| T3.7 | Wire `models:list` and `chat:send` messages in MessageRouter | `src/service-worker/messages.ts` |
| T3.8 | Create default models config (`config/models.default.json`) | `config/models.default.json` |

### Reuses
- Provider format from `~/.pi/agent/models.json`
- SSE parsing patterns from original extension bundles

### Done When
- [ ] `models:list` returns typed array of models from storage
- [ ] `chat:send` with OpenAI provider returns streaming text
- [ ] `chat:send` with Anthropic provider returns streaming text
- [ ] Tool call detected in OpenAI response → extracted as typed object
- [ ] Missing API key → error message, not crash
- [ ] Network error → parsed error in chat
- [ ] Default bundled config works without storage data

---

## T4 — Content Scripts Base

| Field | Value |
|-------|-------|
| **Depends on** | T1 |
| **Depended by** | T9, T5 (CS-based tools) |
| **Estimate** | Medium (~250 lines) |
| **Files** | `src/content-scripts/accessibility-tree.ts`, `src/content-scripts/agent-indicator.ts` |

### Subtasks

| ID | Description | File |
|----|-------------|------|
| T4.1 | Implement interactive element scanner (TreeWalker + role filter) | `src/content-scripts/accessibility-tree.ts` |
| T4.2 | Implement message listener (handle `cs:accessibility-tree` request) | `src/content-scripts/accessibility-tree.ts` |
| T4.3 | Return elements with: role, name, position (getBoundingClientRect), actions, attributes | `src/content-scripts/accessibility-tree.ts` |
| T4.4 | Handle Shadow DOM traversal | `src/content-scripts/accessibility-tree.ts` |
| T4.5 | Implement agent overlay div injection (create, append, z-index safe) | `src/content-scripts/agent-indicator.ts` |
| T4.6 | Register both scripts in `manifest.json` with `run_at: document_idle` | `manifest.json` |

### Reuses
- Interactive roles set from original extension analysis
- Shadow DOM patterns from MCP permissions file analysis

### Done When
- [ ] Content script logs `[CS] loaded` on every http/https page
- [ ] `cs:accessibility-tree` returns non-empty array on example.com
- [ ] Each element has: role, name, rect{x,y,w,h}, actions
- [ ] Shadow DOM elements included in results
- [ ] Overlay div exists in DOM with `pointer-events: none`
- [ ] SPA navigation doesn't require re-injection

---

## T5 — Tool Executor (P0 Tools)

| Field | Value |
|-------|-------|
| **Depends on** | T2 (+ T4 for read_page) |
| **Depended by** | T8 |
| **Estimate** | Large (~400 lines) |
| **Files** | `src/service-worker/tool-executor.ts`, `src/service-worker/screenshot.ts` |

### Subtasks

| ID | Description | File |
|----|-------------|------|
| T5.1 | Define ToolDef interface and tool registry | `src/service-worker/tool-executor.ts` |
| T5.2 | Implement `navigate` tool (chrome.tabs.update) | `src/service-worker/tool-executor.ts` |
| T5.3 | Implement `click` tool (executeScript → dispatchEvent) | `src/service-worker/tool-executor.ts` |
| T5.4 | Implement `type` tool (executeScript → set value + dispatch input event) | `src/service-worker/tool-executor.ts` |
| T5.5 | Implement `screenshot` tool (chrome.debugger → Page.captureScreenshot) | `src/service-worker/screenshot.ts` |
| T5.6 | Implement `scroll` tool (executeScript → window.scrollBy) | `src/service-worker/tool-executor.ts` |
| T5.7 | Implement `read_page` tool (executeScript → innerText or CS accessibility) | `src/service-worker/tool-executor.ts` |
| T5.8 | Add timeout wrapper (default 10s per tool) | `src/service-worker/tool-executor.ts` |
| T5.9 | Convert tools to OpenAI/Anthropic function format for provider | `src/service-worker/tool-executor.ts` |
| T5.10 | Wire tool call handling in chat flow (detect → execute → feed result) | `src/service-worker/messages.ts` |

### Reuses
- Tool schemas from `.docs/claude-extension/04-capacidades-features.md`
- Screenshot context from original screenshot.ts analysis

### Done When
- [ ] Each P0 tool executes successfully on a test page
- [ ] `click` on button fires click event in the page
- [ ] `type` in input sets `.value` correctly
- [ ] `screenshot` returns valid PNG data URL (opened in new tab = shows page)
- [ ] `scroll` updates window.scrollY
- [ ] `read_page` returns visible text content
- [ ] Tool timeout fires after 10s of no response
- [ ] Tool errors return descriptive messages

---

## T6 — Side Panel UI

| Field | Value |
|-------|-------|
| **Depends on** | T3 |
| **Depended by** | T11 (UI part), T13 |
| **Estimate** | Large (~500 lines) |
| **Files** | `src/sidepanel/App.tsx`, `main.tsx`, `components/*.tsx`, `hooks/*.ts`, `styles/*.css` |

### Subtasks

| ID | Description | File |
|----|-------------|------|
| T6.1 | Setup React root with `chrome.runtime.connect` to SW | `src/sidepanel/main.tsx` |
| T6.2 | Create ChatState context + useReducer | `src/sidepanel/App.tsx` |
| T6.3 | Implement Chat component (message list with auto-scroll) | `src/sidepanel/components/Chat.tsx` |
| T6.4 | Implement Message component (user right, assistant left, markdown render) | `src/sidepanel/components/Message.tsx` |
| T6.5 | Implement ChatInput (textarea, Enter=send, Shift+Enter=newline) | `src/sidepanel/components/ChatInput.tsx` |
| T6.6 | Implement ModelSelector (cascade: provider → model) | `src/sidepanel/components/ModelSelector.tsx` |
| T6.7 | Implement ToolCard (expandable: name, status, input, result) | `src/sidepanel/components/ToolCard.tsx` |
| T6.8 | Implement PermissionPrompt (modal: Allow, Deny, Allow Once) | `src/sidepanel/components/PermissionPrompt.tsx` |
| T6.9 | Implement useChat hook (send, stream, tool call cycle, abort) | `src/sidepanel/hooks/useChat.ts` |
| T6.10 | Implement useModels hook (load list from SW, selection) | `src/sidepanel/hooks/useModels.ts` |
| T6.11 | Create CSS: variables (theme), chat layout, components | `src/sidepanel/styles/` |
| T6.12 | Add dark/light theme support (prefers-color-scheme) | `src/sidepanel/styles/variables.css` |

### Reuses
- Chat patterns from original Claude extension (reverse-engineered UI)
- Tool display format from analysis of `capabilities|automation` strings

### Done When
- [ ] Side panel renders without console errors
- [ ] Model selector shows providers → models
- [ ] User message appears right-aligned, model response left-aligned
- [ ] Model response streams word-by-word (not all at once)
- [ ] Tool call appears as expandable card during execution
- [ ] Permission prompt appears as modal on first action
- [ ] Enter sends, Shift+Enter inserts newline
- [ ] Dark theme activates via system preference
- [ ] UI works at 300px-600px width
- [ ] Empty state: "Selecione um modelo para começar" when no model chosen

---

## T7 — Options Page

| Field | Value |
|-------|-------|
| **Depends on** | T3 |
| **Depended by** | — |
| **Estimate** | Medium (~300 lines) |
| **Files** | `src/options/App.tsx`, `ModelsConfig.tsx`, `General.tsx` |

### Subtasks

| ID | Description | File |
|----|-------------|------|
| T7.1 | Setup Options page HTML + React entry | `public/options.html`, `src/options/main.tsx` |
| T7.2 | Implement tab layout (Models | General) | `src/options/App.tsx` |
| T7.3 | Implement ModelsConfig: provider list with expand/collapse | `src/options/ModelsConfig.tsx` |
| T7.4 | Implement Add Provider form (baseUrl, api type, apiKey, models) | `src/options/ModelsConfig.tsx` |
| T7.5 | Implement Edit/Remove provider with confirmation | `src/options/ModelsConfig.tsx` |
| T7.6 | Implement Import JSON (file upload + text paste) | `src/options/ModelsConfig.tsx` |
| T7.7 | Implement Export JSON (download) | `src/options/ModelsConfig.tsx` |
| T7.8 | Implement Sync from pi/agent/models.json button (placeholder or real) | `src/options/ModelsConfig.tsx` |
| T7.9 | Implement General settings (theme toggle, language) | `src/options/General.tsx` |
| T7.10 | Add form validation (required fields, URL format, JSON parse) | `src/options/ModelsConfig.tsx` |

### Reuses
- Provider config format from PRD.md Section 6.2
- chrome.storage API patterns from T3

### Done When
- [ ] Options page renders with Models tab
- [ ] Add provider → saves to storage → appears in list
- [ ] Edit provider → updates storage → model selector reflects changes
- [ ] Remove provider → confirmation → removed from storage
- [ ] Import valid JSON → providers appear, merge existing
- [ ] Import invalid JSON → error message shown
- [ ] Export → downloads JSON matching current config
- [ ] API key field uses type=password by default

---

## T8 — Permissions System

| Field | Value |
|-------|-------|
| **Depends on** | T5 |
| **Depended by** | — |
| **Estimate** | Medium (~250 lines) |
| **Files** | `src/service-worker/permissions.ts` |

### Subtasks

| ID | Description | File |
|----|-------------|------|
| T8.1 | Define PermissionManager class with site and action policies | `src/service-worker/permissions.ts` |
| T8.2 | Implement policy check (site → action → mode → decision) | `src/service-worker/permissions.ts` |
| T8.3 | Implement policy storage (chrome.storage.local, key `PERMISSION_STORAGE`) | `src/service-worker/permissions.ts` |
| T8.4 | Implement permission modes: `ask`, `auto`, `skip_all` | `src/service-worker/permissions.ts` |
| T8.5 | Implement one-time permissions (allow_once, deny_once) | `src/service-worker/permissions.ts` |
| T8.6 | Wire PermissionManager as gate in tool execution flow | `src/service-worker/messages.ts` |
| T8.7 | Add permission UI for viewing/revoking in Options | `src/options/General.tsx` or new component |

### Reuses
- Permission types from `.docs/claude-extension/08-mcp-architecture.md` (My enums)
- Storage patterns from original extension analysis

### Done When
- [ ] First action on new site prompts for permission (side panel)
- [ ] Allow → action executes, site saved as allowed
- [ ] Deny → action blocked, agent informed "permission_denied"
- [ ] Second action on allowed site → no prompt
- [ ] Allow Once → only this action, next one prompts again
- [ ] Auto mode → allowed sites skip prompts
- [ ] Ask mode → always prompts (ignores cache)
- [ ] Permissions survive Chrome restart
- [ ] Options shows all granted/denied permissions

---

## T9 — Visual Indicators

| Field | Value |
|-------|-------|
| **Depends on** | T4 |
| **Depended by** | — |
| **Estimate** | Small (~150 lines) |
| **Files** | `src/content-scripts/agent-indicator.ts` (expand) |

### Subtasks

| ID | Description | File |
|----|-------------|------|
| T9.1 | Implement ghost cursor positioning (move to x,y with CSS transition) | `src/content-scripts/agent-indicator.ts` |
| T9.2 | Implement element highlight (border + glow around target) | `src/content-scripts/agent-indicator.ts` |
| T9.3 | Implement click ripple animation (expanding circle, 200ms, fade) | `src/content-scripts/agent-indicator.ts` |
| T9.4 | Implement typing indicator (blinking caret in target input) | `src/content-scripts/agent-indicator.ts` |
| T9.5 | Handle z-index stacking (overlay above modals when needed) | `src/content-scripts/agent-indicator.ts` |
| T9.6 | Wire `cs:indicator-move` and `cs:highlight` message handlers | `src/content-scripts/agent-indicator.ts` |

### Reuses
- Overlay div from T4.5
- CSS animation patterns from original extension

### Done When
- [ ] Ghost cursor appears at click target, then fades after 500ms
- [ ] Target element gets blue highlight border before action
- [ ] Click creates ripple animation at click point
- [ ] Typing cursor blinks in target input for 1.5s
- [ ] All overlays have `pointer-events: none`
- [ ] Overlay works above page modals (z-index: 2147483647)
- [ ] Visuals don't trigger CSP violations or React errors

---

## T10 — Offscreen Document

| Field | Value |
|-------|-------|
| **Depends on** | T1 |
| **Depended by** | — |
| **Estimate** | Small (~100 lines) |
| **Files** | `src/offscreen/audio.ts`, `src/offscreen/gif-generator.ts` |

### Subtasks

| ID | Description | File |
|----|-------------|------|
| T10.1 | Setup offscreen.html with js reference | `public/offscreen.html` |
| T10.2 | Implement audio playback via Web Audio API | `src/offscreen/audio.ts` |
| T10.3 | Implement GIF recording (offscreen canvas → gif.js or manual) | `src/offscreen/gif-generator.ts` |
| T10.4 | Create offscreen document lifecycle manager in SW | `src/service-worker/offscreen-manager.ts` |
| T10.5 | Wire messages: `offscreen:play-audio`, `offscreen:stop-audio`, `offscreen:record-gif` | `src/service-worker/messages.ts` |

### Reuses
- Offscreen patterns from original extension analysis (`offscreen.js`)

### Done When
- [ ] Audio plays through speakers without opening a visible tab
- [ ] Stop immediate works
- [ ] GIF records and saves as valid animated image
- [ ] Offscreen document closes after use (check `chrome://offscreen`)
- [ ] Multiple offscreen calls don't accumulate documents

---

## T11 — Scheduled Tasks

| Field | Value |
|-------|-------|
| **Depends on** | T3, T6 (UI list) |
| **Depended by** | — |
| **Estimate** | Medium (~200 lines) |
| **Files** | `src/service-worker/scheduled-tasks.ts`, UI component in side panel |

### Subtasks

| ID | Description | File |
|----|-------------|------|
| T11.1 | Implement task scheduler (create/edit/delete with chrome.alarms) | `src/service-worker/scheduled-tasks.ts` |
| T11.2 | Implement task execution on alarm fire | `src/service-worker/scheduled-tasks.ts` |
| T11.3 | Implement task storage (chrome.storage.local) | `src/service-worker/scheduled-tasks.ts` |
| T11.4 | Restore alarms on SW startup | `src/service-worker/index.ts` |
| T11.5 | Notify user on task failure (chrome.notifications) | `src/service-worker/scheduled-tasks.ts` |
| T11.6 | Create TaskList UI component in side panel | `src/sidepanel/components/TaskList.tsx` |
| T11.7 | Create TaskForm UI (create/edit modal) | `src/sidepanel/components/TaskForm.tsx` |

### Reuses
- chrome.alarms patterns from original extension
- chrome.notifications from manifest permissions

### Done When
- [ ] Create task → appears in list with next run time
- [ ] Task fires at scheduled time (± 1 min)
- [ ] Task executes programmed action (navigate, screenshot, etc.)
- [ ] Failed task shows notification
- [ ] Delete task → alarm cancelled, removed from storage
- [ ] Tasks survive Chrome restart

---

## T12 — MCP Bridge (Placeholder)

| Field | Value |
|-------|-------|
| **Depends on** | T2 |
| **Depended by** | — |
| **Estimate** | Small (~50 lines + types) |
| **Files** | `src/service-worker/mcp/index.ts`, `types.ts`, `registry.ts`, `bridge.ts` |

### Subtasks

| ID | Description | File |
|----|-------------|------|
| T12.1 | Define MCP JSON-RPC 2.0 types (ToolRequest, ToolResponse, Notification) | `src/service-worker/mcp/types.ts` |
| T12.2 | Create placeholder exports that log "MCP not implemented" | `src/service-worker/mcp/index.ts` |
| T12.3 | Create empty registry for future native host registration | `src/service-worker/mcp/registry.ts` |
| T12.4 | Create empty bridge file with WebSocket connect signature | `src/service-worker/mcp/bridge.ts` |

### Reuses
- MCP protocol types from `.docs/claude-extension/08-mcp-architecture.md`
- JSON-RPC 2.0 spec

### Done When
- [ ] Types export without errors
- [ ] Any MCP function call logs `[SW:MCP] not implemented`
- [ ] No network connections established
- [ ] No native messaging attempted
- [ ] Types follow MCP spec (JSON-RPC 2.0 compliant)

---

## T13 — i18n

| Field | Value |
|-------|-------|
| **Depends on** | T6 |
| **Depended by** | — |
| **Estimate** | Small (~100 lines in JSON files) |
| **Files** | `_locales/pt_BR/messages.json`, `_locales/en/messages.json`, `manifest.json` |

### Subtasks

| ID | Description | File |
|----|-------------|------|
| T13.1 | Create pt_BR messages.json (all UI strings) | `_locales/pt_BR/messages.json` |
| T13.2 | Create en messages.json (all UI strings, fallback) | `_locales/en/messages.json` |
| T13.3 | Set `default_locale: "pt_BR"` in manifest | `manifest.json` |
| T13.4 | Replace hardcoded strings in React with `chrome.i18n.getMessage()` | `src/sidepanel/`, `src/options/` |
| T13.5 | Handle placeholders with variables ($1, $2) | all React components |

### Reuses
- i18n patterns from `.docs/claude-extension/07-i18n-strings-uteis.md`
- chrome.i18n API

### Done When
- [ ] Chrome in pt-BR → interface in Portuguese
- [ ] Chrome in en-US → interface in English
- [ ] No hardcoded visible strings in source code
- [ ] Placeholder strings with variables render correctly
- [ ] Missing key returns "" (not crash)

---

## T14 — sync-models.js

| Field | Value |
|-------|-------|
| **Depends on** | T3 |
| **Depended by** | — |
| **Estimate** | Small (~80 lines) |
| **Files** | `extension/scripts/sync-models.js` |

### Subtasks

| ID | Description | File |
|----|-------------|------|
| T14.1 | Read `~/.pi/agent/models.json` from filesystem | `extension/scripts/sync-models.js` |
| T14.2 | Read `extension/config/models.custom.json` | `extension/scripts/sync-models.js` |
| T14.3 | Deep merge (custom overrides pi on conflict) | `extension/scripts/sync-models.js` |
| T14.4 | Validate merged config against schema | `extension/scripts/sync-models.js` |
| T14.5 | Output to stdout or file (configurable via --output flag) | `extension/scripts/sync-models.js` |
| T14.6 | Handle missing files gracefully (warn, not crash) | `extension/scripts/sync-models.js` |
| T14.7 | Print summary: providers found, models count, errors | `extension/scripts/sync-models.js` |

### Reuses
- Provider config format from T3
- pi models.json format from `~/.pi/agent/models.json`

### Done When
- [ ] `node extension/scripts/sync-models.js` runs without errors
- [ ] Reads pi models.json (opencode-go, minimax, xiaomimimo)
- [ ] Merges with custom.json correctly
- [ ] Output is valid JSON matching ProviderConfig format
- [ ] Missing pi models.json → uses custom only (warns)
- [ ] Missing custom.json → uses pi only (warns)
- [ ] `--output merged.json` creates file
- [ ] Invalid JSON in input → reports error with line number

---

## Task Execution Order

```
Wave 1 (parallel):     T1
Wave 2 (parallel):     T2, T4, T10
Wave 3 (parallel):     T3, T5
Wave 4 (parallel):     T6, T7, T8, T9, T12
Wave 5 (parallel):     T11, T13, T14
```

**Blockers:**
- T3 blocked by T2 (needs message routing)
- T5 blocked by T2 (needs tab management)
- T6 blocked by T3 (needs provider to show models)
- T8 blocked by T5 (needs tools to gate)
- T9 blocked by T4 (needs overlay div)
- T11 blocked by T3, T6 (needs provider + UI)
- T14 blocked by T3 (needs config format)

**Parallelizable:**
- T6, T7 can be done in parallel (different entry points, same storage)
- T9, T10 can be done in parallel (different contexts)
- T11, T12, T13, T14 all in final wave (independent)
