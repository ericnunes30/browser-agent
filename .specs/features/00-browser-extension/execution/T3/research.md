---
phase: research
task: T3
feature: browser-extension
timestamp: 2026-05-07T16:44:00.406Z
attempt: 1
---

## T3 Research — Streaming & API Details

### 1. Streaming Pattern: Option A (port.postMessage directly)
- Store active sidepanel port in module-level variable
- chat:send handler bypasses router, calls port.postMessage per chunk
- No changes to messages.ts required (simpler than registerStreamingHandler)

### 2. ChatChunk Type
```ts
type ChatChunk =
  | { kind: 'text'; tabId: number; content: string }
  | { kind: 'tool_call_start'; tabId: number; toolCallId: string; toolName: string }
  | { kind: 'tool_call_delta'; tabId: number; toolCallId: string; argsDelta: string }
  | { kind: 'tool_call_end'; tabId: number; toolCallId: string; args: unknown }
  | { kind: 'reasoning'; tabId: number; content: string }
  | { kind: 'done'; tabId: number; stopReason: string }
  | { kind: 'error'; tabId: number; error: string };
```

### 3. SSE Parsers: OpenAI (data: JSON lines + [DONE]) vs Anthropic (event: + data: lines)
Both handle partial tool calls via accumulator pattern.

### 4. Compat Flags Mapping
| Flag | OpenAI | Anthropic |
|------|--------|-----------|
| supportsDeveloperRole=false | Map role:"developer" → "system" | N/A |
| supportsReasoningEffort=true | body.reasoning_effort = 'medium' | body.thinking = {type:'enabled', budget_tokens:16000} |
| thinkingFormat="deepseek" | body.reasoning_effort='max' + inject reasoning_content on history | N/A |

Full SSE parsing code and compat flag mapping provided. Recommended 5 new files: types.ts, registry.ts, sse-parser.ts, openai.ts, anthropic.ts.