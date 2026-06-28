# Provider Endpoints Configuration

## Padrão de Projeto: Adapter (com Helpers Compartilhados)

> **Por que Adapter e não Template Method?**
> 
> Os provedores (OpenAI, Anthropic, Ollama) têm protocolos **fundamentalmente diferentes**: endpoints distintos, formatos de streaming diferentes (SSE vs NDJSON), eventos diferentes e autenticação em headers diferentes. Template Method forçaria um algoritmo rígido que não se encaixa bem nessa divergência. Adapter permite que cada provedor seja implementado de forma independente, expondo uma interface uniforme para o resto da extensão.

Cada provedor é isolado por um **adapter** que implementa a mesma interface (`ProviderAdapter`). Helpers utilitários (`parseSSE`, `parseNDJSON`, `buildAuthHeaders`) são usados por composição para evitar duplicação, sem impor herança.

Isso permite:

- Adicionar novos provedores sem alterar o chat, o header ou a options page.
- Normalizar autenticação, endpoints, parsing de stream e capacidades.
- Testar cada provedor de forma isolada.
- Lidar com protocolos futuros (WebSocket, GraphQL, etc.) sem quebrar a estrutura existente.

### Interface do Adapter

```typescript
// extension/src/service-worker/providers/adapter.ts
export interface ProviderAdapter {
  listModels(endpoint: ProviderEndpoint): Promise<ModelInfo[]>;
  testConnection(endpoint: ProviderEndpoint): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }>;
  sendPrompt(
    endpoint: ProviderEndpoint,
    params: PromptParams,
    callbacks: StreamCallbacks,
  ): Promise<void>;
}
```

### Factory

```typescript
// extension/src/service-worker/providers/adapter-factory.ts
export function getAdapter(type: ProviderType): ProviderAdapter {
  switch (type) {
    case 'openai':
    case 'openai-compatible':
      return new OpenAIAdapter();
    case 'anthropic':
      return new AnthropicAdapter();
    case 'ollama':
      return new OllamaAdapter();
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}
```

### Helpers Compartilhados

Arquivo: `extension/src/service-worker/providers/http-helpers.ts`

```typescript
export async function* parseSSE(response: Response): AsyncGenerator<SSEEvent> { ... }
export async function* parseNDJSON(response: Response): AsyncGenerator<any> { ... }
export function buildAuthHeaders(endpoint: ProviderEndpoint): Record<string, string> { ... }
export function buildBaseHeaders(): Record<string, string> { ... }
export function normalizeError(response: Response, body?: string): string { ... }
```

Cada adapter usa os helpers que fizerem sentido:

```typescript
class AnthropicAdapter implements ProviderAdapter {
  async sendPrompt(endpoint, params, callbacks) {
    const headers = buildAuthHeaders(endpoint);     // helper compartilhado
    const response = await fetch(`${endpoint.baseUrl}/messages`, {
      method: 'POST',
      headers: { ...buildBaseHeaders(), ...headers },
      body: JSON.stringify(this.buildBody(params)),
    });

    for (const event of parseSSE(response)) {       // helper compartilhado
      this.parseAnthropicEvent(event, callbacks);   // específico do provedor
    }
  }
}
```

### Responsabilidades de cada adapter

| Adapter | `listModels` | `testConnection` | `sendPrompt` |
|---|---|---|---|
| **OpenAIAdapter** | `GET /models` | `GET /models` | SSE `POST /chat/completions` |
| **AnthropicAdapter** | `GET /models` + `anthropic-version` | Chamada de teste | SSE `POST /messages` |
| **OllamaAdapter** | `GET /api/tags` | `GET /api/tags` | NDJSON `POST /api/chat` |

### Como adicionar um novo provedor

1. Criar `extension/src/service-worker/providers/{novo}-adapter.ts`.
2. Implementar `ProviderAdapter`.
3. Adicionar tipo em `ProviderType`.
4. Registrar na factory.
5. Adicionar campos default na UI (se necessário).

---

## Visão

Permitir que o BrowserAgent funcione **sem native host obrigatório**, conectando-se diretamente a endpoints de LLM configurados pelo usuário na página de opções da extensão.

O native host continua existindo como **fonte explícita e opcional** para usuários avançados que já têm o Pi SDK configurado, mas deixa de ser necessário para instalação na Chrome Web Store. Ele deve ser selecionado ativamente e nunca é ativado automaticamente.

---

## Provedores Suportados (v1)

| Provedor | Endpoint Padrão | Protocolo | Autenticação |
|---|---|---|---|
| **OpenAI** | `https://api.openai.com/v1` | OpenAI REST | `Authorization: Bearer <key>` |
| **Anthropic (Claude)** | `https://api.anthropic.com/v1` | Anthropic Messages | `x-api-key: <key>` |
| **Ollama Cloud** | `https://api.ollama.com` (a confirmar) | Ollama native | Token/Cloud |
| **OpenAI-compatible personalizado** | URL configurável | OpenAI REST | Header configurável |

---

## Decisões de Arquitetura

