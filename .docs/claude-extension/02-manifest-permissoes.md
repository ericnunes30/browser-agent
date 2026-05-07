# Manifest.json — Permissões e Configuração

```json
{
  "manifest_version": 3,
  "name": "Claude",
  "version": "1.0.70",
  "description": "Claude in Chrome (Beta)",
  "minimum_chrome_version": "116",
  "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjU1XnLPoasGVmZU42K3h6S+sQhkogfcoLPbIcrWH5Oo8QoInBIugkew/7cWaEFySyQrkaEBe1fjeS/rlAqd3r778dKcTvDZcXmj0VVX0Fi1i8tnkarurceGKGdVxfkL7e30nwfgwoPxj3H8OQbsbxFcBWGVtcFekmdpiyaxwz6o4yXIWColfAxh9K2yToOZkoAS5GvgGvTexiCh1gYy++eFdk6C61mcFsyDdoGQtduhGEaX0zZ9uAW1jX4JTPmHV3kEFrZu/WVBl7Obw+Jk/osoHMdmghVNy6SCB8/6mcgmxkP9buPrNUZgYP6n0x5dqEJ2Ecww/lb1Zd4nQf4XGOwIDAQAB",
  "update_url": "https://clients2.google.com/service/update2/crx"
}
```

---

## Permissões

### host_permissions
```json
["<all_urls>"]
```
Acesso a **todos os URLs** — necessário para o Claude poder navegar e interagir com qualquer site.

### Permissões (permissions)

| Permissão | Motivo |
|-----------|--------|
| `sidePanel` | Abrir o painel lateral do Claude |
| `storage` | Salvar configurações, conversas, atalhos |
| `activeTab` | Acessar aba ativa |
| `scripting` | Injetar scripts nas páginas |
| `debugger` | Protocolo Chrome DevTools (CDP) para screenshots, árvore de acessibilidade |
| `tabGroups` | Gerenciar grupos de abas (Claude gerencia grupos) |
| `tabs` | Acessar informações de todas as abas |
| `alarms` | Agendar tarefas recorrentes |
| `notifications` | Notificar quando tarefas terminam |
| `webNavigation` | Rastrear navegação entre páginas |
| `declarativeNetRequestWithHostAccess` | Modificar headers HTTP (User-Agent, etc.) |
| `offscreen` | Reproduzir áudio e gerar GIFs em documento oculto |
| `nativeMessaging` | Comunicação com apps desktop |
| `unlimitedStorage` | Armazenar muitas conversas/screenshots |
| `downloads` | Baixar arquivos |
| `identity` | Autenticação OAuth |

---

## Content Scripts

```json
[
  {
    "js": ["assets/content-script.ts-Bwa5rY9t.js"],
    "matches": ["https://claude.ai/*", "https://*.claude.ai/*"],
    "run_at": "document_end"
  },
  {
    "all_frames": true,
    "js": ["assets/accessibility-tree.js-DxrE0N5Q.js"],
    "matches": ["<all_urls>"],
    "run_at": "document_start"
  },
  {
    "all_frames": false,
    "js": ["assets/agent-visual-indicator.js-CQ3yeUso.js"],
    "matches": ["<all_urls>"],
    "run_at": "document_idle"
  }
]
```

### 1. content-script.ts (claude.ai)
- **Tamanho:** Pequeno, função única
- **O que faz:** Adiciona listener de clique no botão `#claude-onboarding-button`
- Quando clicado, envia mensagem `open_side_panel` com o prompt da tarefa de onboarding

### 2. accessibility-tree.js (todas as páginas, todos os frames)
- **Tamanho:** Médio/Grande
- **O que faz:** Gera a **árvore de acessibilidade** do DOM
- Injeta `window.__claudeElementMap` e `window.__generateAccessibilityTree()`
- Mapeia elementos DOM para roles ARIA, extrai texto, labels, valores
- **Essencial para o Claude "enxergar" a página** — ele usa a árvore de acessibilidade em vez de (ou além de) screenshots
- Filtra campos de senha e autocomplete sensíveis

### 3. agent-visual-indicator.js (todas as páginas)
- **Tamanho:** Médio
- **O que faz:** Mostra indicadores visuais da ação do Claude
- Cursor fantasma (`#claude-phantom-cursor`) que se move na tela
- Estilo laranja (`#D97757`) do Claude
- Transições CSS suaves de 180ms
- Animações de clique e seleção

---

## Web Accessible Resources

```json
[
  {
    "matches": ["https://claude.ai/*"],
    "resources": ["assets/content-script.ts-Bwa5rY9t.js"]
  },
  {
    "matches": ["<all_urls>"],
    "resources": [
      "assets/accessibility-tree.js-DxrE0N5Q.js",
      "assets/agent-visual-indicator.js-CQ3yeUso.js"
    ]
  }
]
```

---

## Comandos de Teclado

```json
{
  "toggle-side-panel": {
    "description": "Toggle Claude side panel",
    "suggested_key": {
      "default": "Ctrl+E",
      "mac": "Command+E"
    }
  }
}
```

---

## Política de Segurança (CSP)

```
script-src 'self'
object-src 'self'
connect-src:
  - 'self'
  - https://api.anthropic.com
  - wss://api.anthropic.com
  - https://claude.ai
  - https://platform.claude.com
  - https://api.segment.io
  - https://*.segment.com
  - https://*.ingest.us.sentry.io
  - https://api.honeycomb.io
  - https://browser-intake-us5-datadoghq.com
  - wss://bridge.claudeusercontent.com
  - wss://bridge-staging.claudeusercontent.com
style-src 'self' 'unsafe-inline'
img-src 'self' data: https:
font-src 'self' data:
```

---

## Gerenciamento por Política (managed_schema.json)

```json
{
  "blockedUrlPatterns": {
    "description": "URL patterns onde Claude é bloqueado. Ex: 'github.com/myorg/*'"
  },
  "forceLoginOrgUUID": {
    "description": "Restringe organizações Anthropic que podem usar a extensão"
  }
}
```
