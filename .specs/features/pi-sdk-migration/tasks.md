# Pi SDK Migration — Tasks

> **Feature:** Pi SDK Migration  
> **Status:** Tasks  
> **Date:** 2026-05-09  
> **Total tasks:** 16

---

## Visão Geral das Dependências

```
Fase 1: Native Messaging Bridge (P1)
────────────────────────────────────
T1 ──→ T2 ──→ T3 ──→ T4 ──→ T5 ──→ T6
                                    │
              ┌─────────────────────┤
              ▼                     ▼
           (validação)          Fase 2
                              T7 ──→ T8 ──→ T9
                                            │
                                   ┌────────┤
                                   ▼        ▼
                                Fase 3    Fase 4
                               T10─T12   T13─T16
```

**Legenda:**
- → : depende de
- ├─ : pode iniciar em paralelo após dependência
- ┴ : todas as dependências precisam concluir

---

## Fase 1: Native Messaging Host + Bridge (P1)

### T1: Scaffold Native Messaging Host

| Campo | Detalhe |
|-------|---------|
| **O que** | Criar estrutura do projeto `native-host/` com package.json, tsconfig.json, e entry point |
| **Onde** | `G:/novosApps/pi-softwares-ideias/browserAgent/native-host/` |
| **Depends on** | — |
| **Reuses** | `extension/package.json` patterns, `extension/tsconfig.json` |
| **Done when** | ✅ `npm install` funciona ✅ `npm run build` compila sem erros ✅ Dependências instaladas: `@mariozechner/pi-coding-agent`, `typebox` |

**Arquivos:**
- `native-host/package.json` — Dependências: `@mariozechner/pi-coding-agent`, `typebox`. Scripts: `build`, `start`
- `native-host/tsconfig.json` — ESM, NodeNext, output em `dist/`
- `native-host/src/index.ts` — Entry point vazio com `process.stdin` reader

---

### T2: Protocol Types + stdin/stdout Loop

| Campo | Detalhe |
|-------|---------|
| **O que** | Definir tipos do protocolo JSONL e implementar loop de leitura/escrita stdin/stdout |
| **Onde** | `native-host/src/protocol.ts`, `native-host/src/index.ts` |
| **Depends on** | T1 |
| **Reuses** | Gateway Pi protocol structure (`gateway-pi/src/bridges/pi-sdk.bridge.ts`) |
| **Done when** | ✅ Host lê JSONL do stdin e escreve JSONL no stdout ✅ Tipos definidos para todas as mensagens do protocolo ✅ Loop trata final de linha e parse JSON |

**Arquivos:**
- `native-host/src/protocol.ts` — Interfaces: `BridgeMessage`, `HostEvent`, `ProviderInfo`
- `native-host/src/index.ts` — Loop: `readline` → parse JSON → dispatch → write response

---

### T3: PiSDKHost — createAgentSession + ModelRegistry + AuthStorage

| Campo | Detalhe |
|-------|---------|
| **O que** | Implementar `PiSDKHost` class com `createAgentSession()`, `ModelRegistry.create()`, `AuthStorage.create()` |
| **Onde** | `native-host/src/pisdk-host.ts` |
| **Depends on** | T2 |
| **Reuses** | Gateway Pi `pi-sdk.bridge.ts` setup pattern, Kanban `ProcessManager` |
| **Done when** | ✅ `PiSDKHost` inicializa sem erros ✅ `createAgentSession()` cria sessão com `SessionManager.inMemory()` ✅ `ModelRegistry.getAvailable()` retorna modelos do `~/.pi/agent/models.json` ✅ `AuthStorage` carrega keys do `~/.pi/agent/auth.json` |

---

### T4: Browser Tools como Custom Tools do Pi SDK

| Campo | Detalhe |
|-------|---------|
| **O que** | Registrar todas as browser tools (navigate, click, type, screenshot, tabs_context, etc.) como `defineTool()` custom tools do Pi SDK |
| **Onde** | `native-host/src/browser-tools.ts` |
| **Depends on** | T3 |
| **Reuses** | Tool definitions de `extension/src/service-worker/tools.ts` (replicar schemas) |
| **Done when** | ✅ Todas as ferramentas registradas via `defineTool()` ✅ `execute()` de cada tool envia `toolExec` pro SW e aguarda `toolResult` ✅ Schemas dos parâmetros correspondem aos originais |

**Ferramentas a registrar:**
- `navigate`, `click`, `type`, `scroll`, `screenshot`, `javascript`, `form_input`, `get_page_text`, `read_console`, `read_network`, `tabs_context`, `tabs_create`, `resize_window`, `web_search`, `web_fetch`, `file_download`, `read_file`, `create_file`, `edit_file`

