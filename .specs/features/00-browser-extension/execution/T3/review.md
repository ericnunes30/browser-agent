---
phase: review
task: T3
feature: browser-extension
timestamp: 2026-05-07T17:00:00.659Z
attempt: 1
---

## T3 Review — REJECTED (BLOCKERS)

### B1 (BLOCKER): chat:abort não funciona
AbortController criado mas nunca conectado ao handler de `chat:abort`. Usuário não consegue cancelar streaming.

### B2 (BLOCKER): tool_call_start → tool:start
Passa o ChatChunk inteiro como `args` ao invés de metadados estruturados ({ toolCallId, toolName }).

### 14 Warnings (não bloqueantes)
- Sem JSDoc em exports (C-03)
- Sem validação de URL antes de fetch (S-05)  
- Tag [SW:Provider] vs padrão [SW] (C-06)
- Anthropic: message_delta ignorado, perde stop_reason/usage
- OpenAI: stopReason hardcoded, perde usage
- stream_options quebra providers não-OpenAI
- Anthropic SSE não trata evento error
- Stream sem terminal → UI trava
- fetchDefaultConfig sem tratamento de parse JSON
- tool:result emitido antes da execução real
- role developer quebra Anthropic
- OpenAI parser perde tool calls no [DONE] sem finish_reason