# Fluxo de Comunicação e Mensagens

## 1. Tipos de Mensagens Internas (chrome.runtime.onMessage)

### Abertura e Controle do Side Panel
| Tipo | Descrição |
|------|-----------|
| `open_side_panel` | Abre o side panel, opcionalmente com prompt inicial |
| `POPULATE_INPUT_TEXT` | Preenche o input do chat com texto/pergunta |
| `SWITCH_TO_MAIN_TAB` | Foca na aba principal do grupo |
| `STOP_AGENT` | Para o agente Claude em uma aba específica |
| `DISMISS_STATIC_INDICATOR_FOR_GROUP` | Remove indicadores visuais do grupo |

### Autenticação e Sessão
| Tipo | Descrição |
|------|-----------|
| `check_and_refresh_oauth` | Verifica e renova token OAuth |
| `logout` | Desconecta e limpa grupos de abas |
| `check_native_host_status` | Verifica status do native messaging host |

### MCP (Model Context Protocol)
| Tipo | Descrição |
|------|-----------|
| `SEND_MCP_NOTIFICATION` | Envia notificação MCP para o host nativo |
| `MCP_CONNECTED` | Estado de conexão MCP (true/false) |

### Tarefas Agendadas
| Tipo | Descrição |
|------|-----------|
| `OPEN_OPTIONS_WITH_TASK` | Abre opções com uma tarefa específica |
| `EXECUTE_SCHEDULED_TASK` | Executa tarefa agendada |

### Notificações e Áudio
| Tipo | Descrição |
|------|-----------|
| `PLAY_NOTIFICATION_SOUND` | Toca som de notificação |
| `OFFSCREEN_PLAY_SOUND` | Toca áudio via offscreen document |
| `SW_KEEPALIVE` | Mantém service worker ativo (20s) |
| `GENERATE_GIF` | Gera GIF animado do workflow |
| `REVOKE_BLOB_URL` | Libera blob URL de GIF |

### Tab Group Management
| Tipo | Descrição |
|------|-----------|
| `SECONDARY_TAB_CHECK_MAIN` | Aba secundária verifica se main está viva |
| `MAIN_TAB_ACK_REQUEST` | Solicita acknowledgement da main tab |
| `MAIN_TAB_ACK_RESPONSE` | Resposta de acknowledgement |
| `STATIC_INDICATOR_HEARTBEAT` | Heartbeat do indicador estático |

### Atualizações
| Tipo | Descrição |
|------|-----------|
| `UPDATE_AVAILABLE` | Notifica que atualização está disponível |

---

## 2. Mensagens Externas (de claude.ai)

```javascript
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (sender.origin === "https://claude.ai") {
    // "oauth_redirect" - Recebe token OAuth
    // "ping" - Verifica se extensão existe
    // "onboarding_task" - Tarefa inicial
  }
});
```

---

## 3. Protocolo Native Messaging

### Handshake
```
Extensão → Host: { type: "ping" }
Host → Extensão: { type: "pong" }
Extensão → Host: { type: "get_status" }
Host → Extensão: { type: "status_response", nativeHostInstalled: bool, mcpConnected: bool }
```

### Execução de Tools
```
Extensão → Host: {
  type: "tool_request",
  method: "execute_tool",
  params: {
    tool: "click",
    args: { ... },
    client_id: "abc123",
    session_scope: "..."
  }
}

Host → Extensão: {
  type: "tool_response",
  result: { content: [...] },
  is_error: false
}
```

### MCP via Native
```
Extensão → Host: {
  type: "notification",
  jsonrpc: "2.0",
  method: "notifications/tools/list_changed",
  params: {}
}
```

---

## 4. URLs Proprietárias (clau.de)

A extensão intercepta navegação para `clau.de/chrome/*` via `chrome.webNavigation.onBeforeNavigate`:

| URL | Ação |
|-----|------|
| `clau.de/chrome/permissions` | Abre página de permissões |
| `clau.de/chrome/reconnect` | Reconecta native host + bridge |
| `clau.de/chrome/tab/{id}` | Foca em uma aba específica |

---

## 5. Modificação de Headers HTTP

Usando `declarativeNetRequest`, a extensão modifica headers de requisições para `api.anthropic.com`:

```
User-Agent: claude-browser-extension/1.0.70 (external) <navegador>
anthropic-client-platform: claude_browser_extension
anthropic-client-version: 1.0.70
```

---

## 6. Fluxo de Screenshot

```
1. Service Worker recebe solicitação de screenshot
2. Se necessário, chrome.debugger.attach() na aba alvo
3. CDP: Page.captureScreenshot() ou Page.captureSnapshot()
4. Base64 da imagem retorna para o modelo Claude
5. Claude analisa e decide próximas ações
```

---

## 7. Fluxo de Leitura de Página

```
1. Claude solicita "read_page" 
2. Service worker injeta accessibility-tree.js se necessário
3. Chrome chama window.__generateAccessibilityTree()
4. Árvore de acessibilidade (roles, texto, estados) é retornada
5. Claude recebe como texto estruturado
6. Alternativa: Page.captureSnapshot() via CDP para snapshot MHTML
```

---

## 8. Ciclo de Vida do Offscreen Document

```
1. Extensão cria offscreen.html + offscreen.js
2. Mantém-se vivo com setInterval de 20s enviando SW_KEEPALIVE
3. Usado para:
   a) Tocar sons de notificação (Web Audio API)
   b) Gerar GIFs animados (GIF.js library)
4. Chrome não mata offscreen docs como service workers
```