| ID | Decisão | Justificativa |
|---|---|---|
| D-PE-01 | Manter native host como fonte explícita | Não quebrar usuários atuais; compatibilidade com Pi SDK; roteamento apenas para o provedor ativo |
| D-PE-02 | Usar wizard por provedor + modo OpenAI-compatible | UX amigável sem perder flexibilidade |
| D-PE-03 | Storage em `chrome.storage.local` com obfuscation simples | Chrome não tem criptografia nativa; evitar exposição casual |
| D-PE-04 | Nunca logar API keys | Segurança básica |
| D-PE-05 | Adapters isolados por protocolo | Facilita adicionar novos provedores depois |
| D-PE-06 | Seleção explícita: provedor ativo configurado → erro | Nenhuma troca automática entre provedores ou para native host |

---

## Storage Shape

```typescript
export type ProviderType = 'ollama' | 'openai' | 'anthropic' | 'openai-compatible';

export interface ProviderEndpoint {
  id: string;
  type: ProviderType;
  label: string;
  baseUrl: string;
  authType: 'bearer' | 'x-api-key' | 'custom-header' | 'none';
  authHeaderName?: string;
  apiKey: string; // obfuscated in storage
  enabled: boolean;
  modelsSource: 'auto' | 'manual';
  manualModels?: string[];
  defaultModel?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredProviderConfig {
  version: 1;
  activeProviderId?: string;
  providers: ProviderEndpoint[];
}
```

### Storage keys

- `ba-provider-config`
- `ba-active-provider`

---

## Interface Interna (Service Worker)

```typescript
export interface ProviderManager {
  getConfig(): Promise<StoredProviderConfig>;
  saveConfig(config: StoredProviderConfig): Promise<{ ok: true } | { ok: false; error: string }>;
  listModels(providerId: string): Promise<{ ok: true; models: ModelInfo[] } | { ok: false; error: string }>;
  testConnection(providerId: string): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }>;
  getActiveProvider(): Promise<ProviderEndpoint | null>;
  setActiveProvider(providerId: string | null): Promise<void>;
}

export interface ModelInfo {
  id: string;
  name: string;
  providerId: string;
  providerLabel: string;
  capabilities: {
    vision: boolean;
    tools: boolean;
    streaming: boolean;
    maxTokens?: number;
    contextWindow?: number;
  };
}
```

---

## Mapeamento de Endpoints

| Provedor | Listar modelos | Chat | Headers obrigatórios |
|---|---|---|---|
| OpenAI | `GET /models` | `POST /chat/completions` | `Authorization: Bearer <key>` |
| Anthropic | `GET /models` | `POST /messages` | `x-api-key: <key>`, `anthropic-version: 2023-06-01` |
| Ollama | `GET /api/tags` | `POST /api/chat` | Variável |
| OpenAI-compatible | `GET /v1/models` | `POST /v1/chat/completions` | Configurável |

---

## Adapter de Provedor

```typescript
export interface ProviderAdapter {
  listModels(endpoint: ProviderEndpoint): Promise<ModelInfo[]>;
  sendPrompt(
    endpoint: ProviderEndpoint,
    params: PromptParams,
    callbacks: StreamCallbacks,
  ): Promise<void>;
}
```

Implementações:
- `openai-adapter.ts`
- `anthropic-adapter.ts`
- `ollama-adapter.ts`

---

## UX da Página de Opções

### Seção "AI Providers"

1. Lista de cards de provedores configurados
2. Botão "Add Provider" abre modal/form
3. Formulário por tipo:
   - Tipo (select)
   - Label (input)
   - Base URL (input com default por tipo)
   - Auth type (select)
   - API Key (password input)
   - Models source (auto/manual)
   - Botões: Test connection, Save, Cancel
4. Modelo padrão global (dropdown com modelos ativos)

---

## CORS e Permissões

- `host_permissions` já cobre `http://*/*` e `https://*/`.
- OpenAI, Anthropic e Ollama Cloud permitem chamadas `fetch` da extensão.
- Ollama local (`http://localhost:11434`) pode precisar de configuração extra no próprio Ollama para CORS.

---

## Orquestração

1. Provedor ativo explicitamente selecionado.
2. Prompts são sempre roteados apenas para o provedor ativo.
3. Erro: "Nenhum provedor ativo configurado."

---

## Arquivos Envolvidos

### Novos
- `extension/src/options/provider-config.ts`
- `extension/src/service-worker/provider-manager.ts`
- `extension/src/service-worker/providers/adapter.ts`
- `extension/src/service-worker/providers/openai-adapter.ts`
- `extension/src/service-worker/providers/anthropic-adapter.ts`
- `extension/src/service-worker/providers/ollama-adapter.ts`
- `extension/src/service-worker/providers/prompt-params.ts`
- `extension/src/utils/obfuscation.ts`

### Modificados
- `extension/src/options/App.tsx`
- `extension/src/options/style.css`
- `extension/src/side-panel/components/Header.tsx`
- `extension/src/service-worker/chat-handler.ts`
- `extension/src/service-worker/native-bridge.ts`
- `extension/_locales/en/messages.json`
- `extension/_locales/pt_BR/messages.json`

---

## Próximos Passos

Ver `M7-PLAN.md` para a decomposição em tarefas.
