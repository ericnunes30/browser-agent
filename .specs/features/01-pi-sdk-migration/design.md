# Pi SDK Migration — Design

> **Feature:** Pi SDK Migration  
> **Status:** Design  
> **Date:** 2026-05-09  
> **Baseados em:** `gateway-pi/.docs/CONSOLIDACAO.md`, `kanban-agents-pi/.docs/arquitetura-v1.md`, Pi SDK docs

---

## 1. Visão Geral da Arquitetura

```
┌──────────────────────────────────────────────────────────────────┐
│                     BROWSERAGENT (Chrome Extension)               │
│                                                                  │
│  ┌──────────────────────────┐   ┌─────────────────────────────┐  │
│  │    Side Panel (React)    │   │    Content Scripts           │  │
│  │  - Chat UI              │   │  - agent-indicator.ts        │  │
│  │  - Provider selector    │   │  - accessibility-tree.ts     │  │
│  │  - Message history      │   │  - file-bridge.ts            │  │
│  └───────────┬──────────────┘   └──────────┬──────────────────┘  │
│              │ chrome.runtime.sendMessage() │                    │
│              │                              │ chrome.tabs.*     │
│  ┌───────────▼──────────────────────────────▼──────────────────┐  │
│  │              Service Worker (Background)                     │  │
│  │                                                              │  │
│  │  ┌──────────────────────────────────────────────────────┐    │  │
│  │  │  Message Router (onMessage)                          │    │  │
│  │  │  → chat:send ───→ nativeBridge.prompt()              │    │  │
│  │  │  → tool:execute → executeTool() (browser tools)      │    │  │
│  │  │  → models:* → nativeBridge.* ou fallback registry    │    │  │
│  │  │  → indicator:* → forwardToActiveTab()               │    │  │
│  │  └──────────────────────────────────────────────────────┘    │  │
│  │                                                              │  │
│  │  ┌──────────────────────────────────────────────────────┐    │  │
│  │  │  NativeBridge                                        │    │  │
│  │  │  - connectNative('com.pi.browseragent')              │    │  │
│  │  │  - Envia prompts, recebe eventos como JSON           │    │  │
│  │  │  - Gerencia ciclo de vida: connect → disconnect      │    │  │
│  │  │  - Reconexão automática se SW reiniciar              │    │  │
│  │  └──────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
└─────────────────────────────┼─────────────────────────────────────┘
                              │ stdin/stdout JSONL
                              │ chrome.runtime.connectNative()
┌─────────────────────────────▼─────────────────────────────────────┐
│              NATIVE MESSAGING HOST (Node.js)                       │
│                                                                   │
│  Executável: browser-agent-host.js                                │
│  Manifest: com.pi.browseragent.json → chrome-native-messaging     │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  PiSDKHost                                                 │   │
│  │                                                             │   │
│  │  stdin: JSONL messages (prompt, abort, setModel, etc.)      │   │
│  │  stdout: JSONL events (delta, tool_execution_*, done, err)  │   │
│  │                                                             │   │
│  │  ┌────────────────────────────────────────────────────┐    │   │
│  │  │  SessionManager                                    │    │   │
│  │  │  - Mantém 1 AgentSession ativa                     │    │   │
│  │  │  - Cria/resume sessão                              │    │   │
│  │  │  - Gerencia ciclo de vida                          │    │   │
│  │  └────────────────────────────────────────────────────┘    │   │
│  │                                                             │   │
│  │  ┌────────────────────────────────────────────────────┐    │   │
│  │  │  ModelRegistry + AuthStorage                       │    │   │
│  │  │  - Lê ~/.pi/agent/models.json                      │    │   │
│  │  │  - Lê ~/.pi/agent/auth.json                        │    │   │
│  │  │  - Providers: Anthropic, OpenAI, DeepSeek, etc.    │    │   │
│  │  └────────────────────────────────────────────────────┘    │   │
│  │                                                             │   │
│  │  ┌────────────────────────────────────────────────────┐    │   │
│  │  │  BrowserTools (custom tools)                       │    │   │
│  │  │  - navigate, click, type, screenshot, etc.        │    │   │
│  │  │  - defineTool() → execute() envia msg ao SW       │    │   │
│  │  │  - SW executa no Chrome e retorna resultado        │    │   │
│  │  └────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. Protocolo de Comunicação (JSONL via Native Messaging)

### Mensagens SW → Host (stdin)

```typescript
// Prompt
{ type: "prompt", message: "navegue até github.com", images?: string[] }

