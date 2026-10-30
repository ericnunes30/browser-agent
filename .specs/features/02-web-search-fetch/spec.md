# Feature: Web Search + Web Fetch

**Feature ID:** `web-search-fetch`
**Prioridade:** 1 (depois de testes funcionais)
**Inspiração:** Claude in Chrome — strings i18n `x0W7xxxEcv` ("Web search"), `4Bom+nABM6` ("Web fetch")

---

## Descrição

Adicionar duas ferramentas que o LLM pode usar para pesquisar e obter conteúdo da web:

1. **`web_search`** — pesquisa na web usando um motor de busca configurável
2. **`web_fetch`** — obtém o conteúdo de uma URL arbitrária via `fetch()`

Sem estas tools, o agente só consegue interagir com a aba ativa do navegador. Com elas, pode pesquisar informações, ler documentação, comparar resultados de múltiplas fontes.

---

## User Stories

### P1: Web Search ⭐ MVP

**Como** utilizador,  
**Quero** que o agente pesquise na web  
**Para** encontrar informações atualizadas sem eu ter que navegar manualmente.

**Critérios de Aceitação (WHEN/THEN/SHALL):**

1. WHEN o LLM chama `web_search` com uma query THEN o service worker SHALL executar a pesquisa via motor configurado e retornar resultados formatados
2. WHEN a pesquisa retorna resultados THEN cada resultado SHALL conter título, URL e snippet/descrição
3. WHEN o motor de busca falha (timeout, erro HTTP) THEN a tool SHALL retornar uma mensagem de erro descritiva
4. WHEN o motor de busca não está configurado THEN a tool SHALL retornar "Web search is not configured. Add a search provider in settings."

### P1: Web Fetch ⭐ MVP

**Como** utilizador,  
**Quero** que o agente obtenha o conteúdo de URLs específicas  
**Para** ler artigos, documentação ou APIs.

**Critérios de Aceitação:**

1. WHEN o LLM chama `web_fetch` com uma URL THEN o service worker SHALL fazer `fetch()` e retornar o conteúdo textual
2. WHEN a resposta é HTML THEN o service worker SHALL extrair o texto principal (strip HTML tags, priorizar `<article>` / `<main>`)
3. WHEN a resposta é JSON/XML THEN o service worker SHALL retornar o conteúdo em bruto (limitado a 50KB)
4. WHEN a URL é inválida ou inacessível THEN a tool SHALL retornar "Failed to fetch URL: {reason}"
5. WHEN o conteúdo excede 100KB THEN a tool SHALL truncar e indicar "Content truncated to 100KB"

### P2: Limites e Segurança

**Critérios de Aceitação:**

1. WHEN a ferramenta é chamada THEN timeout SHALL ser de 15 segundos para web_search, 30 segundos para web_fetch
2. WHEN o URL contém `chrome://`, `chrome-extension://` ou `file://` THEN a tool SHALL rejeitar com "Blocked URL scheme"
3. WHEN há múltiplas pesquisas simultâneas THEN SHALL ser processadas em paralelo (não bloquear o tool loop)

### P3: Configuração do Motor de Busca

**Critérios de Aceitação:**

1. WHEN o utilizador configura um motor de busca nas opções THEN o provider SHALL ser guardado em `chrome.storage.local`
2. WHEN nenhum motor está configurado THEN a extensão SHALL usar um fallback (SearXNG público ou Google via query parameter)
3. WHEN o motor suporta API key THEN a chave SHALL ser guardada em `chrome.storage.local` (nunca em ficheiros de config)

---

## Dependências

| Dependência | Descrição |
|-------------|-----------|
| Provider Layer (T3) | Usa `fetch()` do service worker, reutiliza sistema de headers |
| Tool Executor (T5) | Adicionar novas entries no `executeTool()` switch |
| Tools.ts | Adicionar `web_search` e `web_fetch` tool definitions |
| Service Worker routing | Mensagens `chat:send` já roteiam tools — sem alterações |

## Fora de Escopo (v1)

- Pesquisa de imagens
- Web search com scraping avançado (JS rendering)
- Cache de resultados entre sessões
- Múltiplos motores de busca simultâneos
