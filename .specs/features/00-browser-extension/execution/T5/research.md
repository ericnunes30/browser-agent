---
phase: research
task: T5
feature: browser-extension
timestamp: 2026-05-07T17:34:37.673Z
attempt: 1
---

## T5 Research — Tool Executor Integration

### 1. Multi-turn Tool Loop: in handleChatSend
- Wrap llmProvider.chat() in loop, accumulate tool calls per turn
- Execute tools, append results: OpenAI → {role:'tool', tool_call_id, content}, Anthropic → {role:'user', content:[{type:'tool_result', ...}]}
- Continue loop until model returns text-only (no tool calls)
- MAX_TURNS=10 safety valve

### 2. chrome.debugger Screenshots: keep attached with idle detach
- Attach → Page.captureScreenshot → idle 30s → detach
- Handle "already attached" and "not attached" errors gracefully
- Listen for chrome.tabs.onRemoved to detach
- Full page via captureBeyondViewport: true

### 3. executeScript: world:'ISOLATED', return JSON from func
- Click: dispatchEvent MouseEvents
- Type: per-character input events
- Scroll: window.scrollBy
- Read: document.body.innerText
- Navigate: chrome.tabs.update + wait for complete