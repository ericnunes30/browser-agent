# Claude em Chrome (Beta) — Visão Geral

> **Extensão:** Claude (ID: `fcoeoabgfenejglbffodgkkbkcdhcgfn`)
> **Versão:** 1.0.70
> **Git Hash:** `379634e39a1056192426237c6974651162dabe5a`
> **Tamanho:** ~11.030 arquivos em assets/
> **Manifest:** MV3 (Manifest V3)
> **Chrome mínimo:** 116
> **Desenvolvedor:** Anthropic

---

## O que é?

"Claude in Chrome" é uma extensão oficial da Anthropic que permite ao Claude (modelo de IA da Anthropic) **controlar diretamente o navegador Chrome**. É como ter um agente de IA que pode ver sua tela, clicar, digitar, navegar e executar tarefas complexas no browser.

---

## Propósito Principal

Permitir que o Claude **aja como um assistente autônomo dentro do navegador**, executando tarefas como:

- Preencher formulários
- Navegar entre sites
- Extrair informações de páginas
- Automatizar fluxos de trabalho repetitivos
- Interagir com serviços web (Gmail, Google Docs, Sheets, etc.)
- Executar código JavaScript nas páginas
- Fazer screenshots e analisar páginas

---

## Como Funciona (Resumo)

1. O usuário abre o **side panel** do Claude (atalho: `Ctrl+E` / `Cmd+E`)
2. O side panel carrega uma UI completa de chat rodando o modelo Claude
3. O Claude pode ver o conteúdo da aba ativa, tirar screenshots, inspecionar a árvore de acessibilidade
4. O Claude executa **tools** (ferramentas) no navegador: clicar, digitar, scroll, ler páginas, etc.
5. Tudo passa pelo **service worker** que gerencia permissões, grupos de abas e comunicação

---

## Licenciamento

- Requer **plano pago** do Claude para funcionar
- Gerenciado via `managed_schema.json` — organizações podem configurar políticas
- URL de desinstalação: Google Forms da Anthropic

---

## Canais de Comunicação

| Canal | Detalhes |
|-------|----------|
| **chrome.runtime.sendMessage** | Comunicação interna entre service worker, side panel, content scripts |
| **chrome.runtime.sendMessage (external)** | Mensagens de `https://claude.ai` (OAuth, onboarding) |
| **Native Messaging** | Conexão com apps desktop (`com.anthropic.claude_browser_extension` e `com.anthropic.claude_code_browser_extension`) |
| **WebSocket** | Bridge para `wss://bridge.claudeusercontent.com` |
| **API Anthropic** | `https://api.anthropic.com` para chamadas de modelo |

---

## Dependências Externas Identificadas

| Dependência | Uso |
|-------------|-----|
| KaTeX | Renderização de fórmulas matemáticas |
| Mermaid | Diagramas (flowchart, sequence, class, etc.) |
| Cytoscape | Visualização de grafos |
| Dagre | Layout de grafos |
| GIF.js | Geração de GIFs animados |
| Segment.io | Analytics |
| Sentry | Monitoramento de erros |
| Honeycomb | Observabilidade |
| Datadog | Métricas de performance |

---

## Idiomas Suportados

A extensão possui i18n completa com os seguintes idiomas:
- en-US (inglês), de-DE (alemão), es-419 (espanhol LATAM), es-ES (espanhol)
- fr-FR (francês), hi-IN (hindi), id-ID (indonésio), it-IT (italiano)
- ja-JP (japonês), ko-KR (coreano), pt-BR (português brasileiro)
