# Wayfinding pilot — pendências (26 out 2026)

Pilot aceito: F4 aprovado, auditoria C1–C5 PASS nas 3 slices, gates verdes (tsc + build + 69 testes).

Commits:
- `528862c` S1 foundation (tokens + fontes)
- `dbac6fa` S2 header/composer + marca
- `30b8f6c` S3 rota + checkpoint + paused/continue
- `2475dee` S4 voz mínima + i18n D2 + empty D3 + banners + retry + stopped + rename `ba`
- `adffac6` S5 options light (D4)

## P1 — Mic / voz (VOZ-S4)
Side-panel não tem mic/speech; só existe AudioContext keep-alive em `extension/src/content-scripts/agent-indicator.ts:450-474`. S4 entregou apenas botão mic desabilitado na UI + chaves i18n. Falta decidir: WebSpeech local vs provider para um futuro STT. Não implementar STT sem essa decisão.

## P2 — Fonte da verdade do step/total (ROTA)
`ToolExecution` (`ChatContext.tsx:8-16`) e `ToolMessageBubble` (`MessageBubble.tsx:133-204`) não têm step/total/paused; o loop do SW (`chat-handler.ts:48-102`) não propaga contador via `toolStart`/`toolEnd`/`continuePrompt`. Decidir se a numeração vem do SW ou é derivada na UI.

## P3 — Persistência de paused/continue/stopped
Hoje tudo é memória (`ChatContext.tsx:506-520`, `chat-stream.ts` ambos os lados, `Promise` em `service-worker/chat-stream.ts:136-148`). Reload perde o estado. Decidir: guardar pausa em `chrome.storage` ou manter memória + deixar explícito.

## P4 — Erros retriáveis vs fatais (ERRO retry)
`onError` propaga só string, sem código (`ChatContext.tsx:474-482`, `http-helpers.ts:211-236` tem `FRIENDLY_STATUS` mas `normalizeError` não marca flag retriável). Proposta: retriáveis 429/408/500/502/503/504/network; fatais 400/401/403/404. Falta confirmar e plugar no botão retry.

## P5 — Contrato de tokens inline no options
`ProviderList.tsx`, `RawJsonViewer.tsx` e `TaskManager.tsx` usam `var(--color-*)` inline com fallbacks dark hardcoded. A migração S5 trocou `:root` + fallbacks sem reestruturar. Confirmar o mapa token dark→light como contrato antes de mexer nesses componentes.

## P6 — Escopo fechado do rename
Fora de escopo, não renomear (56 hits): `claude-3-*` em `anthropic-adapter.ts` e testes, `__claudeElementMap` em `accessibility-tree.ts`, comentário em `options/style.css`, string de locale (coberta pelo glossário i18n, não por rename de id). Lista fechada de ids tocados em `agent-indicator.ts` + `PermissionPrompt`/`ChatInput`/`Header` (estes sem ids `claude-*`).
