# Feature: Visual Indicators — Complete

**Feature ID:** `visual-indicators-complete`
**Prioridade:** 5

---

## Descrição

Completar o `agent-indicator.ts` com as funcionalidades visuais que faltam para igualar o Claude in Chrome:
- Transição suave do cursor fantasma
- Círculo de clique com glow
- Labels de ação na página
- Drag paths
- Static indicator (bolinha laranja)
- Botão de parar na página

---

## User Stories

### P1: Phantom Cursor com Transição Suave ⭐ MVP

**Critérios de Aceitação:**

1. WHEN o cursor fantasma se move para uma nova posição THEN a transição SHALL ser animada (180ms cubic-bezier)
2. WHEN não há movimento por 2s THEN o cursor SHALL desaparecer gradualmente (fade out 500ms)
3. WHEN o cursor se move novamente THEN SHALL reaparecer com fade in

### P1: Círculo de Clique

**Critérios de Aceitação:**

1. WHEN o agente executa um clique (left_click, right_click, double_click) THEN SHALL mostrar um círculo laranja no local do clique
2. O círculo SHALL ter um glow (box-shadow laranja)
3. O círculo SHALL aparecer e desaparecer com animação (scale 0→1→0, 400ms total)

### P1: Label de Ação

**Critérios de Aceitação:**

1. WHEN o agente está a executar uma ação na página THEN SHALL mostrar uma label no topo da página com descrição da ação
2. Exemplos: "🔍 Searching for 'add to cart' button", "✏️ Typing 'hello' into search field", "🖱️ Clicking at (500, 300)"
3. A label SHALL ser semi-transparente e não interferir com cliques
4. A label SHALL desaparecer quando a ação termina

### P2: Drag Paths

**Critérios de Aceitação:**

1. WHEN o agente executa `left_click_drag` THEN SHALL mostrar uma seta vermelha do ponto inicial ao final
2. A seta SHALL desaparecer após 1s

### P2: Static Indicator

**Critérios de Aceitação:**

1. WHEN o agente está ativo (monitorando a página) THEN SHALL mostrar uma bolinha laranja no canto superior direito
2. A bolinha SHALL pulsar suavemente (animação CSS)
3. WHEN o mouse passa por cima THEN SHALL mostrar tooltip "BrowserAgent is active"

### P2: Botão de Parar na Página

**Critérios de Aceitação:**

1. WHEN o agente está a executar uma ação THEN SHALL mostrar um botão "Stop" flutuante na página
2. WHEN clicado THEN SHALL interromper a ação atual
3. O botão SHALL desaparecer quando a ação termina

---

## Dependências

| Dependência | Descrição |
|-------------|-----------|
| T9 (Visual Indicators) | ✅ `agent-indicator.ts` existe com cursor fantasma básico |

---

## Design

### Animações CSS (inline via style ou injected stylesheet)

```css
@keyframes ba-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes ba-click-pulse {
  0% { transform: scale(0); opacity: 0.8; }
  50% { transform: scale(1); opacity: 0.5; }
  100% { transform: scale(0); opacity: 0; }
}

@keyframes ba-pulse {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}

@keyframes ba-drag-arrow {
  0% { opacity: 0; transform: translateX(0); }
  50% { opacity: 1; }
  100% { opacity: 0; transform: translateX(10px); }
}
```

### Comunicação com Service Worker

O `agent-indicator.ts` recebe mensagens do service worker para saber qual ação está a ser executada:

```typescript
// Service worker → content script
chrome.tabs.sendMessage(tabId, {
  type: 'indicator:action',
  action: 'left_click',
  coordinate: [500, 300],
  text: 'Clicking search button',
});
```

```typescript
// Content script → mostra label
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'indicator:action') {
    showActionLabel(msg.text);
    if (msg.action === 'left_click') showClickRipple(msg.coordinate);
    if (msg.action === 'left_click_drag') showDragPath(msg.coordinate, msg.start_coordinate);
  }
});
```

---

## Ficheiros a Modificar

| Ficheiro | Ação |
|----------|------|
| `extension/src/content-scripts/agent-indicator.ts` | Modificar — adicionar click ripple, action label, drag paths, static indicator, stop button |
| `extension/src/service-worker/index.ts` | Modificar — enviar `indicator:action` quando tools executam |
| `extension/src/service-worker/tools.ts` | Modificar — notificar indicator sobre ações |

---

## Fora de Escopo (v1)

- Watermark em GIFs
- Progress bar de GIF generation
- Animação de drag com setas curvas (SVG path)