// Set model/provider
{ type: "setModel", provider: "opencode-go", model: "deepseek-v4-pro" }

// Set thinking level
{ type: "setThinking", level: "off" | "low" | "medium" | "high" }

// Abort current execution
{ type: "abort" }

// List available providers/models
{ type: "listModels" }

// Create new session (clear conversation)
{ type: "newSession" }

// Set system prompt override
{ type: "setSystemPrompt", prompt: string }

// Execute browser tool (called BY the Pi SDK tool execute function)
{ type: "executeTool", toolCallId: string, name: string, args: object }

// Result of tool execution (sent back to Pi SDK)
{ type: "toolResult", toolCallId: string, content: string, error?: string, images?: string[] }
```

### Mensagens Host → SW (stdout)

```typescript
// Text delta (streaming)
{ type: "delta", text: string }

// Reasoning delta (thinking)
{ type: "reasoning", text: string }

// Tool execution started
{ type: "toolStart", name: string, input: object }

// Tool requires browser execution → SW must execute and return result
{ type: "toolExec", toolCallId: string, name: string, args: object }

// Tool execution result received
{ type: "toolEnd", name: string, result: string, error?: boolean }

// Agent turn complete (response + all tools done)
{ type: "turnEnd", text: string, reasoning?: string }

// Full agent response complete
{ type: "done" }

// Error
{ type: "error", message: string }

// Model list response
{ type: "modelList", providers: ProviderInfo[] }

// Session info
{ type: "sessionInfo", sessionId: string, messageCount: number }
```

---

## 3. Fluxo de uma Mensagem

### 3.1 Usuário envia mensagem

```
Side Panel                    SW                      Native Host          Pi SDK
    │                          │                          │                  │
    │──chat:send──────────────►│                          │                  │
    │                          │──{"type":"prompt",       │                  │
    │                          │   "message":"..."}──────►│                  │
    │                          │                          │──prompt()───────►│
    │                          │                          │                  │──► provider
    │                          │                          │◄── event stream │
    │                          │◄──{"type":"delta",       │                  │
    │                          │    "text":"..."}─────────│                  │
    │◄──chat:delta─────────────│                          │                  │
    │                          │                          │                  │
    │                          │◄──{"type":"toolStart",   │                  │
    │                          │    "name":"navigate"}────│                  │
    │                          │                          │                  │
    │                          │──{"type":"toolExec",     │                  │
    │                          │   "name":"navigate",     │                  │
    │                          │   "args":{url:"..."}}    │                  │
    │                          │   (SW executa no Chrome) │                  │
    │                          │                          │                  │
    │                          │──{"type":"toolResult",   │                  │
    │                          │   "content":"ok"}────────►│                 │
    │                          │                          │── tool result──►│
    │                          │                          │                  │
    │                          │◄──{"type":"delta",       │                  │
    │                          │    "text":"pronto!"}─────│                  │
    │                          │                          │                  │
    │                          │◄──{"type":"done"}────────│                  │
    │◄──chat:result────────────│                          │                  │
```

### 3.2 Caso especial: Browser Tool via Pi SDK

Quando o Pi SDK decide chamar uma tool de browser (click, type, screenshot), o fluxo é:

```
Pi SDK
  │
  │ session.on("tool_execution_start", { name: "click", input: {coordinate:[100,200]} })
  │
  ├──→ Host emite {"type":"toolExec", toolCallId:"call_1", name:"click", args:{...}}
  │       │
  │       SW recebe → executeTool("click", args, tabId) → chrome.tabs.sendMessage()
  │       │
  │       Content Script executa click no DOM
  │       │
  │       SW → Host: {"type":"toolResult", toolCallId:"call_1", content:"ok", screenshots:["..."]}
  │
  ├──→ Pi SDK recebe resultado → continua para próxima tool ou retorna texto
  │
  └──→ session.on("tool_execution_end", { ... })
```

---

## 4. Componentes

### 4.1 NativeBridge (Service Worker)

```typescript
// extension/src/service-worker/native-bridge.ts

