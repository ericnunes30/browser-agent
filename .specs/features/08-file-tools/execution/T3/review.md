---
phase: review
task: T3
feature: file-tools
timestamp: 2026-05-09T11:08:40.596Z
attempt: 1
---

REJECTED — 2 blockers: File System Access API requires user gesture (not available in message handler); invalid MIME wildcard 'text/*'. Need redesign: use <input type="file"> for read, chrome.downloads.download() + blob URLs for create/edit.