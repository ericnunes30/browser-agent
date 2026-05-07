# Arquitetura Técnica do Claude em Chrome

## Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                    Service Worker (MV3)                          │
│  service-worker-loader.js → service-worker.ts-gaAAsstG.js      │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Permission   │  │ MCP          │  │ Tab Group Manager (t)  │ │
│  │ Manager (I)  │  │ Permissions  │  │                        │ │
│  └─────────────┘  └──────────────┘  └────────────────────────┘ │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Native Host  │  │ DNR Rules    │  │ Scheduled Task         │ │
│  │ Connector (R)│  │ (User-Agent) │  │ Manager (I)            │ │
│  └─────────────┘  └──────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │                 │                   │
    ┌────▼─────┐    ┌─────▼──────┐    ┌───────▼────────┐
    │ Sidepanel │    │  Options   │    │  Pairing Page   │
    │ (React)   │    │  Page      │    │  (Connect)      │
    └────┬──────┘    └─────┬──────┘    └───────┬────────┘
         │                 │                   │
    ┌────▼──────────────────────────────────────▼────────────┐
    │              Content Scripts                            │
    │  ┌──────────────────┐  ┌────────────────────────────┐  │
    │  │ accessibility-    │  │ agent-visual-indicator.js │  │
    │  │ tree.js           │  │ (cursor fantasma)         │  │
    │  └──────────────────┘  └────────────────────────────┘  │
    └────────────────────────────────────────────────────┬────┘
                                                         │
    ┌────────────────────────────────────────────────────▼────┐
    │              Offscreen Document                          │
    │  - Áudio (Web Audio API)                                 │
    │  - Geração de GIFs (GIF.js)                              │
    │  - Keepalive (20s interval)                              │
    └─────────────────────────────────────────────────────────┘
```

---

## Fluxo de Comunicação

### 1. Abertura do Side Panel
```
Usuário → Ctrl+E → chrome.commands.onCommand
         → chrome.action.onClicked
         → chrome.sidePanel.open()
         → Service Worker cria/gerencia Tab Group
         → Side panel carrega React app (sidepanel-p3pTyYhf.js)
```

### 2. Chat com Claude
```
Side Panel ←→ Service Worker (runtime.sendMessage)
Service Worker ←→ api.anthropic.com (HTTPS/WSS)
Service Worker ←→ Bridge WebSocket (claudeusercontent.com)
```

### 3. Ações do Claude no Browser
```
Claude decide agir → Service Worker
  → chrome.debugger.attach() (se necessário)
  → CDP: Page.captureScreenshot, DOM.getDocument, etc.
  → Content Scripts: árvore de acessibilidade, cursor
  → Resultado volta para o Claude
```

### 4. Conexão Desktop (Native Messaging)
```
Service Worker → chrome.runtime.connectNative("com.anthropic.claude_browser_extension")
  → Ping/Pong para verificar disponibilidade
  → Tool requests (execute_tool)
  → Status responses
  → MCP connected/disconnected
```

---

## Ciclo de Vida

### Eventos Listeners (Service Worker)

| Evento | Ação |
|--------|------|
| `chrome.runtime.onInstalled` | Configura DNR, inicializa grupos, verifica native host, scheduled tasks |
| `chrome.runtime.onStartup` | Mesmo que onInstalled |
| `chrome.runtime.onMessage` | Manipula ~20 tipos de mensagens |
| `chrome.runtime.onMessageExternal` | OAuth redirect, ping, onboarding_task de claude.ai |
| `chrome.runtime.onUpdateAvailable` | Notifica usuário sobre atualização |
| `chrome.action.onClicked` | Abre side panel |
| `chrome.commands.onCommand` | Atalho de teclado |
| `chrome.tabs.onRemoved` | Gerencia remoção de abas |
| `chrome.webNavigation.onBeforeNavigate` | Intercepta navegação (URLs clau.de/chrome/...) |
| `chrome.alarms.onAlarm` | Executa tarefas agendadas |
| `chrome.permissions.onAdded/onRemoved` | Gerencia nativeMessaging |
| `chrome.notifications.onClicked` | Foca na aba da notificação |

---

## Native Messaging Hosts

A extensão tenta conectar a dois hosts nativos:

1. **`com.anthropic.claude_browser_extension`** — App Desktop Claude
2. **`com.anthropic.claude_code_browser_extension`** — Claude Code

Protocolo:
- Envio: `{ type: "ping" }` → espera `{ type: "pong" }`
- Após conexão: `{ type: "get_status" }`
- Tool requests: `{ type: "tool_request", method: "execute_tool", params: {...} }`
- Respostas: `{ type: "tool_response", result: {...} }`
- MCP: `{ type: "notification", jsonrpc: "2.0", method: "...", params: {...} }`

---

## Scheduled Tasks (Tarefas Agendadas)

A extensão permite criar tarefas que o Claude executa automaticamente:

- Armazenadas em `chrome.storage.local` como `savedPrompts`
- Tipos de repetição: **once, daily, weekly, monthly, annually**
- Acionadas via `chrome.alarms`
- Fluxo: alarme → cria nova janela → abre side panel → envia prompt → executa
- Notificação ao finalizar (sucesso ou falha)

---

## Arquivos HTML da Extensão

| Arquivo | Função |
|---------|--------|
| `sidepanel.html` | Painel lateral do Claude (React SPA) |
| `options.html` | Página de opções/configurações |
| `pairing.html` | Página de conexão com apps desktop |
| `offscreen.html` | Documento oculto para áudio/GIF |
| `blocked.html` | Página de bloqueio (políticas organizacionais) |
| `gif_viewer.html` | Visualizador de GIFs |

---

## Debug/Test Features (identificadas no i18n)

A extensão possui ferramentas de desenvolvimento:
- "Debug Settings" (configurações de depuração)
- "Test conversations", "Test data", "Test notifications"
- "Load simple/long conversation", "Load tool use conversation"
- "Load near context limit"
- Exibição de trace IDs
- Toggle de permissões
