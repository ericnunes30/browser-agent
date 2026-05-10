# Feature: Popup Window Mode

**Feature ID:** `popup-window`
**Prioridade:** 6

---

## Descrição

Adicionar um modo **popup window** (janela flutuante 500×768) além do side panel, permitindo ao utilizador alternar entre os dois modos. O popup reutiliza os mesmos componentes React do side panel.

---

## User Stories

### P1: Popup Action Button ⭐ MVP

**Como** utilizador,
**Quero** abrir o BrowserAgent como popup flutuante
**Para** usar o agente sem ocupar o side panel do Chrome.

**Critérios de Aceitação:**

1. WHEN o utilizador clica no ícone da extensão na toolbar THEN SHALL abrir uma janela popup (500×768)
2. WHEN o popup abre THEN SHALL mostrar o mesmo chat que o side panel
3. WHEN o utilizador fecha o popup THEN a sessão SHALL persistir (não perder mensagens)

### P2: Alternar entre Side Panel e Popup

**Critérios de Aceitação:**

1. WHEN o utilizador está no side panel e clica "Open as popup" THEN SHALL abrir popup e fechar side panel
2. WHEN o utilizador está no popup THEN SHALL poder clicar "Open in side panel" para alternar
3. WHEN alterna entre modos THEN o histórico de chat SHALL ser preservado

### P2: Full Screen (opcional)

**Critérios de Aceitação:**

1. WHEN o utilizador clica "Full screen" no header THEN SHALL abrir popup em ecrã inteiro
2. WHEN em full screen THEN o header SHALL ter botão para voltar ao tamanho normal

---

## Design

O popup reutiliza os mesmos componentes React do side panel (`App.tsx`, `ChatContext.tsx`, etc.). A diferença é o ponto de entrada:

```
extension/
├── sidepanel.html    ← existente, carrega side-panel/index.tsx
├── popup.html        ← novo, carrega o mesmo side-panel/index.tsx
└── src/side-panel/
    └── index.tsx     ← existente, ponto de entrada React
```

### manifest.json

```json
{
  "action": {
    "default_popup": "popup.html",
    "default_title": "BrowserAgent"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  }
}
```

### popup.html

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    html, body { width: 500px; height: 768px; margin: 0; padding: 0; overflow: hidden; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./src/side-panel/index.tsx"></script>
</body>
</html>
```

---

## Ficheiros a Criar/Modificar

| Ficheiro | Ação |
|----------|------|
| `extension/popup.html` | **Criar** — HTML base para popup |
| `extension/manifest.json` | Modificar — adicionar `action.default_popup` |
| `extension/src/side-panel/App.tsx` | Modificar — detetar modo (popup vs sidepanel) |
| `extension/src/side-panel/components/Header.tsx` | Modificar — botão "Open as popup" / "Open in side panel" |
| `extension/_locales/*/messages.json` | Novas chaves i18n |

---

## Dependências

| Dependência | Descrição |
|-------------|-----------|
| T6 (Side Panel UI) | ✅ Reutiliza componentes |
| T2 (Service Worker) | ✅ Comunicação existente |

## Fora de Escopo (v1)

- Popup redimensionável
- Múltiplas janelas popup simultâneas
- Popup com dimensões configuráveis
