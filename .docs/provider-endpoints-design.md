# Provider Endpoints Configuration Design

## 1. Contexto e Objetivo

Hoje o BrowserAgent depende de um **native host** (`com.pi.browseragent`) para ler `~/.pi/agent/models.json` e chamar modelos via pi SDK. Essa dependência impede publicação na Chrome Web Store e quebra a experiência de usuários comuns.

**Objetivo**: permitir que a extensão se conecte diretamente a múltiplos provedores de LLM através de **endpoints configurados na página de opções**, sem native host obrigatório.

## 2. Provedores Suportados (v1)

| Provedor | Endpoint Padrão | Protocolo | Autenticação |
|---|---|---|---|
| **Ollama Cloud** | `https://ollama.com` / `https://api.ollama.com` (confirmar) | Ollama REST | Token/Cloud |
| **OpenAI** | `https://api.openai.com/v1` | OpenAI REST | API Key (`Authorization: Bearer ...`) |
| **Claude (Anthropic)** | `https://api.anthropic.com/v1` | Anthropic REST | API Key (`x-api-key`) |
| **OpenAI-compatible personalizado** | URL configurável pelo usuário | OpenAI REST | API Key em header configurável |

> **Decisão**: manter o native host como **opcional/plano B** por compatibilidade, mas a fonte primária de modelos passa a ser os endpoints configurados.

## 3. Alternativas de Design de Interface

### 3.1 Design A: JSON Declarativo Editável

**Ideia**: Um único campo JSON na options page define todos os provedores.

```json
{
  "providers": [
    {
      "id": "openai-work",
      "type": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "sk-...",
      "models": ["gpt-4o", "gpt-4o-mini"]
    }
  ]
}
```

**Vantagens**:
- Mínima interface: um textarea + validador JSON.
- Fácil de copiar/colar configurações entre dispositivos.
- Genérico: qualquer provedor novo cabe no mesmo formato.

**Desvantagens**:
- Ruim para usuários não-técnicos.
- Erros de validação são difíceis de comunicar.
- Não guia o usuário sobre quais campos cada provedor precisa.

### 3.2 Design B: Wizard por Provedor

**Ideia**: Formulário passo-a-passo. Usuário escolhe o tipo de provedor e o formulário se adapta.

**Fluxo**:
1. "Add Provider" → seleciona OpenAI/Anthropic/Ollama/Custom.
2. Campos específicos aparecem (baseUrl preenchido, header esperado).
3. Botão "Test" valida conexão.
4. Lista de modelos carregada automaticamente.

**Vantagens**:
- UX amigável para usuários comuns.
- Validação por tipo de provedor.
- Descoberta automática de modelos.

**Desvantagens**:
- Mais código para cada novo provedor.
- Interface maior e mais complexa.

### 3.3 Design C: Endpoint Único Universal OpenAI-Compatible

**Ideia**: Simplificar tudo para um único provedor "OpenAI-compatible".

```typescript
{
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-...",
  "authHeader": "Authorization",
  "models": ["gpt-4o"]
}
```

**Vantagens**:
- Código mínimo: um adapter serve todos.
- Fácil de documentar.
- Funciona com OpenAI, OpenRouter, Groq, etc.

**Desvantagens**:
- Não funciona bem com Anthropic (protocolo diferente).
- Ollama Cloud usa endpoints diferentes.
- Limita recursos específicos (vision, tools, reasoning) de cada provedor.

### 3.4 Recomendação

**Design híbrido: Wizard por Provedor (B) com fallback para Custom OpenAI-Compatible (A/C).**

- Usamos formulários guiados para OpenAI, Anthropic e Ollama.
- Mantemos um modo "OpenAI-compatible personalizado" para provedores genéricos.
- O storage usa JSON estruturado (similar ao A), mas a UI é wizard (B).

**Por quê**: equilibra UX para usuários comuns e flexibilidade para usuários avançados, sem duplicar muito código.

## 4. Requisitos Funcionais

1. **Configurar múltiplos endpoints** na página `options.html`:
   - Tipo do provedor (selector)
   - Nome amigável (label)
   - URL base do endpoint
   - Tipo de autenticação (header + token)
   - Modelos permitidos (lista manual opcional, ou auto-descoberta)
   - Ativar/desativar provedor

