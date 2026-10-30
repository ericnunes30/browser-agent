# Design: Site-level Permissions

**Feature ID:** `site-permissions`

---

## Visão Geral da Arquitetura

```
┌──────────────────────┐
│   Tool Executor      │
│   (tools.ts)         │
│                      │──── PermissionManager.check() ──▶┐
│   Antes de executar  │                                  │
│   qualquer tool,     │◀── result { allow, deny, prompt } │
│   chama permission   │                                  │
│   manager            │                                  │
└──────────────────────┘                                  │
                                                          ▼
                                               ┌──────────────────┐
                                               │ PermissionManager│
                                               │ (permissions.ts) │
                                               │                  │
                                               │ • check(domain,  │
                                               │   toolName)      │
                                               │ • allow(domain)  │
                                               │ • deny(domain)   │
                                               │ • clear()        │
                                               └──────────────────┘
                                                          │
                                                          ▼
                                               ┌──────────────────┐
                                               │ chrome.storage   │
                                               │ .local           │
                                               │ ba-site-         │
                                               │ permissions      │
                                               │ ba-domain-       │
                                               │ permissions      │
                                               └──────────────────┘
```

---

## 1. PermissionManager

Novo ficheiro: `extension/src/service-worker/permissions.ts` (substitui/expande o existente)

### API

```typescript
class PermissionManager {
  /**
   * Check if a tool is allowed on a given domain.
   * Returns { allowed, reason, requiresPrompt }
   */
  async check(params: {
    domain: string;
    toolName: string;
    tabId: number;
  }): Promise<PermissionCheckResult>;

  /**
   * User allowed a domain (for current session or all chats).
   */
  async allow(domain: string, forAllChats: boolean): Promise<void>;

  /**
   * User denied a domain.
   */
  async deny(domain: string): Promise<void>;

  /**
   * Clear session-only permissions.
   */
  async clearSession(): Promise<void>;

  /**
   * Get current permission state for a domain.
   */
  async getDomainState(domain: string): Promise<DomainPermissionState>;
}

interface PermissionCheckResult {
  allowed: boolean;        // true = pode executar, false = bloqueado
  requiresPrompt: boolean; // true = mostrar modal ao utilizador
  reason?: string;         // "blocked", "not_listed", "allowed"
  details?: {
    mode: PermissionMode;
    inAllowlist: boolean;
    inDenylist: boolean;
  };
}

interface DomainPermissionState {
  allowed: boolean;
  allowForAllChats: boolean;
  lastAction: string;
  timestamp: number;
}
```

---

## 2. Fluxo de Execução

### Passo a passo

1. `executeTool()` recebe chamada com `tabId` e `domain`
2. Antes de executar, chama `PermissionManager.check({ domain, toolName, tabId })`
3. Se `allowed === true` → executa tool normalmente
4. Se `requiresPrompt === true` → envia mensagem ao side panel:
   ```typescript
   chrome.runtime.sendMessage({
     type: 'permission:request',
     domain: 'example.com',
     toolName: 'computer',
     action: 'left_click at (100, 200)',
   });
   ```
5. Side panel mostra modal → utilizador escolhe Allow / Allow once / Deny
6. Utilizador responde → `chrome.runtime.sendMessage({ type: 'permission:response', domain, action: 'allow' })`
7. Service worker atualiza `PermissionManager` e executa (ou não) a tool

### Integração com Tool Executor

Em `executeTool()` em `tools.ts`, adicionar:

```typescript
export async function executeTool(name, input, tabId): Promise<ToolResult> {
  // Get domain from tab
  const domain = await getDomainFromTab(tabId);

  // Check permissions (unless skip_all_permission_checks)
  const permMode = (await chrome.storage.local.get('ba-permission-mode'))['ba-permission-mode'];
  if (permMode !== 'skip_all_permission_checks') {
    const permCheck = await permissionManager.check({ domain, toolName: name, tabId });
    if (!permCheck.allowed) {
      if (permCheck.requiresPrompt) {
        // Send permission request to side panel
        const response = await requestUserPermission(domain, name);
        if (!response.allowed) {
          return { type: 'tool_result', content: `Permission denied for ${domain}`, error: 'Permission denied' };
        }
      } else {
        return { type: 'tool_result', content: `Blocked site: ${domain}`, error: 'Site blocked' };
      }
    }
  }

  // ... existing tool execution logic ...
}
```

---

## 3. Permission Prompt UI

Novo componente: `extension/src/side-panel/components/PermissionPrompt.tsx`

### Estados

| Estado | Descrição |
|--------|-----------|
| `hidden` | Não visível |
| `requesting` | A pedir permissão (mostra domínio + tool + ação) |
| `approved` | Confirmado (mostra "✓ Allowed" por 2s) |
| `denied` | Negado (mostra "✗ Denied" por 2s) |

### Layout

```
┌─────────────────────────────────────────┐
│  🔒 Permission required                  │
│                                         │
│  The agent wants to:                    │
│  left_click at (100, 200)               │
│                                         │
│  on: example.com                        │
│                                         │
│  ┌────────────┐  ┌──────────┐  ┌─────┐ │
│  │  Allow      │  │Allow once│  │Deny │ │
│  └────────────┘  └──────────┘  └─────┘ │
│                                         │
│  □ Allow for all chats                  │
└─────────────────────────────────────────┘
```

---

## 4. Guarda de Transição entre Domínios

No `navigate` tool, antes de atualizar a tab:

```typescript
async function executeNavigateTool(input): Promise<ToolResult> {
  const currentDomain = await getDomainFromTab(input.tabId);
  const targetDomain = extractDomain(input.url);

  if (currentDomain !== targetDomain) {
    const permCheck = await permissionManager.check({ domain: targetDomain, toolName: 'navigate', tabId: input.tabId });
    if (permCheck.requiresPrompt) {
      const response = await requestUserPermission(targetDomain, 'navigate');
      if (!response.allowed) {
        return {
          type: 'tool_result',
          content: `Navigation to ${targetDomain} was not allowed by user. Staying on current page.`,
          error: 'Permission denied for domain transition',
        };
      }
    }
  }

  // proceed with navigation
}
```

---

## 5. Shield Visual Indicator

Injetado pelo `agent-indicator.ts` quando o agente está ativo e a página tem restrições.

```typescript
// In agent-indicator.ts
function showShield(domain: string) {
  const shield = document.createElement('div');
  shield.id = 'ba-shield-indicator';
  shield.innerHTML = `<svg>...</svg>`; // lightshield ou darkshift
  shield.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;...';
  document.body.appendChild(shield);
}
```

---

## 6. Ficheiros a Modificar/Criar

| Ficheiro | Ação |
|----------|------|
| `extension/src/service-worker/permissions.ts` | **Criar** — `PermissionManager` class |
| `extension/src/service-worker/tools.ts` | Modificar — integrar permission check |
| `extension/src/service-worker/index.ts` | Modificar — handler para `permission:request`/`permission:response` |
| `extension/src/side-panel/ChatContext.tsx` | Modificar — adicionar `pendingPermission` state |
| `extension/src/side-panel/components/PermissionPrompt.tsx` | **Criar** — UI de permissão |
| `extension/src/side-panel/App.tsx` | Modificar — renderizar PermissionPrompt |
| `extension/src/content-scripts/agent-indicator.ts` | Modificar — shield indicator |
| `extension/_locales/*/messages.json` | Novas chaves i18n |
