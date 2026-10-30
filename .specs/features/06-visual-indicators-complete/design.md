# Design: Visual Indicators — Complete

**Feature ID:** `visual-indicators-complete`

---

## Arquitetura

```
┌──────────────────┐     ┌──────────────────────────────┐
│  Service Worker  │────▶│  Content Script              │
│  (tools.ts)      │     │  (agent-indicator.ts)        │
│                  │     │                              │
│  Após executar   │     │  • Phantom cursor            │
│  tool, envia     │     │  • Click ripple              │
│  mensagem com    │     │  • Action label              │
│  tipo de ação,   │     │  • Drag paths                │
│  coordenadas,    │     │  • Static indicator          │
│  texto           │     │  • Stop button               │
└──────────────────┘     └──────────────────────────────┘
         │                           │
         │                    chrome.runtime.sendMessage
         └────────────────────┘
```

---

## 1. Click Ripple

```typescript
function showClickRipple(x: number, y: number) {
  const ripple = document.createElement('div');
  ripple.id = 'ba-click-ripple';
  ripple.style.cssText = `
    position: fixed;
    left: ${x - 12}px;
    top: ${y - 12}px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(217, 119, 87, 0.4);
    box-shadow: 0 0 10px 2px rgba(217, 119, 87, 0.3);
    pointer-events: none;
    z-index: 2147483646;
    animation: ba-click-pulse 400ms ease-out forwards;
  `;
  document.body.appendChild(ripple);
  setTimeout(() => ripple.remove(), 500);
}
```

---

## 2. Action Label

```typescript
let actionLabel: HTMLDivElement | null = null;

function showActionLabel(text: string) {
  if (!actionLabel) {
    actionLabel = document.createElement('div');
    actionLabel.id = 'ba-action-label';
    document.body.appendChild(actionLabel);
  }
  actionLabel.textContent = text;
  actionLabel.style.cssText = `
    position: fixed;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    padding: 4px 12px;
    background: rgba(0, 0, 0, 0.75);
    color: white;
    border-radius: 8px;
    font-size: 12px;
    font-family: -apple-system, sans-serif;
    pointer-events: none;
    z-index: 2147483647;
    animation: ba-fade-in 150ms ease-out;
    backdrop-filter: blur(4px);
  `;
}

function hideActionLabel() {
  if (actionLabel) {
    actionLabel.remove();
    actionLabel = null;
  }
}
```

---

## 3. Drag Path

```typescript
function showDragPath(start: [number, number], end: [number, number]) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = `
    position: fixed; inset: 0; width: 100%; height: 100%;
    pointer-events: none; z-index: 2147483646;
  `;
  
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', String(start[0]));
  line.setAttribute('y1', String(start[1]));
  line.setAttribute('x2', String(end[0]));
  line.setAttribute('y2', String(end[1]));
  line.setAttribute('stroke', '#e74c3c');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-dasharray', '5,5');
  
  svg.appendChild(line);
  document.body.appendChild(svg);
  setTimeout(() => svg.remove(), 1000);
}
```

---

## 4. Static Indicator

```typescript
function showStaticIndicator() {
  if (document.getElementById('ba-static-indicator')) return;
  
  const indicator = document.createElement('div');
  indicator.id = 'ba-static-indicator';
  indicator.innerHTML = `
    <div style="
      width: 10px; height: 10px;
      border-radius: 50%;
      background: #D97757;
      animation: ba-pulse 2s ease-in-out infinite;
      box-shadow: 0 0 4px rgba(217, 119, 87, 0.5);
    "></div>
  `;
  indicator.style.cssText = `
    position: fixed;
    top: 8px;
    right: 8px;
    z-index: 2147483647;
    cursor: default;
  `;
  indicator.title = 'BrowserAgent is active';
  document.body.appendChild(indicator);
}
```

---

## 5. Comunicação com Service Worker

Em `tools.ts`, após executar cada ação:

```typescript
async function notifyIndicator(tabId: number, action: string, details?: Record<string, unknown>) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'indicator:action',
      action,
      ...details,
    });
  } catch {
    // content script not loaded
  }
}
```

Adicionar chamadas a `notifyIndicator()` nos vários `execute*` functions.

---

## Ficheiros

| Ficheiro | Ação |
|----------|------|
| `extension/src/content-scripts/agent-indicator.ts` | Adicionar todas as funções visuais |
| `extension/src/service-worker/tools.ts` | Adicionar `notifyIndicator()` nas funções de execução |
