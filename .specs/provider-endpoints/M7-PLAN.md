# M7: Provider Endpoints Configuration

**Goal:** BrowserAgent funciona sem native host obrigatório, conectando-se a endpoints OpenAI, Anthropic e Ollama Cloud configurados na página de opções. O native host continua disponível como fonte explícita e opcional.

**Padrão obrigatório:** **Adapter Pattern + helpers compartilhados por composição**. Cada provedor tem um adapter que normaliza:
- Listagem de modelos → `ModelInfo[]`
- Envio de prompt → stream normalizado de texto, reasoning, tool calls, erros
- Autenticação e headers específicos

> **Nota sobre Template Method**: não usamos Template Method porque OpenAI, Anthropic e Ollama têm protocolos fundamentalmente diferentes (endpoints distintos, SSE vs NDJSON, eventos diferentes). Herança rígida prejudicaria evolução. Usamos Adapter + helpers compartilhados (parseSSE, parseNDJSON, buildAuthHeaders) por composição para evitar duplicação sem forçar estrutura.

---

## Estrutura de Pastas

```
extension/src/service-worker/providers/
  adapter.ts              # interfaces ProviderAdapter, PromptParams, StreamCallbacks
  http-helpers.ts         # parseSSE, parseNDJSON, buildAuthHeaders, normalizeError
  openai-adapter.ts       # adapter OpenAI + OpenAI-compatible
  anthropic-adapter.ts    # adapter Anthropic Messages
  ollama-adapter.ts       # adapter Ollama native
  adapter-factory.ts      # getAdapter(type)
  types.ts                # ProviderType, ProviderEndpoint, ModelInfo, AuthType
extension/src/service-worker/
  provider-manager.ts     # orquestra adapters e storage
extension/src/options/
  provider-config.ts      # helpers de storage + obfuscation
  ProviderForm.tsx        # form de add/edit provider
  ProviderList.tsx        # lista de providers
extension/src/utils/
  obfuscation.ts          # encode/decode simples de API keys
```

---

## Tarefas

- [x] T1 — Criar tipos de provider
- [x] T2 — Implementar obfuscation de API keys
- [x] T3 — Criar helpers de storage
- [x] T4 — Criar interfaces do adapter
- [x] T5 — Criar helpers HTTP compartilhados
- [x] T6 — Implementar `OpenAIAdapter`
- [x] T7 — Implementar `AnthropicAdapter`
- [x] T8 — Implementar `OllamaAdapter`
- [x] T9 — Factory de adapters
- [x] T10 — Criar `ProviderManager`
- [x] T11 — Manter native host como fonte explícita
- [x] T12 — Criar componente `ProviderList`
- [x] T13 — Criar componente `ProviderForm`
- [x] T14 — Refatorar `App.tsx`
- [x] T15 — Atualizar `Header.tsx`
- [x] T16 — Atualizar `chat-handler.ts`
- [x] T17 — Testes unitários dos adapters
- [x] T18 — i18n
- [x] T19 — Build e verificação

### E1: Tipos, Storage e Obfuscation
**T1 — Criar tipos de provider**
- Arquivo: `extension/src/service-worker/providers/types.ts`
- Definir `ProviderType`, `ProviderEndpoint`, `StoredProviderConfig`, `ModelInfo`, `AuthType`.

**T2 — Implementar obfuscation de API keys**
- Arquivo: `extension/src/utils/obfuscation.ts`
- Funções `obfuscate(value: string): string` e `deobfuscate(value: string): string`.
- Usar base64 reversível + XOR simples com salt fixo. Não é segurança real, apenas anti-casual.

**T3 — Criar helpers de storage**
- Arquivo: `extension/src/options/provider-config.ts`
- Funções:
  - `loadProviderConfig(): Promise<StoredProviderConfig>`
  - `saveProviderConfig(config): Promise<void>`
  - `getActiveProviderId(): Promise<string | undefined>`
  - `setActiveProviderId(id): Promise<void>`

---

### E2: Adapter Pattern — Interfaces e Helpers
**T4 — Criar interfaces do adapter**
- Arquivo: `extension/src/service-worker/providers/adapter.ts`
- Definir `ProviderAdapter`, `PromptParams`, `StreamCallbacks`.

**T5 — Criar helpers HTTP compartilhados**
- Arquivo: `extension/src/service-worker/providers/http-helpers.ts`
- `parseSSE(response)` — gera eventos SSE normalizados.
- `parseNDJSON(response)` — gera objetos JSON de streams Ollama.
- `buildAuthHeaders(endpoint)` — monta headers de autenticação por tipo.
- `buildBaseHeaders()` — `Accept`, `Content-Type`.
- `normalizeError(response, body)` — converte HTTP error em mensagem amigável.

---

### E3: OpenAI Adapter
**T6 — Implementar `OpenAIAdapter`**
- Arquivo: `extension/src/service-worker/providers/openai-adapter.ts`
- Implementar `ProviderAdapter`.
- `listModels`: `GET {baseUrl}/models` → mapear `data[].id` para `ModelInfo`.
- `testConnection`: `GET {baseUrl}/models` com timeout curto.
- `sendPrompt`: `POST {baseUrl}/chat/completions` com `stream: true`.
  - Usar `parseSSE` do helper.
  - Emitir `onTextDelta` para `choices[0].delta.content`.
  - Emitir `onToolStart`/`onToolEnd` para `choices[0].delta.tool_calls`.
  - Detectar fim via `data: [DONE]`.
