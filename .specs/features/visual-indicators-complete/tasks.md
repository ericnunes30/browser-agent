# Tasks: Visual Indicators — Complete

**Feature ID:** `visual-indicators-complete`

---

## Dependências

- T9 (Visual Indicators base) — ✅ `agent-indicator.ts` existe

---

## T1: Click Ripple + Phantom Cursor Animations

**Ficheiro:** `extension/src/content-scripts/agent-indicator.ts`

**O quê:** 
- Adicionar `showClickRipple(x, y)` — círculo laranja com glow que aparece/desaparece
- Adicionar transição CSS `transition: all 180ms cubic-bezier(...)` ao cursor fantasma
- Adicionar fade out após 2s de inatividade
- Adicionar injectStylesheet() com as keyframes necessárias

**Feito quando:** Cliques mostram ripple, cursor tem transição suave, fade out funciona.

---

## T2: Action Label

**Ficheiro:** `extension/src/content-scripts/agent-indicator.ts`

**O quê:**
- `showActionLabel(text)` — label semi-transparente no topo da página
- `hideActionLabel()` — remover label
- Chamadas automáticas quando ação começa/termina

**Feito quando:** Label aparece com descrição da ação, some quando ação termina.

---

## T3: Drag Paths + Static Indicator

**Ficheiro:** `extension/src/content-scripts/agent-indicator.ts`

**O quê:**
- `showDragPath(start, end)` — seta/linha tracejada do ponto inicial ao final
- `showStaticIndicator()` — bolinha laranja pulsante no canto superior direito
- `hideStaticIndicator()` — remover quando agente desativa

**Feito quando:** Drag paths visíveis durante drag, static indicator presente quando ativo.

---

## T4: Stop Button na Página

**Ficheiro:** `extension/src/content-scripts/agent-indicator.ts`

**O quê:**
- Mostrar botão "Stop" flutuante durante execução de ação
- Ao clicar, enviar mensagem `indicator:stop` ao service worker
- Service worker interrompe ação atual

**Feito quando:** Botão Stop aparece na página durante ação, clicar interrompe.

---

## T5: Service Worker — Notify Indicator

**Ficheiro:** `extension/src/service-worker/tools.ts`

**O quê:** Adicionar `notifyIndicator()` e chamar nos execute* functions após cada ação.

**Feito quando:** Ações do agente na página disparam mensagens para o content script.

---

## Ordem de Execução

```
T1 (click ripple + cursor) ──→ T2 (action label) ──→ T3 (drag + static)
                                                          │
                          T5 (SW notify) ─────────────────┤
                                                          │
                          T4 (stop button) ───────────────┘
```