---

### T5: NativeBridge (Service Worker)

| Campo | Detalhe |
|-------|---------|
| **O que** | Implementar `NativeBridge` class no SW da extensão, conectando via `chrome.runtime.connectNative()` |
| **Onde** | `extension/src/service-worker/native-bridge.ts` |
| **Depends on** | T2 (protocol types) |
| **Reuses** | Padrão `chrome.runtime.connectNative` das docs |
| **Done when** | ✅ `connect()` estabelece porta nativa ✅ `prompt()` envia mensagem ao host ✅ Eventos do host (delta, toolStart, toolExec, etc.) são roteados para callbacks ✅ Reconexão automática se porta cair |

---

### T6: Integração — Chat Handler Usa NativeBridge

| Campo | Detalhe |
|-------|---------|
| **O que** | Modificar `handleChatSend` no SW para usar `NativeBridge` em vez de `streamChat()` |
| **Onde** | `extension/src/service-worker/index.ts` |
| **Depends on** | T5, T4 |
| **Done when** | ✅ `chat:send` → NativeBridge.prompt() ✅ Stream de texto flui do Host → SW → Side Panel ✅ Tool execution flui: SDK → Host → SW → Content Script → Host → SDK ✅ Mensagens de tool, resultado e erro aparecem corretamente ✅ Abort/Stop funciona ✅ Fix de `reasoning_content` do DeepSeek resolvido pelo SDK |

**Teste:**
```typescript
// Test via diagnostic handlers
chrome.runtime.sendMessage({
  type: 'chat:send',
  provider: 'opencode-go',
  model: 'deepseek-v4-pro',
  messages: [{ role: 'user', content: 'quais abas estão abertas?' }]
});
```

---

## Fase 2: Streaming + Side Panel Integration

### T7: Side Panel — Port-based Streaming

| Campo | Detalhe |
|-------|---------|
| **O que** | Modificar Side Panel para abrir `chrome.runtime.connect()` ao enviar mensagem e receber eventos de streaming (delta, reasoning, toolStart, etc.) |
| **Onde** | `extension/src/side-panel/ChatContext.tsx`, `extension/src/side-panel/App.tsx` |
| **Depends on** | T6 |
| **Reuses** | StreamConsumer 3-message pattern do Gateway Pi |
| **Done when** | ✅ Side Panel abre `runtime.connect()` ao enviar mensagem ✅ Eventos `chat:delta` fluem em tempo real ✅ Indicador visual durante tool execution ✅ Mensagem final aparece corretamente |

---

### T8: Visual Indicators — Restore Durante Tool Execution

| Campo | Detalhe |
|-------|---------|
| **O que** | Garantir que `toolStart`/`toolEnd` do SDK disparem os indicadores visuais (action indicator, phantom cursor, static dot) |
| **Onde** | `extension/src/service-worker/index.ts`, `extension/src/content-scripts/agent-indicator.ts` |
| **Depends on** | T6 |
| **Done when** | ✅ `toolStart("click")` → phantom cursor na coordenada ✅ `toolStart("screenshot")` → flash indicator ✅ `toolStart("navigate")` → static dot ✅ `toolEnd` → hide action indicator ✅ Funciona igual ao fluxo atual |

---

### T9: Side Panel — Provider Selector via Host

| Campo | Detalhe |
|-------|---------|
| **O que** | Fazer o seletor de provider/modelo consultar o Native Host via `listModels` |
| **Onde** | `extension/src/side-panel/components/Header.tsx`, `extension/src/service-worker/index.ts` |
| **Depends on** | T7 |
| **Done when** | ✅ `models:list` → NativeBridge → Host → `modelRegistry.getAvailable()` → retorna lista ✅ Side Panel exibe providers disponíveis com API key configurada ✅ Seleção de modelo persiste via `setModel` no Host |

---

## Fase 3: Session Persistence (P2)

### T10: SessionManager Persistente

| Campo | Detalhe |
|-------|---------|
| **O que** | Mudar `SessionManager.inMemory()` para `SessionManager.create()` no Native Host, salvando sessões em disco |
| **Onde** | `native-host/src/pisdk-host.ts` |
| **Depends on** | T6 |
| **Done when** | ✅ Sessões salvam em `~/.pi/agent/sessions/` ✅ `sessionFile` contém histórico persistente ✅ Se host crasha e reinicia, sessão pode ser recuperada |

---

### T11: Reconexão Automática após SW Restart