2. **Testar conexão** com botão "Testar" na configuração.
3. **Listar modelos disponíveis** automaticamente para cada provedor ativo.
4. **Selecionar modelo padrão** usado no chat.
5. **Fallback ordenado**: se um provedor falhar, tentar o próximo ativo.
6. **Armazenamento seguro** de chaves API no `chrome.storage.local`.
7. **CORS**: endpoints precisam aceitar chamadas da extensão; OpenAI, Anthropic e Ollama Cloud geralmente aceitam. Endpoints locais (Ollama local) podem precisar de `chrome.permissions` adicionais ou proxy.

## 5. Requisitos Não-Funcionais

- Sem native host obrigatório na instalação.
- Funcionar offline para Ollama local (se permitido pelo CORS/headers).
- Não expor chaves API no log.
- Design evolutivo: fácil adicionar novos provedores (Gemini, DeepSeek, Groq, etc.).
- UX da página de opções deve ser clara em PT-BR e EN.

## 6. Proposta de Interface de Configuração

### 6.1 Tipo TypeScript (storage shape)

```typescript
// extension/src/options/provider-config.ts

export type ProviderType = 'ollama' | 'openai' | 'anthropic' | 'openai-compatible';

export interface ProviderEndpoint {
  id: string;              // uuid gerado pelo browser
  type: ProviderType;
  label: string;           // ex: "OpenAI - Trabalho"
  baseUrl: string;         // https://api.openai.com/v1
  authType: 'bearer' | 'x-api-key' | 'custom-header' | 'none';
  authHeaderName?: string;  // usado quando authType === 'custom-header'
  apiKey: string;          // criptografado/obfuscado no storage
  enabled: boolean;
  modelsSource: 'auto' | 'manual';
  manualModels?: string[]; // ['gpt-4o', 'gpt-4o-mini']
  defaultModel?: string;   // modelo selecionado por padrão
  createdAt: number;
  updatedAt: number;
}

export interface StoredProviderConfig {
  version: 1;
  activeProviderId?: string;
  providers: ProviderEndpoint[];
}
```

### 6.2 Storage key

```
chrome.storage.local: "ba-provider-config"
chrome.storage.local: "ba-active-provider"
```

## 7. Proposta de API Interna (Service Worker)

A extensão expõe métodos internos (não REST pública) para o side panel/options consumir.

```typescript
// extension/src/service-worker/provider-manager.ts

export interface ProviderManager {
  /**
   * Lê config do storage e retorna provedores descriptografados.
   * Nunca loga as chaves.
   */
  getConfig(): Promise<StoredProviderConfig>;

  /**
   * Salva config completa. Valida endpoints antes de persistir.
   */
  saveConfig(config: StoredProviderConfig): Promise<{ ok: true } | { ok: false; error: string }>;

  /**
   * Busca modelos disponíveis em um provedor.
   */
  listModels(providerId: string): Promise<{
    ok: true; models: ModelInfo[] } | { ok: false; error: string }>;

  /**
   * Testa conectividade (faz chamada leve, ex: /models ou headers).
   */
  testConnection(providerId: string): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }>;

  /**
   * Retorna o provider ativo.
   */
  getActiveProvider(): Promise<ProviderEndpoint | null>;

  /**
   * Define provider ativo.
   */
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

## 8. Mapeamento de Endpoints por Provedor

| Provedor | List models | Chat completions | Auth header | Body/Notes |
|---|---|---|---|---|
| OpenAI | `GET /models` | `POST /chat/completions` | `Authorization: Bearer <key>` | OpenAI standard |
| Anthropic | `GET /models` | `POST /messages` | `x-api-key: <key>` + `anthropic-version: 2023-06-01` | Mensagens; vision via `image` blocks |
| Ollama Cloud | `GET /api/tags` | `POST /api/generate` ou `/api/chat` | variável | Ollama native; precisa de adapter |
| OpenAI-compatible | `GET /v1/models` | `POST /v1/chat/completions` | configurável | OpenAI standard |

## 9. Adapter de Provedor

Cada provedor terá um adapter que normaliza:
- listagem de modelos → `ModelInfo[]`
- envio de mensagem → stream de texto/reasoning/tool calls
- erro → mensagem amigável

```typescript
// extension/src/service-worker/providers/adapter.ts
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

