---
phase: review
task: T5
feature: browser-extension
timestamp: 2026-05-07T18:10:11.154Z
attempt: 2
---

## T5 Review Retry — REJECTED (attempt 2/2)

All 5 previous fixes confirmed correct (B1✅ B2✅ B3✅ W1✅ W4✅). But new BLOCKER found:

**B-NEW:** Orphan chrome.tabs.onUpdated listener on navigate timeout. When 8s timeout fires, resolve() is called but listener is never removed → permanent event leak per timed-out navigation.

Fix: add `chrome.tabs.onUpdated.removeListener(listener)` before `resolve()` in the setTimeout callback.

Also 2 persistent warnings: debugger not detached on screenshot failure, active streams not aborted on disconnect.