# Arquitetura MCP — Claude em Chrome como Servidor MCP

## O que é MCP neste contexto?

**MCP (Model Context Protocol)** é o protocolo da Anthropic que permite que modelos de IA (como Claude) se conectem a **ferramentas externas**. O Claude em Chrome atua como um **servidor MCP** que expõe as capacidades do navegador Chrome como ferramentas MCP para o Claude Desktop.

---

## Diagrama da Arquitetura MCP

```
┌──────────────────────────────────────────────────────────────────┐
│                       Claude Desktop App                          │
│  (cliente MCP — consome ferramentas do navegador)                │
└──────────────┬───────────────────────────────────────────────────┘
               │
               │  Native Messaging Protocol
               │  (com.anthropic.claude_browser_extension)
               │
┌──────────────▼───────────────────────────────────────────────────┐
│              Chrome Extension (Servidor MCP)                      │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              Service Worker                               │    │
│  │                                                           │    │
│  │  ┌───────────────────┐       ┌────────────────────────┐  │    │
│  │  │ Native Host       │◄──────► MCP Tab Group Manager  │  │    │
│  │  │ Connector (R)     │       │ (q.MCP_TAB_GROUP_KEY)  │  │    │
│  │  └────────┬──────────┘       └────────────────────────┘  │    │
│  │           │                                               │    │
│  │  ┌────────▼──────────┐       ┌────────────────────────┐  │    │
│  │  │ Permission Manager│◄──────► Tool Executor          │  │    │
│  │  │ (Fy - remote_mcp) │       │ (click, type, etc)     │  │    │
│  │  └───────────────────┘       └────────────────────────┘  │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
               │
               │  chrome.debugger / chrome.scripting / chrome.tabs
               │
               ▼
        Páginas do Chrome
```

---

## Fluxo de Conexão MCP

### 1. Handshake Native Messaging

```javascript
// Service Worker tenta conectar a dois hosts:
const hosts = [
  { name: "com.anthropic.claude_browser_extension", label: "Desktop" },
  { name: "com.anthropic.claude_code_browser_extension", label: "Claude Code" }
];

// Para cada host:
// 1. chrome.runtime.connectNative(host.name)
// 2. Envia { type: "ping" }
// 3. Aguarda { type: "pong" } (timeout 10s)
// 4. Se sucesso, envia { type: "get_status" }
// 5. Recebe { type: "status_response", nativeHostInstalled, mcpConnected }
```

### 2. Estados da Conexão

| Estado | Variável | Descrição |
|--------|----------|-----------|
| Desconectado | `A = null` | Nenhum host nativo conectado |
| Conectando | `P = true` | Tentando estabelecer conexão |
| Conectado | `A != null` | Native messaging host ativo |
| MCP Ativo | `S = true` | Protocolo MCP estabelecido via native host |
| Bridge | WebSocket | Alternativa: `wss://bridge.claudeusercontent.com` |

### 3. Variáveis de Estado (Service Worker)

```javascript
let A = null;       // Native messaging port
let N = null;       // Nome do host conectado
let P = false;      // Lock de conexão
let k = false;      // Native host instalado
let S = false;      // MCP conectado
let M = null;       // Status callback
let C = null;       // Status timeout
```

---

## Protocolo de Mensagens MCP

### Mensagens Recebidas (Host → Extensão)

| Tipo | Descrição |
|------|-----------|
| `tool_request` | Solicitação de execução de ferramenta |
| `status_response` | Resposta ao `get_status` |
| `mcp_connected` | MCP estabelecido com sucesso |
| `mcp_disconnected` | MCP desconectado |

### Mensagens Enviadas (Extensão → Host)

| Tipo | Descrição |
|------|-----------|
| `ping` | Verifica conexão |
| `pong` | Resposta ao ping |
| `get_status` | Solicita status |
| `tool_response` | Resultado da execução da ferramenta |
| `notification` | Notificação MCP (JSON-RPC 2.0) |

### Tool Request Flow

```javascript
// Host → Extensão
{
  type: "tool_request",
  method: "execute_tool",
  params: {
    tool: "click",           // Nome da ferramenta
    args: { x: 100, y: 200 }, // Argumentos
    client_id: "abc123",     // ID do cliente (tab)
    session_scope: "..."     // Escopo da sessão
  }
}

// Extensão executa a ferramenta e responde:
// Em caso de erro (permissão negada):
{
  type: "tool_response",
  error: {
    content: "Permission denied by user - IMPORTANT: ..."
  }
}

// Em caso de sucesso:
{
  type: "tool_response",
  result: {
    content: [...]  // Resultados (texto, screenshots, etc.)
  }
}
```

---

## Constantes MCP no PermissionManager

