# Análise Técnica para Replicação

> **Objetivo:** Criar um clone/open-source do "Claude in Chrome"
> **Modelo base:** Claude (Anthropic) — mas pode ser substituído por qualquer LLM

---

## 1. Stack Tecnológica Observada

### Frontend (Side Panel)
- **Framework:** React 19.2.4 (SPA com Vite — modulepreload hints)
- **Build:** Vite faz bundle inline do React (não é CDN/import separado)
- **JSX Transform:** React 19 com `jsx()`/`jsxs()` e símbolo `react.transitional.element`
- **Hooks:** Todos os hooks padrão (useState, useEffect, useCallback, useMemo, useRef, useReducer, useContext, useTransition, useDeferredValue, useId, useSyncExternalStore, useOptimistic, useActionState, useLayoutEffect, useInsertionEffect, useEffectEvent)
- **Componentes:** Suporte a class components (Component, PureComponent) e function components com hooks
- **CSS:** CSS modules + CSS custom properties (`data-theme="claude"`, `data-mode="dark|light"`)
- **Runtime:** Vite (identificado por `__vite__mapDeps`, `modulepreload`, `crossorigin`, hashes nos arquivos)
- **Scheduler:** React Scheduler incluso (`unstable_now`, `unstable_scheduleCallback`, fila de tarefas)
- **Tipografia:** Fontes Anthropic (AnthropicSans, AnthropicSerif, AnthropicMono)
- **Ícones:** SVGs inline + PNG para ícone

### Backend/Service Worker
- **Linguagem:** TypeScript (compilado)
- **Runtime:** Chrome Extension Service Worker (MV3)
- **Comunicação:** chrome.runtime.sendMessage, chrome.runtime.connectNative

### Infraestrutura
- **API:** api.anthropic.com (modelo Claude)
- **Bridge WebSocket:** wss://bridge.claudeusercontent.com
- **Analytics:** Segment.io, Sentry, Honeycomb, Datadog
- **CDN:** Chrome Web Store (update_url)

---

## 2. Componentes Essenciais para Replicar

### Módulo 1: Service Worker
```javascript
// Responsabilidades:
- Gerenciar side panel
- Gerenciar grupos de abas (TabGroupManager)
- Roteamento de mensagens
- Conexão com API LLM
- Native messaging host
- Permissões
- Tarefas agendadas
- Modificação de headers (DNR)
```

### Módulo 2: Content Scripts
```javascript
// 2.1 accessibility-tree.js
- Gerar árvore de acessibilidade do DOM
- Extrair texto, roles, estados
- Mapear elementos interativos
- Ocultar campos sensíveis (senhas)

// 2.2 agent-visual-indicator.js  
- Cursor fantasma do agente
- Indicadores de clique
- Animações CSS

// 2.3 content-script.ts (opcional)
- Integração com claude.ai
```

### Módulo 3: Side Panel UI
```javascript
// React SPA
- Chat interface com streaming
- Input de mensagens
- Model selector
- Área de artefatos
- Exibição de ferramentas
- Gerenciamento de permissões
- Indicadores de status
```

### Módulo 4: Sistema de Permissões
```javascript
// Modos:
- ask_before_acting (padrão)
- act_without_asking
- skip_permissions

// Site-level:
- approved_sites[]
- always_allow
- allow_once
```

### Módulo 5: Integração com API LLM
```javascript
// Provider agnóstico:
- Anthropic Claude API (original)
- Substituível por: OpenAI, Google Gemini, Ollama (local), etc.
- Streaming via SSE
- Tools/functions calling
```

---

## 3. Permissões Chrome Necessárias

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

*Obs: nativeMessaging e declarativeNetRequest são opcionais para versão inicial*

---

## 4. Estrutura de Projeto Sugerida

```
claude-in-chrome-clone/
├── manifest.json
├── src/
│   ├── service-worker/
│   │   ├── index.ts          # Entry point
│   │   ├── tab-group.ts      # TabGroupManager
│   │   ├── permissions.ts    # PermissionManager
│   │   ├── native-host.ts    # Native messaging
│   │   ├── scheduled-tasks.ts
│   │   └── llm-provider.ts   # API LLM (abstração)
│   ├── content-scripts/
│   │   ├── accessibility-tree.ts
│   │   └── agent-indicator.ts
│   ├── sidepanel/
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   └── styles/
│   ├── options/
│   │   └── Options.tsx
│   └── offscreen/
│       ├── audio.ts
│       └── gif-generator.ts
├── public/
│   ├── icons/
│   ├── sidepanel.html
│   ├── options.html
│   ├── pairing.html
│   └── offscreen.html
├── i18n/
│   ├── en-US.json
│   └── pt-BR.json
├── vite.config.ts
├── package.json
└── tsconfig.json
```

---

## 5. Desafios Técnicos

### Alto
| Desafio | Descrição |
|---------|-----------|
| **Árvore de Acessibilidade** | Extrair e serializar o DOM de forma eficiente para o LLM entender |
| **Sistema de Tools** | Definir, executar e reportar resultados das ferramentas |
| **Streaming de Respostas** | UI responsiva durante geração do modelo |
| **Gerenciamento de Abas** | Grupos de abas, foco, navegação entre janelas |

### Médio
| Desafio | Descrição |
|---------|-----------|
| **Sistema de Permissões** | UI de permissões por site, modos de confiança |
| **CDP (Chrome DevTools Protocol)** | Screenshots, debugging |
| **Native Messaging** | Integração com app desktop |
| **GIF Recording** | Gravar e exportar workflows |

### Baixo
| Desafio | Descrição |
|---------|-----------|
| **Indicadores Visuais** | Cursor fantasma, animações |
| **Tarefas Agendadas** | chrome.alarms API |
| **Notificações** | chrome.notifications API |
| **i18n** | Internacionalização |

---

## 6. APIs Chrome Utilizadas (para estudo)

| API | Uso |
|-----|-----|
| `chrome.sidePanel` | Painel lateral |
| `chrome.runtime.sendMessage` | Comunicação interna |
| `chrome.runtime.connectNative` | Native messaging |
| `chrome.debugger` | CDP para screenshots |
| `chrome.scripting` | Injeção de scripts |
| `chrome.tabGroups` | Grupos de abas |
| `chrome.tabs` | Gerenciamento de abas |
| `chrome.webNavigation` | Rastrear navegação |
| `chrome.declarativeNetRequest` | Modificar headers |
| `chrome.alarms` | Tarefas agendadas |
| `chrome.storage` | Armazenamento |
| `chrome.notifications` | Notificações |
| `chrome.offscreen` | Documento oculto |
| `chrome.permissions` | Permissões runtime |
| `chrome.identity` | OAuth |
| `chrome.commands` | Atalhos teclado |
| `chrome.downloads` | Download de arquivos |

---

## 7. Próximos Passos para Replicação

1. **Criar scaffold da extensão** (manifest.json, estrutura de pastas)
2. **Implementar service worker** básico (side panel, mensagens)
3. **Criar content script de acessibilidade** (gerar árvore do DOM)
4. **Construir side panel UI** (chat interface)
5. **Conectar com LLM provider** (API de modelo de IA)
6. **Implementar tools** (click, type, screenshot, scroll)
7. **Sistema de permissões** (modos de confiança)
8. **Tarefas agendadas e notificações**
9. **Indicadores visuais** (cursor fantasma)
10. **Geração de GIFs e exportação**
