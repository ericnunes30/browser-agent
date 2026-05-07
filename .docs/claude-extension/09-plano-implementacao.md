# Plano de Implementação — Clone do Claude em Chrome

## Decisões Arquiteturais

### 1. Model Provider: Multi-Modelo via pi/agent/models.json

**Decisão:** A extensão não terá um sistema complexo de providers.
Ela simplesmente lê do formato usado pelo `pi/agent/models.json`.

**Dois modos de carregamento:**

| Modo | Arquivo | Descrição |
|------|---------|-----------|
| **Custom** | `config/models.custom.json` | Config manual dentro da extensão, editado pelo usuário |
| **Auto-pull** | `~/.pi/agent/models.json` | Sincronizado automaticamente via script `sync-models.js` |

**Formato suportado:** O mesmo do `pi/agent/models.json`:
```json
{
  "providers": {
    "meu-provider": {
      "baseUrl": "https://...",
      "api": "openai-completions",   // ou "anthropic-messages"
      "apiKey": "sk-...",
      "authHeader": true,
      "models": [
        {
          "id": "model-id",
          "name": "Model Name",
          "reasoning": true,
          "input": ["text"]
        }
      ]
    }
  }
}
```

**Fluxo:**
1. `sync-models.js` lê `~/.pi/agent/models.json`
2. Faz merge com `config/models.custom.json`
3. Escreve em `chrome.storage.local` (durante setup)
4. Service Worker carrega de `chrome.storage.local` no runtime
5. Options Page permite editar, importar, re-sync

**APIs suportadas:**
- `openai-completions` → OpenAI, OpenRouter, Ollama, etc.
- `anthropic-messages` → Anthropic Claude, etc.

---

### 2. MCP Bridge: Deixado para Futuro

**Decisão:** A extensão terá um placeholder para MCP, mas sem implementação ativa.

O que será feito:
- Estrutura de pastas preparada (`src/service-worker/mcp/`)
- Interfaces/types definidos
- Nenhuma lógica de conexão (nem native messaging, nem bridge)
- Fácil de adicionar depois

---

### 3. Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| **Framework UI** | React 19 (como o original) |
| **Build** | Vite 5 |
| **Linguagem** | TypeScript |
| **CSS** | CSS Modules + CSS custom properties |
| **Ícones** | SVGs + PNG |
| **Manifest** | MV3 (Manifest V3) |
| **Chrome min** | Chrome 116+ |
| **State** | chrome.storage.local |

---

### 4. Estrutura de Pastas

