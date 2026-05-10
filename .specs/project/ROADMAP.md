# ROADMAP — BrowserAgent

## Versão Atual

**v1.0 — Provider Custom** (implementação atual)
- 6 browser automation features implementadas ✅
- Provider layer com SSE parser customizado ✅
- Side Panel UI + Options Page ✅
- Pi Model Tracker (T1-T6) ✅

## Próximo Marco

### M6: Pi SDK Migration (P1-P4)
**Goal:** Substituir provider customizado pelo Pi SDK via Native Messaging Host.

| Feature | Tasks | Priority | Status |
|---------|-------|----------|--------|
| **P1: Native Messaging Host** | T1-T6 | 🔴 Alta | done |
| **P2: Streaming + Side Panel** | T7-T9 | 🔴 Alta | done |
| **P3: Session Persistence** | T10-T12 | 🟡 Média | done |
| **P4: Cleanup Legado** | T13-T16 | 🟢 Baixa | done |

---

## Task Dependencies (Pi SDK Migration)

```
Fase 1: Native Messaging Bridge (P1)
────────────────────────────────────
T1 (Scaffold Host)
 └── T2 (Protocol + Loop)
      └── T3 (PiSDKHost: Session + Registry + Auth)
           ├── T4 (Browser Tools como Custom Tools)
           │    └── T6 (Integração: Chat usa NativeBridge)
           │         ├── T7 (Side Panel: Port Streaming)
           │         │    ├── T8 (Visual Indicators)
           │         │    └── T9 (Provider Selector via Host)
           │         ├── T10 (Session Persistence)
           │         │    ├── T11 (Reconexão SW Restart)
           │         │    └── T12 (Compaction)
           │         └── T13 (Remover streamChat/SSE parser)
           │              ├── T14 (Simplificar types)
           │              ├── T15 (Remover registry)
           │              └── T16 (Remover SSE code)
           │
 T5 (NativeBridge SW)
           └── (merge em T6)
```

---

## Features Implementadas (v1.0)

| Feature | Status | Notas |
|---------|--------|-------|
| Chrome MV3 Extension | ✅ done | Vite + CRX, manifest.json |
| Service Worker | ✅ done | Message router, keep-alive alarm |
| Provider Layer (OpenAI compat) | ✅ done | SSE parser, buildRequestBody, tool loop |
| Browser Tools (6 features) | ✅ done | Navigate, click, type, screenshot, etc. |
| Side Panel UI | ✅ done | React chat, streaming, histórico |
| Options Page | ✅ done | Provider/model config, API keys |
| Permissions System | ✅ done | Domain permissions, allow/deny/once |
| Visual Indicators | ✅ done | Phantom cursor, action label, static dot |
| Tab Groups | ✅ done | Group management per session |
| Web Search + Fetch | ✅ done | Search provider + page fetch |
| File Tools | ✅ done | Read/create/edit files |
| Pi Model Tracker | ✅ done | Watch mode, sync detection, badges |
| Scheduled Tasks | ✅ done | Cron-like task scheduling |
| i18n (pt-BR, en-US) | ✅ done | Chrome i18n API |
| Offscreen Document | ✅ done | For extended APIs |

## Features Planejadas (Futuro)

| Feature | Prioridade | Depende de |
|---------|-----------|------------|
| Pi SDK Migration | 🔴 Alta | — |
| MCP Bridge | 🟢 Baixa | Pi SDK Migration |
| Per-session Model Override | 🟢 Baixa | Pi SDK Migration |
| Session Fork/Clone | 🟢 Baixa | Pi SDK Migration |

## Status Legend

| Status | Meaning |
|--------|---------|
| spec | Specified (spec.md + design.md + tasks.md created) |
| pending | Not started |
| in-progress | Currently working |
| done | Completed and merged |
| blocked | Waiting on dependency |
