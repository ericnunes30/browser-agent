# Feature: Site-level Permissions

**Feature ID:** `site-permissions`
**Prioridade:** 2
**Inspiração:** Claude in Chrome — i18n keys `DR5hG1vSxp` ("Allow actions on these sites"), `DcOPulvEDu` ("Skip all permissions across the internet?"), `ttaSfve/3w` ("Claude will only use the sites listed.")

---

## Descrição

Expandir o sistema de permissões atual (que só tem `PermissionMode` global) para suportar permissões por domínio, incluindo site blocking, domain transitions, allow/deny lists, e shield indicator visual.

---

## User Stories

### P1: Site Allow/Deny List ⭐ MVP

**Como** utilizador,
**Quero** permitir ou negar acesso a sites específicos
**Para** controlar onde o agente pode atuar.

**Critérios de Aceitação:**

1. WHEN o agente tenta atuar num domínio THEN o sistema SHALL verificar se o domínio está na allowlist/denylist
2. WHEN o domínio está na denylist THEN o agente SHALL ser bloqueado com mensagem "Blocked site: {domain}"
3. WHEN o domínio está na allowlist THEN o agente SHALL atuar sem pedir permissão (independentemente do `PermissionMode`)
4. WHEN o domínio não está em nenhuma lista THEN o comportamento SHALL seguir o `PermissionMode` global

### P1: Permission Prompt UI

**Critérios de Aceitação:**

1. WHEN o agente quer atuar num domínio não listado e o modo é `follow_a_plan` THEN o side panel SHALL mostrar um modal de permissão
2. O modal SHALL mostrar: nome do domínio, tool que vai ser usada, ação
3. O modal SHALL ter 3 botões: Allow, Allow once, Deny
4. WHEN o utilizador clica "Allow" THEN o domínio SHALL ser adicionado à allowlist permanentemente
5. WHEN o utilizador clica "Allow once" THEN a ação SHALL ser permitida apenas para essa chamada
6. WHEN o utilizador clica "Deny" THEN o domínio SHALL ser adicionado à denylist

### P2: Domain Transitions

**Critérios de Aceitação:**

1. WHEN o agente navega de um domínio A para um domínio B (via `navigate` tool) THEN SHALL verificar permissões para B
2. WHEN B não está na allowlist THEN o agente SHALL pausar e mostrar o modal de permissão
3. WHEN o utilizador nega permissão para B THEN o agente SHALL voltar ao domínio A

### P2: Allow for All Chats

**Critérios de Aceitação:**

1. WHEN o utilizador permite um domínio THEN SHALL ser perguntado: "Allow for this chat only or for all chats?"
2. "All chats" SHALL persistir em `chrome.storage.local`
3. "This chat only" SHALL ser válido apenas para a sessão atual

### P3: Shield Visual Indicator

**Critérios de Aceitação:**

1. WHEN o agente está a atuar numa página com restrições THEN SHALL mostrar um ícone de escudo no DOM da página
2. Ícone SHALL ser `lightshield.svg` em páginas claras, `darkshield.svg` em páginas escuras
3. O escudo SHALL ser injetado pelo `agent-indicator.ts` ou um novo content script

---

## Dados

### Estrutura de Armazenamento

```typescript
// chrome.storage.local
interface PermissionStore {
  'ba-permission-mode': 'follow_a_plan' | 'skip_all_permission_checks';
  'ba-site-permissions': {
    allowlist: string[];        // domínios permitidos
    denylist: string[];         // domínios bloqueados
    sessionAllow: string[];     // permitidos apenas na sessão atual
  };
  'ba-domain-permissions': Record<string, {  // domain → config
    allowed: boolean;
    allowForAllChats: boolean;
    lastAction: string;
    timestamp: number;
  }>;
}
```

---

## Dependências

| Dependência | Descrição |
|-------------|-----------|
| T8 (Permissions System) | ✅ Existe `PermissionMode` e `ba-permission-mode` |
| T5 (Tool Executor) | Tools chamam permission check antes de executar |
| T6 (Side Panel UI) | Modal de permissão no ChatInput/ChatWindow |
| T9 (Visual Indicators) | Shield indicator |

## Fora de Escopo (v1)

- Blocked URL patterns por organizações (managed storage)
- Password field filtering
- Prompt injection warnings
- `blocked.html` page
- Domain permission analytics
