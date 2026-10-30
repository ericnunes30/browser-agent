# Design: Tab Groups

**Feature ID:** `tab-groups`

---

## 1. TabGroupManager

Novo ficheiro: `extension/src/service-worker/tab-group.ts`

### API

```typescript
interface TabGroupInfo {
  id: number;
  name?: string;
  color?: chrome.tabGroups.ColorEnum;
  tabs: chrome.tabs.Tab[];
}

class TabGroupManager {
  private currentGroupId: number | null = null;
  private groupName: string = '';

  /**
   * Create a new tab group with optional URL.
   * If url is provided, creates a tab first then groups it.
   */
  async createGroup(name: string, firstUrl?: string): Promise<TabGroupInfo>;

  /**
   * Open a new tab in the current group.
   */
  async openTab(url?: string): Promise<chrome.tabs.Tab>;

  /**
   * Adopt an orphan tab into the current group.
   */
  async adoptTab(tabId: number): Promise<void>;

  /**
   * Adopt all orphan tabs in current window.
   */
  async adoptOrphans(): Promise<void>;

  /**
   * Get all tabs in the current group.
   */
  async getTabs(): Promise<chrome.tabs.Tab[]>;

  /**
   * Get context info for all tabs (used by tabs_context tool).
   */
  async getContext(): Promise<TabInfo[]>;

  /**
   * Close all tabs in the group and remove the group.
   */
  async closeGroup(): Promise<void>;

  /**
   * Get the current group ID.
   */
  getGroupId(): number | null;
}
```

### Chrome API Usage

```typescript
// Create group from existing tabs
const groupId = await chrome.tabs.group({ tabIds: [tabId] });
await chrome.tabGroups.update(groupId, { title: 'My Task', color: 'blue' });

// Add tab to group
await chrome.tabs.group({ tabIds: [newTabId], groupId });

// Get tabs in group
const tabs = await chrome.tabs.query({ groupId: currentGroupId });

// Ungroup/remove
await chrome.tabs.ungroup(tabId);
```

---

## 2. Integração com Tools

### `tabs_context` — Expandir

Atualmente retorna apenas tabs da janela atual. Com `TabGroupManager`:

```typescript
async function executeTabsContextTool(): Promise<ToolResult> {
  const groupId = tabGroupManager.getGroupId();
  if (groupId) {
    const tabs = await tabGroupManager.getTabs();
    return { type: 'tool_result', content: JSON.stringify(tabs, null, 2) };
  }
  // fallback: all tabs in current window
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return { type: 'tool_result', content: JSON.stringify(tabs, null, 2) };
}
```

### `tabs_create` — Melhorar

Adicionar ao grupo atual automaticamente:

```typescript
async function executeTabsCreateTool(input): Promise<ToolResult> {
  const tab = await chrome.tabs.create({ url: input.url });
  // Auto-adopt into current group
  const groupId = tabGroupManager.getGroupId();
  if (groupId) {
    await chrome.tabs.group({ tabIds: [tab.id!], groupId });
  }
  return { type: 'tool_result', content: `Created tab ${tab.id}` };
}
```

---

## 3. Ciclo de Vida

```
Tarefa começa:
  TabGroupManager.createGroup("Research: X")
    → chrome.tabs.group() + chrome.tabGroups.update()
    → groupId guardado em memória

Tarefa decorre:
  Agente cria abas → entram no grupo automaticamente
  Agente adota abas órfãs existentes
  tools atuam em qualquer tab do grupo via tabId

Tarefa termina (user clica "Clear" ou nova conversa):
  TabGroupManager.closeGroup()
    → chrome.tabs.ungroup() ou chrome.tabs.remove()
    → groupId = null
```

---

## 4. Ficheiros a Modificar/Criar

| Ficheiro | Ação |
|----------|------|
| `extension/src/service-worker/tab-group.ts` | **Criar** — `TabGroupManager` |
| `extension/src/service-worker/tools.ts` | Modificar — `tabs_context` e `tabs_create` usam TabGroupManager |
| `extension/src/service-worker/index.ts` | Modificar — criar instância, lifecycle (init/cleanup em clearConversation) |
| `extension/src/service-worker/messages.ts` | Modificar — se necessário, handler para `tab:create` |
