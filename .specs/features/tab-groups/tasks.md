# Tasks: Tab Groups

**Feature ID:** `tab-groups`

---

## Dependências

- T5 (Tool Executor) — ✅ tools já existem, precisam de ser atualizadas

---

## T1: TabGroupManager Service

**Ficheiro:** `extension/src/service-worker/tab-group.ts` (criar)

**O quê:** Implementar `TabGroupManager` class com:
- `createGroup(name, firstUrl?)` — criar grupo com nome+cor, opcionalmente com primeira URL
- `openTab(url?)` — abrir nova aba no grupo atual
- `adoptTab(tabId)` — adotar aba órfã
- `adoptOrphans()` — adotar todas as abas órfãs da janela atual
- `getTabs()` — listar abas do grupo
- `getContext()` — formato compatível com `tabs_context` tool
- `closeGroup()` — fechar todas as abas e remover grupo

**Feito quando:** TabGroupManager criado, métodos implementados com chrome.tabs/chrome.tabGroups.

---

## T2: Atualizar tabs_context Tool

**Ficheiro:** `extension/src/service-worker/tools.ts`

**O quê:** Modificar `executeTabsContextTool()` para retornar tabs do grupo atual (se existir) em vez de todas as tabs da janela.

**Feito quando:** `tabs_context` retorna apenas as tabs do grupo da tarefa atual.

---

## T3: Atualizar tabs_create Tool

**Ficheiro:** `extension/src/service-worker/tools.ts`

**O quê:** Modificar `executeTabsCreateTool()` para adicionar automaticamente a nova aba ao grupo atual.

**Feito quando:** Nova aba criada via tool entra no grupo automaticamente.

---

## T4: Service Worker — Lifecycle

**Ficheiro:** `extension/src/service-worker/index.ts`

**O quê:** Integrar `TabGroupManager` no ciclo de vida:
- Criar instância no startup
- Fechar grupo quando `clearConversation` é chamado
- Garantir que grupo é limpo em caso de erro

**Feito quando:** Grupo é criado na primeira tool call que precisa, limpo ao limpar conversa.

---

## Ordem de Execução

```
T1 (TabGroupManager) ──→ T2 (tabs_context) ──→ T3 (tabs_create)
                                                    │
                          T4 (lifecycle) ────────────┘
```
