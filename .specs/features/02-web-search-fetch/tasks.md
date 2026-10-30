# Tasks: Web Search + Web Fetch

**Feature ID:** `web-search-fetch`

---

## Dependências

- T5 (Tool Executor) — ✅ concluído, reutilizar infraestrutura
- T3 (Provider Layer) — ✅ concluído
- Tool definitions em `tools.ts` — ✅ ficheiro existe

---

## T1: Types — WebSearchInput + WebFetchInput

**Ficheiro:** `extension/src/service-worker/providers/types.ts`

**O quê:** Adicionar interfaces TypeScript para os inputs das novas tools.

```typescript
export interface WebSearchInput {
  query: string;
  count?: number;
}

export interface WebFetchInput {
  url: string;
  maxChars?: number;
}

export interface SearchProviderConfig {
  url: string;
  parser: 'searxng' | 'google' | 'custom';
  apiKey?: string;
}
```

**Feito quando:** Ficheiro compila sem erros, tipos exportados e usáveis.

---

## T2: Tool Definitions — web_search + web_fetch

**Ficheiro:** `extension/src/service-worker/tools.ts`

**O quê:** Adicionar `WEB_SEARCH_TOOL` e `WEB_FETCH_TOOL` com schemas e descriptions, e adicioná-los ao array `ALL_TOOLS`.

- `WEB_SEARCH_TOOL`: parâmetros `query` (string, required) e `count` (integer, optional)
- `WEB_FETCH_TOOL`: parâmetros `url` (string, required) e `maxChars` (integer, optional)

**Feito quando:** Tools aparecem no array `ALL_TOOLS`, `npx tsc --noEmit` passa.

---

## T3: Executor — executeWebSearch

**Ficheiro:** `extension/src/service-worker/tools.ts`

**O quê:** Implementar `executeWebSearch()`:
1. Carregar config do motor de busca (`ba-search-provider` do `chrome.storage.local`)
2. Se não configurado, usar fallback (SearXNG público)
3. Construir URL com query + formato JSON
4. Fetch com timeout de 15s (usar `AbortController`)
5. Parsear resultados (SearXNG ou Google)
6. Formatar como lista de texto: `1. Title\n   URL\n   Snippet\n`
7. Adicionar ao switch `executeTool()` no case `'web_search'`

**Feito quando:** `web_search` executada retorna resultados formatados, timeout funciona, erros tratados.

---

## T4: Executor — executeWebFetch

**Ficheiro:** `extension/src/service-worker/tools.ts`

**O quê:** Implementar `executeWebFetch()`:
1. Validar URL (rejeitar schemes bloqueados)
2. Fetch com timeout de 30s
3. Detetar Content-Type
4. Se HTML: extrair texto (strip tags, priorizar `<article>`/`<main>`)
5. Se JSON/XML: retornar raw (truncado)
6. Truncar se excede limite
7. Adicionar ao switch `executeTool()` no case `'web_fetch'`

**Feito quando:** `web_fetch` retorna conteúdo textual de URLs HTML e JSON, URLs bloqueadas são rejeitadas.

---

## T5: Options Page — Configuração do Motor de Busca

**Ficheiro:** `extension/src/options/App.tsx`

**O quê:** Adicionar secção "Search Engine" na options page:
- Campo: URL do motor de busca (com placeholder `https://searx.be/search?q={query}&format=json`)
- Dropdown: parser type (SearXNG / Google)
- Campo: API Key (opcional, password field)
- Botão "Test connection"
- Salvar em `chrome.storage.local` como `ba-search-provider`

**Feito quando:** Utilizador pode configurar motor de busca na UI, config persiste entre sessões.

---

## T6: i18n — Novas Chaves

**Ficheiros:** `extension/_locales/en/messages.json`, `extension/_locales/pt_BR/messages.json`

**O quê:** Adicionar chaves:

| Chave | EN | PT |
|-------|----|----|
| `tool_web_search` | Search the web | Pesquisar na web |
| `tool_web_fetch` | Fetch URL | Buscar URL |
| `search_engine_url` | Search Engine URL | URL do Motor de Busca |
| `search_engine_parser` | Parser type | Tipo de parser |
| `search_test` | Test search | Testar pesquisa |
| `search_no_config` | Web search not configured | Pesquisa web não configurada |
| `fetch_blocked_scheme` | Blocked URL scheme | Esquema de URL bloqueado |
| `fetch_too_large` | Response too large (truncated) | Resposta muito grande (truncada) |

---

## Ordem de Execução

```
T1 (types) ──→ T2 (definitions) ──→ T3 (web_search exec) ──→ T4 (web_fetch exec)
                                                                       │
                              T5 (options page) ────────────────────────┤
                                                                       │
                              T6 (i18n) ───────────────────────────────┘
```

T1, T2 são sequenciais. T3 e T5 podem ser paralelos (dependem de T2). T4 depende de T2. T6 é final.
