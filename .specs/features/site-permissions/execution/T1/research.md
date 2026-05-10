---
phase: research
task: T1
feature: site-permissions
timestamp: 2026-05-09T00:27:50.431Z
attempt: 1
---

Research complete. Key findings: PermissionMode in ChatContext.tsx, handlePermission exists but unwired, no domain utility, perm_* i18n keys unused. Plan: create permissions.ts with PermissionManager class, extractDomain utility, storage keys ba-site-permissions + ba-domain-permissions.