# Tasks: Site-level Permissions

**Feature ID:** `site-permissions`

---

## Dependências

- T8 (Permissions System base) — ✅ `PermissionMode` + `ba-permission-mode`
- T5 (Tool Executor) — ✅ precisa de integrar permission check
- T6 (Side Panel UI) — ✅ PermissionPrompt component
- T9 (Visual Indicators) — ✅ shield indicator

---

## T1: PermissionManager Service

**Ficheiro:** `extension/src/service-worker/permissions.ts` (criar)

**O quê:** Implementar `PermissionManager` class com:
- `check()` — verifica permissões para domínio+tool
- `allow()` / `deny()` — persistir decisões
- `clearSession()` — limpar permissões temporárias
- `getDomainState()` — estado atual de um domínio
- Carregar/guardar em `chrome.storage.local` (`ba-site-permissions`, `ba-domain-permissions`)

**Feito quando:** `PermissionManager` criado, métodos implementados, testes manuais com `chrome.storage.local` ok.

---

## T2: Integrar Permission Check no Tool Executor

**Ficheiro:** `extension/src/service-worker/tools.ts`

**O quê:** 
- Antes de cada execução de tool, verificar permissões via `PermissionManager.check()`
- Se `requiresPrompt`, enviar `permission:request` ao side panel e aguardar resposta
- Se bloqueado, retornar `ToolResult` com erro
- Registrar handler `permission:response` no `index.ts`

**Feito quando:** Tools verificam permissões antes de executar, domínios bloqueados retornam erro.

---

## T3: Permission Prompt UI

**Ficheiro:** `extension/src/side-panel/components/PermissionPrompt.tsx` (criar)

**O quê:** Componente React modal com:
- Botões: Allow, Allow once, Deny
- Checkbox "Allow for all chats"
- Mostrar domínio, tool name, ação detalhada
- Estados: hidden, requesting, approved, denied
- Animação de fade in/out

**Feito quando:** Modal aparece quando `permission:request` chega, botões funcionam, feedback visual de approved/denied.

---

## T4: ChatContext — pendingPermission State

**Ficheiro:** `extension/src/side-panel/ChatContext.tsx`

**O quê:** Adicionar:
- `pendingPermission` state (null | { domain, toolName, action, tabId })
- `respondPermission(domain, action, forAllChats?)` function
- Handler para mensagem `permission:request` do service worker
- Enviar `permission:response` de volta

**Feito quando:** ChatContext gere pedidos de permissão, respostas são enviadas ao service worker.

---

## T5: Domain Transition Guard

**Ficheiro:** `extension/src/service-worker/tools.ts` (dentro de `executeNavigateTool`)

**O quê:** Antes de navegar para novo domínio, verificar permissões. Se negado, não navegar e retornar erro.

**Feito quando:** Navegação entre domínios verifica permissões, domínios não permitidos são bloqueados.

---

## T6: Shield Visual Indicator

**Ficheiro:** `extension/src/content-scripts/agent-indicator.ts`

**O quê:** Quando o agente está ativo e a página atual tem restrições de permissão, mostrar ícone de escudo (shield) no canto superior direito. Usar SVG claro/escuro conforme o tema da página.

**Feito quando:** Shield aparece/desaparece conforme o estado de permissões.

---

## T7: Options Page — Site Permissions Manager

**Ficheiro:** `extension/src/options/App.tsx`

**O quê:** Adicionar secção "Site Permissions" com:
- Lista de domínios na allowlist (com botão "Remove")
- Lista de domínios na denylist (com botão "Remove")
- Campo para adicionar domínio manualmente
- Botão "Clear all permissions"

**Feito quando:** Utilizador pode ver/gerir permissões por site na options page.

---

## T8: i18n

**Ficheiros:** `extension/_locales/en/messages.json`, `pt_BR/messages.json`

| Chave | EN | PT |
|-------|----|-----|
| `perm_site_title` | Permission required | Permissão necessária |
| `perm_site_body` | The agent wants to {action} on | O agente quer {action} em |
| `perm_allow_all_chats` | Allow for all chats | Permitir em todos os chats |
| `perm_site_allowed` | ✓ Allowed | ✓ Permitido |
| `perm_site_denied` | ✗ Denied | ✗ Negado |
| `perm_blocked_site` | Blocked site: {domain} | Site bloqueado: {domain} |
| `options_site_permissions` | Site Permissions | Permissões de Sites |
| `options_allowlist` | Allowed sites | Sites permitidos |
| `options_denylist` | Blocked sites | Sites bloqueados |
| `options_add_domain` | Add domain | Adicionar domínio |
| `options_clear_permissions` | Clear all permissions | Limpar todas as permissões |

---

## Ordem de Execução

```
T1 (PermissionManager) ──→ T2 (tool executor check) ───→ T5 (domain transition)
                                                        │
                          T3 (prompt UI) ──→ T4 (ChatContext) ──┘
                                                        │
                          T6 (shield) ──────────────────┘

                          T7 (options) ─── (pode ser paralelo a T3/T4)

                          T8 (i18n) ─── (final, depois de todos)
```