- Suportar tanto OpenAI quanto OpenAI-compatible (header configurável).

---

### E4: Anthropic Adapter
**T7 — Implementar `AnthropicAdapter`**
- Arquivo: `extension/src/service-worker/providers/anthropic-adapter.ts`
- Implementar `ProviderAdapter`.
- `listModels`: `GET {baseUrl}/models` com `anthropic-version: 2023-06-01`.
- `testConnection`: chamada leve de teste.
- `sendPrompt`: `POST {baseUrl}/messages` com `stream: true`.
  - Usar `parseSSE` do helper (eventos Anthropic têm prefixo `event:`).
  - Emitir `onTextDelta` para `text_delta`.
  - Emitir reasoning se houver.
  - Mapear tool_use/tool_result para callbacks de tools.

---

### E5: Ollama Adapter
**T8 — Implementar `OllamaAdapter`**
- Arquivo: `extension/src/service-worker/providers/ollama-adapter.ts`
- Implementar `ProviderAdapter`.
- `listModels`: `GET {baseUrl}/api/tags`.
- `testConnection`: `POST {baseUrl}/api/generate` com prompt dummy ou `GET /api/tags`.
- `sendPrompt`: `POST {baseUrl}/api/chat` com `stream: true`.
  - Usar `parseNDJSON` do helper.
  - Emitir `onTextDelta` para `message.content`.

**T9 — Factory de adapters**
- Arquivo: `extension/src/service-worker/providers/adapter-factory.ts`
- Função `getAdapter(type: ProviderType): ProviderAdapter`.
- Mapeia tipo para instância de adapter.

---

### E6: Provider Manager
**T10 — Criar `ProviderManager`**
- Arquivo: `extension/src/service-worker/provider-manager.ts`
- Responsabilidades:
  - Carregar config do storage.
  - Devolver provider ativo.
  - Listar modelos agregados de todos os providers ativos.
  - Roteamento de prompts para o adapter correto.
  - Roteamento explícito de prompts para o adapter correto.

**T11 — Manter native host como fonte explícita**
- O native host aparece como entrada selecionável quando disponível.
- Prompts são sempre roteados apenas para o provedor ativo explicitamente escolhido.
- Se nenhum provedor ativo estiver configurado, mostrar erro no UI.

---

### E7: UI da Página de Opções
**T12 — Criar componente `ProviderList`**
- Arquivo: `extension/src/options/ProviderList.tsx`
- Mostrar cards de providers com: label, tipo, baseUrl, toggle enabled, botões edit/delete/test.

**T13 — Criar componente `ProviderForm`**
- Arquivo: `extension/src/options/ProviderForm.tsx`
- Modal/form para adicionar/editar provider.
- Campos adaptativos por tipo.
- Botão "Test connection" chama adapter via message passing.
- Botão "Save" persiste no storage.

**T14 — Refatorar `App.tsx`**
- Substituir a seção atual de providers por `ProviderList` + `ProviderForm`.
- Adicionar seção "Default Model" com dropdown agregado.
- Manter as outras seções (search, site permissions, screenshot config).

---

### E8: Integração com Chat
**T15 — Atualizar `Header.tsx`**
- Mostrar provedor e modelo ativo baseado em `ba-active-provider` e modelos do ProviderManager.
- Remover dependência de hardcoded defaults.

**T16 — Atualizar `chat-handler.ts`**
- Usar `ProviderManager` para enviar prompts.
- Se provider selecionado for via adapter, chamar `adapter.sendPrompt()`.
- Se for via native host, manter comportamento atual.

---

### E9: Testes e Qualidade
**T17 — Testes unitários dos adapters**
- Criar mocks de fetch para testar:
  - `listModels` de cada adapter
  - `testConnection` sucesso/falha
  - `sendPrompt` streaming básico
- Arquivos: `extension/src/service-worker/providers/__tests__/openai-adapter.test.ts`, etc.

**T18 — i18n**
- Adicionar strings em `en` e `pt_BR` para:
  - Seção de providers
  - Botões add/edit/delete/test
  - Mensagens de erro de conexão
  - Placeholders de inputs

**T19 — Build e verificação**
- `npm run build` sem erros.
- Verificar que native host ainda funciona quando disponível.

---

## Dependências

```
E1 (types/storage)
  └── E2 (adapter interfaces + helpers)
       ├── E3 (openai adapter) ─┐
       ├── E4 (anthropic adapter)├─ E6 (provider manager)
       └── E5 (ollama adapter) ──┘
            ├── E7 (options UI)
            ├── E8 (chat integration)
            └── E9 (tests)
```

---

## Critérios de Aceite

- [x] Usuário consegue adicionar e testar um provider OpenAI na página de opções.
- [x] Usuário consegue selecionar um modelo da lista auto-descoberta.
- [x] Chat funciona com OpenAI sem native host instalado.
- [x] Adapter pattern está claro: novo provedor = novo adapter + factory.
- [x] Native host ainda funciona como fonte explícita quando presente.
- [x] Build passa; testes novos passam.
