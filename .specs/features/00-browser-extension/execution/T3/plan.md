---
phase: plan
task: T3
feature: browser-extension
timestamp: 2026-05-07T16:38:42.167Z
attempt: 1
---

## T3 Planner — needsResearch: true

Three unknowns need investigation:
1. **Streaming pattern** — how does chat:send handler stream multiple responses back to side panel given the single-Promise registerHandler pattern?
2. **ChatChunk type** — needs definition as bridge between provider SSE output and side panel message types
3. **Compat flags API mapping** — exact parameter names and values for reasoningEffort/thinkingFormat/developerRole on OpenAI and Anthropic APIs