class NativeBridge {
  private port: chrome.runtime.Port | null = null;
  private onDelta: (text: string) => void;
  private onReasoning: (text: string) => void;
  private onToolExec: (toolCallId: string, name: string, args: object) => Promise<any>;
  private onTurnEnd: (text: string, reasoning?: string) => void;
  private onDone: () => void;
  private onError: (err: string) => void;
  private pendingToolExecs: Map<string, { resolve, reject }>;

  connect(): void;  // chrome.runtime.connectNative('com.pi.browseragent')
  disconnect(): void;

  prompt(message: string, images?: string[]): void;
  setModel(provider: string, model: string): void;
  abort(): void;
  newSession(): void;
  setSystemPrompt(prompt: string): void;

  private handleMessage(msg: HostMessage): void;
  private sendToHost(msg: BridgeMessage): void;
}
```

### 4.2 PiSDKHost (Node.js)

```typescript
// native-host/src/pisdk-host.ts

class PiSDKHost {
  private session: AgentSession | null = null;
  private authStorage: AuthStorage;
  private modelRegistry: ModelRegistry;
  private sessionManager: SessionManager;
  private browserTools: ToolDefinition[];
  private pendingToolCalls: Map<string, { resolve, reject }>;

  constructor() {
    this.authStorage = AuthStorage.create();
    this.modelRegistry = ModelRegistry.create(this.authStorage);
    this.sessionManager = SessionManager.inMemory();
    this.browserTools = this.defineBrowserTools();
  }

  async handlePrompt(message: string, images?: string[]): Promise<void> {
    if (!this.session) {
      await this.createSession();
    }
    // Subscribe to events
    this.session.subscribe((event) => {
      if (event.type === 'message_update') {
        if (event.assistantMessageEvent.type === 'text_delta') {
          this.sendToSW({ type: 'delta', text: event.assistantMessageEvent.delta });
        }
        if (event.assistantMessageEvent.type === 'thinking_delta') {
          this.sendToSW({ type: 'reasoning', text: event.assistantMessageEvent.delta });
        }
      }
      if (event.type === 'tool_execution_start') {
        this.sendToSW({ type: 'toolStart', name: event.toolName, input: event.toolInput });
      }
      if (event.type === 'tool_execution_end') {
        this.sendToSW({ type: 'toolEnd', name: event.toolName, result: event.result });
      }
    });

    await this.session.prompt(message, { images });
  }

  private async createSession() {
    const { session } = await createAgentSession({
      sessionManager: this.sessionManager,
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      tools: [],
      customTools: this.browserTools,
    });
    this.session = session;
  }

  private defineBrowserTools() {
    return [
      defineTool({
        name: 'navigate',
        description: 'Navigate to a URL or go back/forward',
        parameters: Type.Object({
          url: Type.Optional(Type.String()),
          direction: Type.Optional(Type.Enum(['forward', 'back'])),
        }),
        execute: async (toolCallId, params) => {
          return this.executeBrowserTool(toolCallId, 'navigate', params);
        },
      }),
      // ... all other browser tools
    ];
  }

  private async executeBrowserTool(toolCallId: string, name: string, args: object) {
    this.sendToSW({ type: 'toolExec', toolCallId, name, args });
    return new Promise((resolve, reject) => {
      this.pendingToolCalls.set(toolCallId, { resolve, reject });
      setTimeout(() => {
        if (this.pendingToolCalls.has(toolCallId)) {
          this.pendingToolCalls.delete(toolCallId);
          reject(new Error(`Tool ${name} timed out`));
        }
      }, 30000);
    });
  }
}
```

### 4.3 Chat Handler Refatorado (Service Worker)

```typescript
// extension/src/service-worker/index.ts (refatorado)

const nativeBridge = new NativeBridge({
  onDelta: (text) => {
    streamBuffer += text;
    notifySidePanel({ type: 'chat:delta', text });
  },
  onReasoning: (text) => {
    notifySidePanel({ type: 'chat:reasoning', text });
  },
  onToolExec: async (toolCallId, name, args) => {
    const tabId = await getActiveTabId();
    const result = await executeTool(name, args, tabId);
    nativeBridge.sendToolResult(toolCallId, result);
  },
  onDone: () => {
    notifySidePanel({ type: 'chat:result', content: streamBuffer });
  },
  onError: (err) => {
    notifySidePanel({ type: 'chat:error', error: err });
  },
});

