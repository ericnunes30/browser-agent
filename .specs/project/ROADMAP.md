# ROADMAP — BrowserAgent

## Milestones

### M1: Foundation (T1-T3)
**Goal:** Extensão carregável, service worker funcional, provider LLM conectável.

| Feature | Tasks | Status |
|---------|-------|--------|
| Extensão Chrome MV3 | T1 | pending |
| Service Worker + Mensagens | T2 | pending |
| Provider Layer (OpenAI + Anthropic) | T3 | pending |

### M2: Browser Tools (T4-T5)
**Goal:** Extensão capaz de interagir com páginas web.

| Feature | Tasks | Status |
|---------|-------|--------|
| Content Scripts (acessibilidade, cursor) | T4 | pending |
| Tool Executor (6 ferramentas P0) | T5 | pending |

### M3: User Interface (T6-T7)
**Goal:** Side panel com chat funcional e página de configuração.

| Feature | Tasks | Status |
|---------|-------|--------|
| Side Panel UI (React chat) | T6 | pending |
| Options Page (config modelos) | T7 | pending |

### M4: Security & Polish (T8-T9)
**Goal:** Sistema de permissões completo e feedback visual.

| Feature | Tasks | Status |
|---------|-------|--------|
| Permissions System | T8 | pending |
| Indicadores Visuais | T9 | pending |

### M5: Extras & Future (T10-T14)
**Goal:** Funcionalidades complementares e preparação para MCP.

| Feature | Tasks | Status |
|---------|-------|--------|
| Offscreen Document | T10 | pending |
| Scheduled Tasks | T11 | pending |
| MCP Bridge (placeholder) | T12 | pending |
| i18n (pt-BR, en-US) | T13 | pending |
| sync-models.js | T14 | pending |

---

## Task Dependencies

```
T1 (Scaffold)
 ├── T2 (Service Worker)
 │    ├── T3 (Provider Layer)
 │    │    ├── T6 (Side Panel UI)
 │    │    ├── T7 (Options Page)
 │    │    │    └── T14 (sync-models.js)
 │    │    ├── T11 (Scheduled Tasks)
 │    │    └── T13 (i18n)
 │    ├── T5 (Tool Executor)
 │    │    └── T8 (Permissions System)
 │    └── T12 (MCP Bridge)
 ├── T4 (Content Scripts)
 │    └── T9 (Indicadores Visuais)
 └── T10 (Offscreen Document)
```

---

## Status Legend

| Status | Meaning |
|--------|---------|
| pending | Not started |
| in-progress | Currently working |
| done | Completed and merged |
| blocked | Waiting on dependency |