```
browserAgent/
├── extension/                         ← Extensão Chrome
│   ├── manifest.json
│   ├── config/
│   │   ├── models.custom.json         ← Config custom de modelos
│   │   └── models.schema.json         ← Schema para validação
│   ├── scripts/
│   │   └── sync-models.js             ← Auto-pull do ~/.pi/agent/models.json
│   ├── public/
│   │   ├── icons/                     ← Ícones da extensão
│   │   ├── sidepanel.html
│   │   ├── options.html
│   │   ├── pairing.html (placeholder)
│   │   └── offscreen.html
│   └── src/
│       ├── service-worker/
│       │   ├── index.ts               ← Entry point
│       │   ├── messages.ts            ← Roteador de mensagens
│       │   ├── tab-group.ts           ← TabGroupManager
│       │   ├── permissions.ts         ← PermissionManager
│       │   ├── tool-executor.ts       ← Execução de ferramentas
│       │   ├── screenshot.ts          ← Captura de tela
│       │   ├── scheduled-tasks.ts     ← Tarefas agendadas
│       │   ├── mcp/
│       │   │   ├── index.ts           ← MCP placeholder (futuro)
│       │   │   └── types.ts           ← Tipos MCP
│       │   └── providers/
│       │       ├── index.ts           ← Factory
│       │       ├── models-loader.ts   ← Carrega modelos do storage
│       │       ├── openai.ts          ← Provider OpenAI-compat
│       │       └── anthropic.ts       ← Provider Anthropic-compat
│       ├── content-scripts/
│       │   ├── accessibility-tree.ts  ← Árvore de acessibilidade
│       │   └── agent-indicator.ts     ← Cursor fantasma
│       ├── sidepanel/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   ├── components/
│       │   │   ├── Chat.tsx
│       │   │   ├── Message.tsx
│       │   │   ├── ModelSelector.tsx
│       │   │   ├── ToolDisplay.tsx
│       │   │   └── PermissionPrompt.tsx
│       │   ├── hooks/
│       │   │   ├── useChat.ts
│       │   │   └── useModels.ts
│       │   └── styles/
│       │       └── chat.css
│       ├── options/
│       │   ├── App.tsx
│       │   ├── ModelsConfig.tsx       ← Configuração de modelos
│       │   └── General.tsx            ← Configurações gerais
│       └── offscreen/
│           ├── audio.ts
│           └── gif-generator.ts
├── .docs/
│   └── claude-extension/              ← Documentação da engenharia reversa
│       ├── 01-visao-geral.md
│       ├── 02-manifest-permissoes.md
│       ├── 03-arquitetura.md
│       ├── 04-capacidades-features.md
│       ├── 05-fluxo-comunicacao.md
│       ├── 06-analise-tecnica-para-replicacao.md
│       ├── 07-i18n-strings-uteis.md
│       ├── 08-mcp-architecture.md
│       └── 09-plano-implementacao.md  ← Este arquivo
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

### 5. Ordem de Implementação

| Etapa | O quê | Depende de |
|-------|-------|------------|
| **T1** | Scaffold: manifest.json, build (Vite+TS), package.json | — |
| **T2** | Service Worker: entry, messages, side panel lifecycle | T1 |
| **T3** | Provider Layer: models-loader, factory, openai.ts, anthropic.ts | T2 |
| **T4** | Content Scripts: accessibility-tree.ts, agent-indicator.ts | T1 |
| **T5** | Tool Executor: click, type, screenshot, scroll, read_page | T2 |
| **T6** | Side Panel UI: React chat, model selector, tool display | T3 |
| **T7** | Options Page: config de modelos, import/export | T3 |
| **T8** | Permissions System: modos (ask/auto/skip), site-level | T5 |
| **T9** | Indicadores Visuais: cursor fantasma, animações | T4 |
| **T10** | Offscreen Document: áudio, GIF generation | T2 |
| **T11** | Scheduled Tasks: chrome.alarms, UI de agendamento | T6 |
| **T12** | MCP Bridge: placeholder/types (futuro) | T2 |
| **T13** | i18n: suporte a pt-BR, en-US | T6 |
| **T14** | sync-models.js: script de auto-pull do pi | T3 |

---

### 6. Ferramentas do Browser (Tool Executor)

As seguintes ferramentas serão implementadas para o modelo usar:

| Ferramenta | Implementação | API Chrome |
|------------|--------------|------------|
| `navigate` | Ir para URL | `chrome.tabs.update` |
| `click` | Clicar em elemento | `chrome.scripting.executeScript` + CDP |
| `type` | Digitar texto | `chrome.scripting.executeScript` |
| `scroll` | Rolar página | `chrome.scripting.executeScript` |
| `screenshot` | Capturar tela | `chrome.debugger` + `Page.captureScreenshot` |
| `read_page` | Extrair texto | `chrome.scripting` + innerText |
| `read_page_interactive` | Ler com acessibilidade | accessibility-tree.ts |
| `execute_javascript` | Executar JS | `chrome.scripting.executeScript` |
| `read_console` | Ler console | `chrome.debugger` + `Console.messageAdded` |
| `read_network` | Ler rede | `chrome.debugger` + `Network.requestWillBeSent` |
| `find_element` | Encontrar elemento | accessibility-tree.ts |
| `set_form_value` | Definir valor | `chrome.scripting.executeScript` |
| `hover` | Hover | `chrome.scripting.executeScript` |
| `wait` | Aguardar | Promise + setTimeout |
| `press_key` | Tecla | `chrome.debugger` + `Input.dispatchKeyEvent` |
| `web_search` | Pesquisar | API de busca (configurável) |
| `web_fetch` | Fetch URL | `fetch()` do service worker |
| `download` | Baixar arquivo | `chrome.downloads.download` |

---

### 7. Permissões Chrome (manifest.json)

```json
{
  "permissions": [
    "sidePanel",
    "storage",
    "activeTab",
    "scripting",
    "debugger",
    "tabGroups",
    "tabs",
    "alarms",
    "notifications",
    "webNavigation",
    "offscreen",
    "unlimitedStorage",
    "downloads"
  ],
  "host_permissions": ["<all_urls>"]
}
```

*Nota: `nativeMessaging` e `declarativeNetRequest` serão adicionados apenas quando o MCP for implementado.*

---

### 8. Próximo Passo

Começar pela **Etapa T1**: Scaffold da extensão.
- Configurar Vite + TypeScript + React 19
- Criar manifest.json
- Estrutura de pastas
- Build script funcional (gera pasta dist/ com a extensão)