| Campo | Detalhe |
|-------|---------|
| **O que** | Garantir que quando o SW reiniciar (MV3 timeout), ele reconecte ao Host e retome a sessão ativa |
| **Onde** | `extension/src/service-worker/native-bridge.ts` + `extension/src/service-worker/index.ts` |
| **Depends on** | T10 |
| **Done when** | ✅ `initialize()` tenta `connectNative()` e envia `{ type: "resumeSession" }` ✅ Host retorna `sessionInfo` com histórico atual ✅ Side Panel recarrega mensagens da sessão ✅ Chat continua de onde parou |

---

### T12: Compaction Handling

| Campo | Detalhe |
|-------|---------|
| **O que** | Configurar `settingsManager` com `compaction.enabled = false` (por default) ou usar auto-compact do SDK |
| **Onde** | `native-host/src/pisdk-host.ts` |
| **Depends on** | T10 |
| **Done when** | ✅ Decisão tomada sobre usar ou não compaction ✅ Se habilitado, eventos de compaction são propagados ao SW ✅ SW notifica usuário se contexto está sendo compactado |

---

## Fase 4: Cleanup — Remover Código Legado (P4)

### T13: Remover Provider Streaming Code

| Campo | Detalhe |
|-------|---------|
| **O que** | Remover `streamChat()`, `buildRequestBody()`, `extractToolCalls()`, `parseJSONSafe()`, `getActiveTabId()` (se duplicado) |
| **Onde** | `extension/src/service-worker/index.ts` |
| **Depends on** | T6 (validado) |
| **Done when** | ✅ Funções removidas ✅ Código compila sem erros ✅ Test:diagnostic handlers (test:tool, test:toolcall) removidos ou adaptados |

---

### T14: Simplificar Provider Types

| Campo | Detalhe |
|-------|---------|
| **O que** | Manter apenas tipos compartilhados entre SW e Side Panel; remover `ChatMessage`, `ChatChunk`, tipos de provider específicos |
| **Onde** | `extension/src/service-worker/providers/types.ts` |
| **Depends on** | T13 |
| **Done when** | ✅ `types.ts` contém apenas `ToolCall`, `ToolResult`, `ToolDefinition` ✅ `ChatMessage`, `ChatChunk`, `Request`/`Response` removidos ✅ Nada quebra no Side Panel |

---

### T15: Remover Provider Registry

| Campo | Detalhe |
|-------|---------|
| **O que** | Remover `providers/registry.ts` e configs `models.custom.json`, `models.default.json` (ou manter só como fallback offline) |
| **Onde** | `extension/src/service-worker/providers/registry.ts`, `extension/config/models.*.json` |
| **Depends on** | T9 (model selector via host) |
| **Done when** | ✅ `loadProviders()` removido ✅ `getProvider()` removido ✅ `reloadProviders()` removido ✅ SW não carrega mais `models_config` de `chrome.storage` para providers |

---

### T16: Remover SSE Parser Code

| Campo | Detalhe |
|-------|---------|
| **O que** | Remover todo o SSE parsing do `streamChat`: `toolCallIndex`, `buffer += decoder.decode()`, `for (const line of lines)`, etc. |
| **Onde** | `extension/src/service-worker/index.ts` |
| **Depends on** | T13 |
| **Done when** | ✅ Nenhuma referência a `data: `, `[DONE]`, `parsed.choices` no código ✅ Código compila e lints passam |

---

## Sumário de Esforço

| Fase | Tasks | Arquivos alterados/criados | Estimativa |
|------|-------|---------------------------|------------|
| **F1** Native Bridge | T1-T6 | 7 novos, 1 modificado | 3-4 dias |
| **F2** Streaming UI | T7-T9 | 3 modificados | 1-2 dias |
| **F3** Session Persistence | T10-T12 | 1 novo, 2 modificados | 1-2 dias |
| **F4** Cleanup | T13-T16 | 3-4 removidos | 1 dia |
| **Total** | **16** | ~8 novos, ~6 modificados, ~4 removidos | **6-9 dias** |

## Riscos

- **T5 (NativeBridge)**: `chrome.runtime.connectNative()` não funciona se native messaging host não estiver instalado. Precisa de fallback.
- **T8 (Indicators)**: Tool names do Pi SDK podem diferir dos nomes atuais. Mapear na `browser-tools.ts`.
- **T10 (Persistence)**: Sessões em disco podem crescer. O SDK já faz auto-compaction, mas monitorar.
- **T15 (Cleanup)**: Se fallback for necessário, manter `models.default.json` como leitura-only.
