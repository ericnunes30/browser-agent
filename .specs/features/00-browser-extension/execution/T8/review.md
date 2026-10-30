---
phase: review
task: T8
feature: browser-extension
timestamp: 2026-05-08T10:07:01.216Z
attempt: 1
---

## T8 Review — REJECTED (1 BLOCKER)

**BLOCKER:** ChatContext.tsx line 81 reads `msg.tool` from `tool:result` but messages.ts type doesn't include `tool` in tool:result. `(msg as any).tool` always undefined → ID suffix is just `"tabId-"` → never matches → tool status stuck in pending forever.

**WARNING:** allow_once not persisted — every subsequent tool call re-prompts.