/* ─── Tab Group Manager ──────────────────────────────────────── */
/* Manages a single group of tabs for multi-tab tasks.          */

interface TabInfo {
  id: number;
  url?: string;
  title?: string;
  active: boolean;
  groupId?: number;
  favIconUrl?: string;
}

/** Filter out internal Chrome tabs that can't be used with CDP. */
function isUsableTab(tab: chrome.tabs.Tab): boolean {
  if (!tab.id) return false;
  if (!tab.url) return true; // Not yet loaded, allow
  const url = tab.url;
  return !url.startsWith('devtools://') && !url.startsWith('chrome://') && !url.startsWith('chrome-extension://');
}

interface TabGroupInfo {
  id: number;
  name: string;
  color?: chrome.tabGroups.ColorEnum;
  tabs: TabInfo[];
}

export class TabGroupManager {
  private currentGroupId: number | null = null;
  private groupName: string = '';
  private readonly GROUP_COLORS: chrome.tabGroups.ColorEnum[] = [
    'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey',
  ];

  /**
   * Create a new tab group with a descriptive name.
   * If firstUrl is provided, creates a tab with that URL first.
   */
  async createGroup(name: string, firstUrl?: string): Promise<TabGroupInfo> {
    this.groupName = name;
    
    // Create initial tab if URL provided
    let tabId: number | undefined;
    if (firstUrl) {
      const tab = await chrome.tabs.create({ url: firstUrl });
      tabId = tab.id;
    } else {
      const tab = await chrome.tabs.create({ url: 'about:blank' });
      tabId = tab.id;
    }

    if (!tabId) throw new Error('Failed to create tab');

    // Create group with the tab
    const groupId = await chrome.tabs.group({ tabIds: [tabId] });
    
    // Pick a color based on name hash
    const colorIndex = Math.abs(this._hashCode(name)) % this.GROUP_COLORS.length;
    
    await chrome.tabGroups.update(groupId, {
      title: name,
      color: this.GROUP_COLORS[colorIndex],
    });

    this.currentGroupId = groupId;
    return this.getInfo();
  }

  /**
   * Create a new tab group containing an EXISTING tab.
   * Unlike createGroup(), this doesn't create a new tab — it adopts
   * the given tabId into a freshly-created group.
   */
  async createGroupWithTab(name: string, tabId: number): Promise<TabGroupInfo> {
    this.groupName = name;

    // Create a group containing the existing tab
    const groupId = await chrome.tabs.group({ tabIds: [tabId] });

    // Pick a color based on name hash
    const colorIndex = Math.abs(this._hashCode(name)) % this.GROUP_COLORS.length;

    await chrome.tabGroups.update(groupId, {
      title: name,
      color: this.GROUP_COLORS[colorIndex],
    });

    this.currentGroupId = groupId;
    return this.getInfo();
  }

  /**
   * Open a new tab in the current group.
   */
  async openTab(url?: string): Promise<chrome.tabs.Tab> {
    const tab = await chrome.tabs.create({ url });
    
    if (this.currentGroupId !== null) {
      await chrome.tabs.group({ tabIds: [tab.id!], groupId: this.currentGroupId });
    }
    
    return tab;
  }

  /**
   * Adopt an orphan tab into the current group.
   */
  async adoptTab(tabId: number): Promise<void> {
    if (this.currentGroupId !== null) {
      await chrome.tabs.group({ tabIds: [tabId], groupId: this.currentGroupId });
    }
  }

  /**
   * Adopt all orphan (ungrouped) tabs in the current window.
   */
  async adoptOrphans(): Promise<void> {
    if (this.currentGroupId === null) return;

    let windowId: number | undefined;
    try {
      const win = await chrome.windows.getLastFocused();
      windowId = win.id;
    } catch { return; }

    const tabs = await chrome.tabs.query({ windowId });
    const orphans = tabs.filter(t => t.groupId === -1 && t.id);

    if (orphans.length > 0) {
      await chrome.tabs.group({
        tabIds: orphans.map(t => t.id!),
        groupId: this.currentGroupId,
      });
    }
  }

  /**
   * Get all tabs in the current group.
   */
  async getTabs(): Promise<TabInfo[]> {
    if (this.currentGroupId === null) return [];
    
    const tabs = await chrome.tabs.query({ groupId: this.currentGroupId });
    return tabs.map(t => ({
      id: t.id!,
      url: t.url,
      title: t.title,
      active: t.active,
      groupId: t.groupId,
      favIconUrl: t.favIconUrl,
    }));
  }

  /**
   * Get context info for tabs (used by tabs_context tool).
   * Returns ALL tabs across all windows so the model can see
   * everything the user has open.
   */
  async getContext(): Promise<TabInfo[]> {
    // When a group exists, include group tabs first, then all other tabs
    if (this.currentGroupId !== null) {
      const groupTabs = await this.getTabs();
      const allTabs = (await chrome.tabs.query({})).filter(isUsableTab);
      const groupTabIds = new Set(groupTabs.map(t => t.id));
      const otherTabs = allTabs
        .filter(t => !groupTabIds.has(t.id!))
        .map(t => ({
          id: t.id!,
          url: t.url,
          title: t.title,
          active: t.active,
          groupId: t.groupId,
          favIconUrl: t.favIconUrl,
        }));
      return [...groupTabs, ...otherTabs];
    }
    // No group: return all tabs from all windows
    const tabs = (await chrome.tabs.query({})).filter(isUsableTab);
    return tabs.map(t => ({
      id: t.id!,
      url: t.url,
      title: t.title,
      active: t.active,
      groupId: t.groupId,
      favIconUrl: t.favIconUrl,
    }));
  }

  /**
   * Close all tabs in the group and remove the group.
   */
  async closeGroup(): Promise<void> {
    if (this.currentGroupId === null) return;
    
    const tabs = await chrome.tabs.query({ groupId: this.currentGroupId });
    const tabIds = tabs.map(t => t.id!).filter(Boolean);
    
    if (tabIds.length > 0) {
      await chrome.tabs.remove(tabIds);
    }
    
    this.currentGroupId = null;
    this.groupName = '';
  }

  /**
   * Get the current group ID.
   */
  getGroupId(): number | null {
    return this.currentGroupId;
  }

  getGroupName(): string {
    return this.groupName;
  }

  // ── Private helpers ──────────────────────────────────────

  private async getInfo(): Promise<TabGroupInfo> {
    const tabs = await this.getTabs();
    return {
      id: this.currentGroupId!,
      name: this.groupName,
      tabs,
    };
  }

  private _hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return hash;
  }
}

/** Singleton instance */
export const tabGroupManager = new TabGroupManager();