async function handleChatSend(msg, sender) {
  nativeBridge.connect();
  nativeBridge.setModel(msg.provider, msg.model);
  nativeBridge.prompt(msg.messages[msg.messages.length - 1].content);
  return { stream: true };
}
```

---

## 5. Gerenciamento de Sessão

### 5.1 Ciclo de Vida

```
SW Inicia → connectNative('com.pi.browseragent')
              │
              ▼
Host inicia → AuthStorage.load() + ModelRegistry.load()
              │
              ▼
SW envia prompt → Host cria AgentSession (se não existir)
              │
              ▼
Host: session.prompt() → eventos → SW
              │
              ▼
SW morre (MV3 timeout) → Host mantém sessão
              │
              ▼
SW reinicia → connectNative() → Host já tem sessão ativa
              │
              ▼
Host retoma sessão → SW continua onde parou
```

### 5.2 Sessão Persistente (P2)

```typescript
// Native Host
const sessionManager = SessionManager.create(process.cwd());
// SessionManager.continueRecent() para retomar última sessão
```

---

## 6. Model Registry

O `ModelRegistry` do Pi SDK lê `~/.pi/agent/models.json` automaticamente:

```typescript
const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

// List all available models with valid API keys
const available = await modelRegistry.getAvailable();
```

Isso **substitui** o `models.custom.json` + `models.default.json` + `loadProviders()`.

**Decisão:** O host é a fonte da verdade para modelos. SW consulta via `{ type: "listModels" }` e cacheia em `chrome.storage.local`.

---

## 7. Instalação do Native Messaging Host

### 7.1 Estrutura de Arquivos

```
native-host/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point: stdin/stdout JSONL loop
│   ├── pisdk-host.ts         # PiSDKHost class
│   ├── browser-tools.ts      # defineTool() definitions
│   ├── protocol.ts           # Tipos do protocolo
│   └── install.ts            # Instala manifest do native messaging
├── dist/                     # Compiled JS
└── manifests/
    └── com.pi.browseragent.json
```

### 7.2 Native Messaging Manifest

```json
{
  "name": "com.pi.browseragent",
  "description": "Pi SDK Bridge for BrowserAgent",
  "path": "HOST_PATH/browser-agent-host",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://EXTENSION_ID/"]
}
```

### 7.3 Script de Instalação

```typescript
// native-host/src/install.ts
async function install() {
  const hostPath = path.join(__dirname, '..', 'dist', 'browser-agent-host.js');
  const manifest = {
    name: 'com.pi.browseragent',
    description: 'Pi SDK Bridge for BrowserAgent',
    path: process.platform === 'win32'
      ? path.join(__dirname, '..', 'dist', 'browser-agent-host.exe')
      : hostPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${EXTENSION_ID}`],
  };
  await fs.writeJson(getManifestPath(), manifest);
}
```

---

## 8. Tratamento de Erros

| Erro | Resposta |
|------|----------|
| Host não encontrado | `chrome.runtime.lastError` → fallback para API direta |
| Host crashou | Reconexão com backoff (1s, 2s, 4s, max 30s) |
| Tool timeout (30s) | Host rejeita promise → Pi SDK vê erro |
| SW morreu (MV3) | Host mantém sessão ativa |
| Provider API error | Pi SDK lida internamente |
| AuthStorage sem key | Host → SW: "Configure API key" |

---

## 9. Estados da UI Durante Streaming

| Estado | Eventos do Host | Ação no Side Panel |
|--------|-----------------|-------------------|
| `textPhase` | `delta`, `reasoning` | Acumula texto, mostra streaming |
| `toolPhase` | `toolStart`, `toolExec`, `toolEnd` | Mostra indicador de ferramenta |
| `done` | `done` | Finaliza bolha de mensagem |

Baseado no **3-message protocol** do Gateway Pi (`gateway-pi/.docs/CONSOLIDACAO.md`).

---

## 10. Segurança

- Native Messaging Host com `allowed_origins` restrito à extensão
- Tool execution autorizada pelo PermissionManager existente
- API keys gerenciadas pelo `AuthStorage` (file-locking em `~/.pi/agent/auth.json`)
- Host isolado — sem acesso ao DOM, comunicação só via stdin/stdout
