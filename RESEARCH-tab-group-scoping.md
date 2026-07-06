# Research: Tab Group Scoping + openTab Bug

> Findings from research session — both issues are recorded here for future implementation.

---

## Bug 1: `openTab` creates new tab outside the tab group

### Symptom
`tabGroupManager.openTab(url)` creates a new tab that ends up **outside** the agent's tab group, even though the code calls `chrome.tabs.group({ ..., groupId: this.currentGroupId })` immediately after.

### Root cause
1. `chrome.tabs.create({ url })` is called **without `windowId`**, so the new tab is created in the **currently focused window** (which may be a different window from the one the group lives in).
2. **Tab groups in Chrome are window-scoped.** A `groupId` is tied to the `windowId` where it was created. `chrome.tabs.group({ tabIds, groupId })` **silently fails** if the tab is in a different window from the group.
3. The user has 2+ windows open (e.g. one with the agent's tab group, one where they're browsing). The "currently focused" window is the user's browsing window → new tab is created there → group move fails silently.

### Why Chrome behaves this way
- `chrome.tabs.create` accepts only: `index`, `openerTabId`, `url`, `pinned`, `windowId`, `active`, `selected`. **No `groupId` parameter.**
- `chrome.tabs.group` accepts only: `tabIds` and `groupId`. **No `url` parameter.**
- **Conclusion: there is no single API call to create a tab already inside a group.** It is always 2 steps: create, then group.

### Recommended fix (defense in depth)

```ts
async openTab(url?: string): Promise<chrome.tabs.Tab> {
  // 1. Discover the window that owns the group (persists across SW restarts via storage.session)
  const windowId = this.currentWindowId ?? await this.resolveGroupWindowId();

  // 2. Create the tab in the CORRECT window (where the group lives)
  const tab = await chrome.tabs.create({
    url,
    windowId,        // ← guarantees the tab is born in the right window
    active: false,   // ← don't steal the user's focus
  });

  // 3. Add to the group (always succeeds when same window)
  if (this.currentGroupId !== null) {
    try {
      await chrome.tabs.group({
        tabIds: [tab.id!],
        groupId: this.currentGroupId,
      });
    } catch (err) {
      console.warn('[TabGroup] group() failed, attempting recovery:', err);
    }
  }

  return tab;
}

private async resolveGroupWindowId(): Promise<number | undefined> {
  if (!this.currentGroupId) return undefined;
  try {
    const group = await chrome.tabGroups.get(this.currentGroupId);
    return group.windowId;
  } catch {
    return undefined; // fallback: use the currently focused window
  }
}
```

### Key points
- **`windowId` in `chrome.tabs.create`** is the primary fix — guarantees the tab is born in the right window.
- **`active: false`** — the user keeps browsing whatever they were doing; the new tab doesn't steal focus.
- **`chrome.tabGroups.get(groupId)`** — recovers the windowId if the SW was restarted and in-memory state was lost.
- **`chrome.tabs.group` in the same window** is 100% reliable; the previous silent failure is gone.
- Persist `currentGroupId` and `currentWindowId` to `chrome.storage.session` so they survive SW restarts.

---

## Bug 2 (related): Agent can interact with tabs outside the tab group