```javascript
// Chaves de armazenamento
t.MCP_TAB_GROUP_ID = "mcpTabGroupId";     // ID do grupo de abas MCP
t.MCP_CONNECTED = "mcpConnected";          // Flag de conexão MCP

// Tipo de permissão
t.REMOTE_MCP = "remote_mcp";              // Permissão para MCP remoto

// Display name para UI de permissões
[My.REMOTE_MCP]: "access"  // Mostra "Claude wants to access..." 
```

---

## MCP Tab Group

Quando o Claude Desktop se conecta via MCP, a extensão cria um **Tab Group dedicado**:

```javascript
// storage key
MCP_TAB_GROUP_KEY = "mcpTabGroupId"

// O grupo de abas MCP é gerenciado separadamente dos grupos
// de abas do side panel. Permite que o Claude Desktop:
// 1. Abra abas no Chrome
// 2. Navegue entre elas
// 3. Execute ferramentas em cada aba
// 4. Monitore mudanças de URL, status, título
```

---

## Bridge WebSocket (Alternativa ao Native Messaging)

Além do native messaging, a extensão suporta conexão via **WebSocket Bridge**:

```
wss://bridge.claudeusercontent.com    (produção)
wss://bridge-staging.claudeusercontent.com  (staging)
```

Esta bridge permite que o Claude Desktop se conecte à extensão mesmo sem native messaging (útil para ambientes restritos).

Configurada na CSP:
```json
"connect-src": [
  "wss://bridge.claudeusercontent.com",
  "wss://bridge-staging.claudeusercontent.com"
]
```

---

## Ferramentas MCP Expostas

As mesmas ferramentas disponíveis no side panel são expostas como MCP tools:

| Ferramenta | Descrição |
|------------|-----------|
| `browse` | Navegar para URL |
| `click` | Clicar em elemento/coordenada |
| `type` | Digitar texto |
| `scroll` | Rolar página |
| `screenshot` | Capturar tela |
| `read_page` | Extrair texto da página |
| `execute_javascript` | Executar JS na página |
| `read_console` | Ler console messages |
| `read_network` | Ler requisições de rede |
| `find_element` | Encontrar elemento no DOM |
| `set_form_value` | Definir valor de campo |
| `hover` | Passar mouse |
| `wait` | Aguardar |
| `press_key` | Pressionar tecla |
| `hold_key` | Segurar tecla |
| `web_search` | Pesquisar web |
| `web_fetch` | Fetch de URL |
| `read_file` | Ler arquivo |
| `create_file` | Criar arquivo |
| `edit_file` | Editar arquivo |
| `download` | Baixar arquivo |

---

## Sistema de Permissões para MCP

Quando o Claude Desktop tenta executar uma ferramenta, o sistema de permissões é consultado:

```javascript
// O PermissionManager (Fy) gerencia:
// - Permissões por site (allow/deny/once)
// - Permissões por ação (click, type, read, etc.)
// - Modo "ask before acting" vs "act without asking"

// Para MCP remoto (remote_mcp), exibe:
"Claude wants to access: [tool] on [site]"
```

**Tipos de permissão no sistema:**
| Tipo | Descrição |
|------|-----------|
| `My.BROWSE` | `browse` — navegar |
| `My.CLICK` | `click` — clicar |
| `My.TYPE` | `type` — digitar |
| `My.SCREENSHOT` | `screenshot` — capturar tela |
| `My.READ_PAGE` | `read_page` — ler página |
| `My.EXECUTE_JAVASCRIPT` | `execute_javascript` — executar JS |
| `My.PLAN_APPROVAL` | `plan_approval` — aprovar plano |
| `My.REMOTE_MCP` | `remote_mcp` — acesso MCP remoto |

---

## Integração com "Cowork" (Além do Browser)

A feature **Cowork** (identificada nas imagens `cowork_chrome_dark.png`, `cowork_chrome_light.png` e `horizon-spark-connect.png`) expande o MCP para além do navegador:

```
"Claude can now work in your folders, not just your browser tabs."
"Turn research into reports, pull together files, or prep your next deck."
```

Isso sugere que o MCP também expõe **ferramentas de sistema de arquivos** (read_file, create_file, edit_file) quando conectado via desktop app.

---

## Resumo: Como a Extensão Vira um Servidor MCP

1. **A extensão Chrome** é instalada no navegador do usuário
2. **O Claude Desktop** (app nativo) se conecta à extensão via `chrome.runtime.connectNative()`
3. A conexão usa o protocolo **Native Messaging** do Chrome
4. Uma vez conectado, o protocolo **MCP (JSON-RPC 2.0)** é estabelecido
5. O Claude Desktop envia `tool_request` → a extensão executa no Chrome → retorna `tool_response`
6. A extensão gerencia **permissões**, **grupos de abas dedicados** e **monitoramento de abas**
7. Opcionalmente, uma **WebSocket Bridge** pode ser usada como alternativa ao native messaging

```
Claude Desktop  ───Native Messaging──►  Chrome Extension  ───chrome API──►  Browser
 (MCP Client)     JSON-RPC 2.0         (MCP Server)        tools            (Pages)
```
