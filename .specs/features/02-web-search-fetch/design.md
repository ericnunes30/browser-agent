# Design: Web Search + Web Fetch

**Feature ID:** `web-search-fetch`

---

## Visão Geral da Arquitetura

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   LLM        │     │  Service Worker  │     │  Motor de Busca │
│  (modelo)    │────▶│  tool-executor   │────▶│  (SearXNG/Google)│
│              │◀────│  web_search/     │◀────│                 │
│              │     │  web_fetch       │     │                 │
└──────────────┘     └──────────────────┘     └─────────────────┘
                            │
                            ▼
                     ┌──────────────────┐
                     │  URL externa     │
                     │  (web_fetch)     │
                     └──────────────────┘
```

---

## 1. Tool Definitions

### `web_search`

```typescript
export const WEB_SEARCH_TOOL: ToolDefinition = {
  name: 'web_search',
  description: [
    'Search the web for information on a given query.',
    'Returns a list of results with titles, URLs, and snippets.',
    'Useful for finding current information, news, documentation, or facts.',
    'Results are limited to 10 entries by default.',
  ].join(' '),
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to look up on the web.',
      },
      count: {
        type: 'integer',
        description: 'Number of results to return (default: 5, max: 10).',
      },
    },
    required: ['query'],
  },
};
```

### `web_fetch`

```typescript
export const WEB_FETCH_TOOL: ToolDefinition = {
  name: 'web_fetch',
  description: [
    'Fetch the content of a URL and return it as plain text.',
    'If the response is HTML, the main content text is extracted.',
    'If the response is JSON or XML, the raw content is returned.',
    'Maximum response size is 100KB — larger responses are truncated.',
  ].join(' '),
  input_schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch content from.',
      },
      maxChars: {
        type: 'integer',
        description: 'Maximum characters to return (default: 50000, max: 100000).',
      },
    },
    required: ['url'],
  },
};
```

---

## 2. Motor de Busca — Configuração

A configuração do motor de busca será adicionada ao `ProviderDefinition` como campo opcional:

```typescript
interface SearchProviderConfig {
  /** URL template with {query} placeholder */
  url: string;
  /** How to parse results: 'searxng' | 'google' | 'custom' */
  parser: 'searxng' | 'google' | 'custom';
  /** Optional API key */
  apiKey?: string;
}
```

### Armazenamento

```typescript
// Guardado em chrome.storage.local
chrome.storage.local.set({
  'ba-search-provider': {
    url: 'https://searx.example.com/search?q={query}&format=json',
    parser: 'searxng',
  }
});
```

### Parsers Suportados (v1)

| Parser | Formato Esperado | Exemplo de URL |
|--------|------------------|----------------|
| `searxng` | JSON `{ results: [{ title, url, content }] }` | `https://searx.be/search?q={query}&format=json` |
| `google` | HTML scraping (via text extraction) | `https://www.google.com/search?q={query}` |

---

## 3. Execução

### `executeWebSearch`

```typescript
async function executeWebSearch(input: { query: string; count?: number }): Promise<ToolResult> {
  // 1. Load search provider config from chrome.storage.local
  // 2. If no provider configured, use fallback (SearXNG public)
  // 3. Build URL with query parameter
  // 4. Fetch with timeout (15s)
  // 5. Parse results based on parser type
  // 6. Format as plain text result list
  // 7. Return { type: 'tool_result', content: formatted }
}
```

### `executeWebFetch`

```typescript
async function executeWebFetch(input: { url: string; maxChars?: number }): Promise<ToolResult> {
  // 1. Validate URL (reject chrome://, chrome-extension://, file://)
  // 2. Fetch with timeout (30s)
  // 3. Check Content-Type header
  // 4. If HTML: extract text (basic tag stripping + article/main detection)
  // 5. If JSON/XML: return raw (truncate to maxChars)
  // 6. Truncate if exceeds limit
  // 7. Return { type: 'tool_result', content: text }
}
```

---

## 4. Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `extension/src/service-worker/tools.ts` | Adicionar tool definitions + executor functions + switch cases |
| `extension/src/service-worker/providers/types.ts` | Adicionar `SearchProviderConfig`, `WebSearchInput`, `WebFetchInput` |
| `extension/src/options/App.tsx` | Adicionar secção "Search Engine" na options page |
| `extension/src/options/style.css` | Estilos para a nova secção |
| `extension/_locales/*/messages.json` | Novas chaves i18n |

---

## 5. Considerações de Segurança

- **URL scheme blocking**: rejeitar `chrome://`, `chrome-extension://`, `file://`, `data://`, `javascript://`
- **Timeout rigoroso**: 15s web_search, 30s web_fetch
- **Content limits**: 50KB default, 100KB max para evitar memory issues
- **API keys**: guardadas em `chrome.storage.local` (nunca em ficheiros de config)
- **CORS**: `fetch()` do service worker não tem restrições CORS, mas URLs maliciosas podem ser usadas para SSRF — considerar whitelist de domínios no futuro

---

## 6. Integração com Provider Layer

Os tools definitions `WEB_SEARCH_TOOL` e `WEB_FETCH_TOOL` serão adicionados ao array `ALL_TOOLS` em `tools.ts`, que já é exportado e incluído nas chamadas à API via `ChatRequest.tools`.