## 10. UX da Página de Opções

### 10.1 Seção "AI Providers"

1. **Lista de provedores cadastrados**
   - Card por provedor: label, tipo, URL base, toggle on/off, botão editar, botão excluir.
2. **Botão "Add Provider"**
   - Abre modal/form.
3. **Formulário de provedor**
   - Tipo (select)
   - Label (input)
   - Base URL (input, preenchido com default por tipo)
   - Auth type (select: Bearer, x-api-key, Custom header, None)
   - API Key / Token (password input)
   - Models source (auto / manual)
   - Botões: "Test connection", "Save", "Cancel"
4. **Modelo padrão global**
   - Dropdown com modelos de todos os provedores ativos.

### 10.2 Estados de erro

- Chave inválida → mensagem vermelha amigável.
- Endpoint inalcançável (CORS/network) → instruções de troubleshooting.
- Nenhum provedor configurado → aviso no chat e no header.

## 11. Segurança

- **Chaves API** armazenadas apenas em `chrome.storage.local` (não sync, para evitar leak via conta Google).
- **Obfuscation simples** no storage (base64 reversível) apenas para evitar exposição casual; não é criptografia real. Usuário avançado pode inspecionar, mas isso é padrão para extensions.
- **Nunca logar** API keys em console, erros, ou mensagens de erro.
- **Content Security Policy** do manifest já deve bloquear inline scripts; manter.

## 12. CORS e Permissões

- Para chamar endpoints externos, a extensão precisa declarar `host_permissions` abrangentes (`http://*/` e `https://*/`), que já temos.
- OpenAI, Anthropic e Ollama Cloud permitem chamadas `fetch` com `Authorization` headers.
- Ollama local (`http://localhost:11434`) pode exigir permissão explícita em `host_permissions` e talvez não funcione em CORS pré-flight sem configuração do Ollama.

## 13. Fallback e Orquestração

- Se o native host estiver disponível, ele continua sendo uma fonte de modelos.
- Se não estiver, usa os endpoints configurados.
- Ordem de prioridade:
  1. Provedor ativo selecionado pelo usuário.
  2. Primeiro provedor configurado e testado com sucesso.
  3. Native host (se disponível).
  4. Erro: "Nenhum provedor configurado".

## 14. Decisões a Tomar

1. **Mantemos native host como plano B?** Sim, mas não obrigatório.
2. **Ollama Cloud ou Ollama local?** Ambos, mas Ollama local pode ter limitações de CORS.
3. **Criptografia real das chaves?** Chrome não oferece API nativa. Obfuscation é aceitável para MVP.
4. **Modelos manuais vs auto-list?** Ambos: auto-list como padrão, manual como fallback.
5. **Streaming no chat**: usar Server-Sent Events para OpenAI e Anthropic; Ollama usa NDJSON.

## 15. Próximos Passos Sugeridos

1. Criar tipos e storage (`provider-config.ts`).
2. Criar adapters (`openai-adapter.ts`, `anthropic-adapter.ts`, `ollama-adapter.ts`).
3. Criar `provider-manager.ts` no service worker.
4. Refatorar página `options/App.tsx` com a nova seção "AI Providers".
5. Refatorar `Header.tsx` e chat para usar modelos dos adapters.
6. Adicionar testes unitários para adapters.
7. Remover dependência obrigatória do native host.

---

## 16. Exemplo de Fluxo

1. Usuário abre `options.html`.
2. Clica "Add Provider" → seleciona OpenAI → cola API key → clica "Test connection".
3. Adapter faz `GET https://api.openai.com/v1/models`.
4. Em sucesso, lista modelos disponíveis (gpt-4o, gpt-4o-mini, etc.).
5. Usuário seleciona "gpt-4o" como padrão.
6. No chat, o Header mostra "OpenAI / gpt-4o".
7. Ao enviar mensagem, `provider-manager` roteia para `openai-adapter` e faz streaming da resposta.
