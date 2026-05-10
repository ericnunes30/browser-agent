# Feature: Tab Groups

**Feature ID:** `tab-groups`
**Prioridade:** 3

---

## Descrição

Implementar gestão de grupos de abas no service worker (`TabGroupManager`) e expandir as tools `tabs_context` / `tabs_create` para suportar multi-tab tasks — onde o agente pode trabalhar em várias abas simultaneamente, organizadas em grupos.

---

## User Stories

### P1: TabGroupManager ⭐ MVP

**Como** o agente,
**Quero** criar e gerir grupos de abas
**Para** organizar tarefas multi-página.

**Critérios de Aceitação:**

1. WHEN o agente quer começar uma tarefa multi-tab THEN SHALL criar um novo grupo de abas via `chrome.tabGroups`
2. WHEN uma aba é criada dentro de um grupo THEN SHALL ser adicionada automaticamente ao grupo
3. WHEN o agente termina uma tarefa THEN SHALL fechar o grupo e todas as abas do grupo
4. WHEN o agente consulta `tabs_context` THEN SHALL retornar todas as abas do grupo atual

### P1: Multi-tab Tools

**Critérios de Aceitação:**

1. WHEN o agente chama `tabs_create` com ou sem URL THEN SHALL criar nova aba no grupo atual
2. WHEN o agente chama `tabs_context` THEN SHALL retornar lista detalhada (id, url, title, active, groupId, favIconUrl)
3. WHEN o agente precisa atuar numa aba específica THEN SHALL poder especificar `tabId` nos inputs das tools

### P2: Adoção de Abas Órfãs

**Critérios de Aceitação:**

1. WHEN há abas órfãs (sem grupo) na janela atual THEN o `TabGroupManager` SHALL poder adotá-las
2. WHEN o utilizador abre uma nova aba manualmente durante uma tarefa THEN a aba SHALL ser adoptada se estiver no mesmo contexto

### P2: Tab Group Naming e Colours

**Critérios de Aceitação:**

1. WHEN o grupo é criado THEN SHALL ter nome descritivo (ex: "Research: climate change")
2. WHEN o grupo é criado THEN SHALL ter cor (`chrome.tabGroups.update` com `color`)
3. WHEN a tarefa termina THEN o grupo SHALL ser removido

---

## Dependências

| Dependência | Descrição |
|-------------|-----------|
| T2 (Service Worker) | ✅ Existe, mensagens roteadas |
| Manifest permissions | ✅ `tabGroups`, `tabs` já no manifest |

---

## Estrutura

```
┌─────────────────────┐
│  TabGroupManager    │
│  (tab-group.ts)     │
│                     │
│  • createGroup()    │── chrome.tabGroups + chrome.tabs
│  • adoptTab()       │
│  • closeGroup()     │
│  • getTabs()        │
│  • getGroupTabs()   │
│  • currentGroupId   │
└─────────────────────┘
```

## Fora de Escopo (v1)

- Tab group persistence entre sessões
- Múltiplos grupos simultâneos
- Reordenação visual de abas
- Tab group collapse visual
