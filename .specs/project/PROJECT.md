# PROJECT — BrowserAgent

## Vision

**BrowserAgent** é uma extensão Chrome model-agnostic que permite um agente de IA controlar o navegador — navegar, clicar, digitar, capturar telas, extrair dados — através de um chat no side panel. No futuro, atuará como servidor MCP conectável a agentes de codificação como o pi.

## Goals

1. Criar um clone funcional do "Claude em Chrome" com suporte a qualquer LLM
2. Expor ~18 ferramentas de browser (navegar, clicar, digitar, screenshot, scroll, ler página, etc.)
3. Sistema de permissões granular (por site, por ação, modos ask/auto/skip)
4. Provider layer compatível com OpenAI-completions e Anthropic-messages
5. Integração com `~/.pi/agent/models.json` para auto-config
6. MCP bridge placeholder para futuro

## Non-Goals

- Não será publicado na Chrome Web Store (uso em dev mode)
- MCP completo (nesta versão) — apenas placeholder e interfaces
- Suporte a Firefox/Safari (foco exclusivo em Chrome)
- Features de colaboração em tempo real (cowork)
- Analytics/telemetria

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Manifest | MV3 | Mandatory for Chrome extensions |
| UI | React 19 + Vite 5 | Matches original Claude extension |
| Language | TypeScript 5.x | Type safety |
| State | chrome.storage.local | Native persistence |
| CSS | CSS Modules + Custom Properties | Scoped, themeable |
| LLM API | fetch() + SSE | Compatible with OpenAI & Anthropic |
| Content Scripts | Vanilla TS (bundled) | Zero deps for lightweight injection |
| Build | @crxjs/vite-plugin or vite-plugin-web-extension | MV3 bundling |

## Constraints

- Chrome 116+ (minimum)
- Service worker lifecycle (no persistent background page)
- Bundle < 2MB compressed
- Content scripts must run on any HTTP/HTTPS page
- API keys stored only in chrome.storage (encrypted at rest)
- No external CDN dependencies (all bundled)

## Project Structure

```
browserAgent/
├── extension/
│   ├── manifest.json
│   ├── config/
│   │   ├── models.custom.json
│   │   └── models.schema.json
│   ├── scripts/
│   │   └── sync-models.js
│   ├── public/
│   │   ├── icons/
│   │   ├── sidepanel.html
│   │   ├── options.html
│   │   └── offscreen.html
│   └── src/
│       ├── service-worker/
│       ├── content-scripts/
│       ├── sidepanel/
│       ├── options/
│       └── offscreen/
├── .specs/
├── .docs/
├── PRD.md
└── README.md
```