### Symptom
When the user has the side panel open and starts a task, the LLM can call tools against **any tab** in the browser (including the user's main browsing tabs), not just the agent's tab group. This breaks the user's flow because the agent clicks/types in tabs the user is actively using.

### Desired behavior
The agent should **only** interact with tabs inside the agent's tab group. The user can:
- Keep their main browsing tabs untouched
- Watch the agent work in a dedicated, colored tab group
- Use other browser tabs freely while the agent runs

### Approaches considered

| # | Approach | UX | Difficulty | Reliability | Disruption |
|---|---|---|---|---|---|
| A | **Tab Group hard validation** in tool dispatchers | 4 | 2 (easy) | 5 | 4 |
| B | Side Panel / Offscreen Document isolation | 2 | 4 (hard) | 2 | 2 |
| C | **Separate window** via `chrome.windows.create` | 3 | 3 | 5 | 5 |
| D | "Owned tab set" whitelist | 3 | 2 (easy) | 3 | 3 |
| E | System-prompt engineering + `getContext()` filter | 3 | 1 (easiest) | 2 | 3 |
| F | Pinned-tab pattern | 2 | 1 | 2 | 2 |
| **G** | **A + E combined (recommended)** | **5** | **2** | **5** | **5** |
| H | `chrome.scripting`/`chrome.tabs.update` server-side filter | 4 | 2 | 4 | 4 |

### Approach G — recommended

Combine a hard `assertTabInGroup(tabId)` check in every tool dispatcher (A) with prompt-side filtering of `tabs_context` (E).

#### Step 1: `tab-group-guard.ts` (new)

```ts
import { tabGroupManager } from './tab-group';

export async function assertTabInGroup(
  tabId: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const gid = tabGroupManager.getGroupId();
  if (gid === null) return { ok: true }; // no group mode → no constraint
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return { ok: false, reason: `Tab ${tabId} no longer exists.` };
  if (tab.groupId !== gid) {
    return {
      ok: false,
      reason:
        `Refused: tab ${tabId} ("${tab.title || tab.url}") is not in the agent's tab group. ` +
        `Call tabs_context to see allowed tabIds, or open a new tab via open_tab.`,
    };
  }
  return { ok: true };
}
```

#### Step 2: Call the guard at the top of every tool dispatcher

Place it as the **first line** (after destructuring `{ action, tabId }`) in:
- `executeComputerTool` (around `tools.ts:660`)
- `executeNavigateTool` (around `tools.ts:1013`)
- `executeSnapshotTool` (around `tools.ts:950`)
- `executeJavascriptTool` (around `tools.ts:1620`)
- `executeConsoleTool`, `executeResizeTool`, `executeFileUploadTool`

```ts
const guard = await assertTabInGroup(tabId);
if (!guard.ok) {
  return { type: 'tool_result', content: guard.reason, error: 'TAB_NOT_IN_GROUP' };
}
```

#### Step 3: `getContext()` should only return group tabs

In `tab-group.ts:104` (`getContext()`), **delete the "all tabs" fallback** when a group exists. Add an optional `includeAllTabs: boolean` parameter for an advanced-mode toggle.

#### Step 4: Update the system prompt

Inject into the agent's system prompt: *"You may only act on tabIds returned by `tabs_context` — those are the tabs inside the agent's group. Tool calls with other tabIds will be rejected."*

#### Step 5: Drag-out UX

Listen to `chrome.tabs.onUpdated`. When a tab leaves the group, log a one-time warning to the side panel and re-pin it to the group (if `adoptOnDrag` is enabled in options).

---

## Pitfalls to watch (both bugs)

1. **`getContext()` currently leaks all tabs** — delete the `chrome.tabs.query({})` fallback so the LLM doesn't see tabs outside the group.
2. **`chrome.tabs.get` is O(1) and reliable; don't use `chrome.tabs.query` in the hot path** — it allocates an array. Cache the group tabIds in memory and refresh on `chrome.tabs.onUpdated`/`onRemoved`.
3. **`isIntentionallyClosing` race** — when `closeGroup()` runs, `onRemoved` will fire. The handler short-circuits on the flag, but any in-flight tool call between the flag set and tab removal may try `chrome.tabs.get` on a vanishing tab. The `.catch(() => null)` handles that.
4. **Service worker eviction** — event listeners (`onRemoved`, `onUpdated`) are top-level statements that re-run on SW wake, so they re-register correctly.
5. **Tab created by user mid-session** — a user opening a new tab will not be in the group. Either auto-adopt via `chrome.tabs.onCreated` (aggressive) or only adopt when the agent explicitly calls `openTab` (recommended; current behavior).
6. **Drag-out UX** — if the user drags a tab out, subsequent tool calls fail with `TAB_NOT_IN_GROUP`. Add a toast notification with a "Re-adopt" action.

---

## Comparable products

- **Claude in Chrome (Anthropic)**: Uses a "current tab" model — no isolation by default. User can navigate freely.
- **Manus AI / Devin / Cursor Browser**: All use **dedicated windows** (Approach C) for hard isolation when desired, **and** prompt-side scoping when not.
- **Cursor's browser feature** is closest to ours and uses side panel + dedicated window combo.

---

## Implementation effort

- Bug 1 (openTab fix): ~30 min (one file edit, one helper)
- Bug 2 (Tab Group scoping, Approach G): ~1–2 hours
  - 1 new file (`tab-group-guard.ts`)
  - 6 tool dispatcher edits
  - 1 `getContext()` filter change
  - 1 system prompt edit
  - 1 event listener for drag-out

No new permissions needed. `tabGroups` is already declared in the manifest.
