/**
 * Mock completo das APIs Chrome MV3 para testes unitários.
 * Simula sidePanel, tabs, tabGroups, action, storage, runtime e windows.
 */

export interface MockTab {
  id: number;
  windowId: number;
  url?: string;
  active: boolean;
  groupId: number;
}

export interface MockTabGroup {
  id: number;
  windowId: number;
  title?: string;
  color?: string;
  collapsed?: boolean;
}

export interface MockWindow {
  id: number;
  focused: boolean;
}

class ChromeMock {
  tabs: MockTab[] = [];
  groups: MockTabGroup[] = [];
  windows: MockWindow[] = [{ id: 1, focused: true }];
  storageLocal: Record<string, any> = {};
  sidePanelOpenCalls: Array<{ windowId: number }> = [];
  sidePanelBehavior: { openPanelOnActionClick: boolean } = { openPanelOnActionClick: true };
  sidePanelOpened = false;

  // Event listeners
  tabRemovedListeners: Array<(tabId: number, info: any) => void | Promise<void>> = [];
  groupRemovedListeners: Array<(group: MockTabGroup) => void | Promise<void>> = [];
  actionClickedListeners: Array<(tab: MockTab) => void | Promise<void>> = [];
  sidePanelOpenedListeners: Array<() => void | Promise<void>> = [];
  runtimeOnConnectListeners: Array<(port: any) => void> = [];

  reset() {
    this.tabs = [];
    this.groups = [];
    this.windows = [{ id: 1, focused: true }];
    this.storageLocal = {};
    this.sidePanelOpenCalls = [];
    this.sidePanelBehavior = { openPanelOnActionClick: true };
    this.sidePanelOpened = false;
    this.tabRemovedListeners = [];
    this.groupRemovedListeners = [];
    this.actionClickedListeners = [];
    this.sidePanelOpenedListeners = [];
  }

  createTab(overrides: Partial<MockTab> = {}): MockTab {
    const tab: MockTab = {
      id: overrides.id ?? this.tabs.length + 1,
      windowId: overrides.windowId ?? 1,
      url: overrides.url ?? 'https://example.com',
      active: overrides.active ?? true,
      groupId: overrides.groupId ?? -1,
      ...overrides,
    };
    this.tabs.push(tab);
    return tab;
  }

  createGroup(title: string, tabIds: number[]): MockTabGroup {
    const groupId = this.groups.length + 1;
    const group: MockTabGroup = {
      id: groupId,
      windowId: 1,
      title,
      color: 'blue',
      collapsed: false,
    };
    this.groups.push(group);
    for (const tab of this.tabs) {
      if (tabIds.includes(tab.id)) {
        tab.groupId = groupId;
      }
    }
    return group;
  }

  async removeGroup(groupId: number) {
    const idx = this.groups.findIndex(g => g.id === groupId);
    if (idx >= 0) {
      const group = this.groups[idx];
      this.groups.splice(idx, 1);
      for (const tab of this.tabs) {
        if (tab.groupId === groupId) {
          tab.groupId = -1;
        }
      }
      for (const listener of this.groupRemovedListeners) {
        await listener(group);
      }
    }
  }

  async removeTab(tabId: number) {
    const idx = this.tabs.findIndex(t => t.id === tabId);
    if (idx >= 0) {
      const tab = this.tabs[idx];
      this.tabs.splice(idx, 1);
      const wasLastInGroup = tab.groupId >= 0 && !this.tabs.some(t => t.groupId === tab.groupId);
      for (const listener of this.tabRemovedListeners) {
        await listener(tabId, { windowId: tab.windowId, isWindowClosing: false });
      }
      if (wasLastInGroup && tab.groupId >= 0) {
        const gIdx = this.groups.findIndex(g => g.id === tab.groupId);
        if (gIdx >= 0) {
          const group = this.groups[gIdx];
          this.groups.splice(gIdx, 1);
          for (const listener of this.groupRemovedListeners) {
            await listener(group);
          }
        }
      }
    }
  }

  async closeWindow(windowId: number) {
    const tabsToRemove = this.tabs.filter(t => t.windowId === windowId);
    for (const tab of [...tabsToRemove]) {
      await this.removeTab(tab.id);
    }
    this.windows = this.windows.filter(w => w.id !== windowId);
  }

  // --- Chrome API implementations ---

  tabsAPI = {
    get: async (tabId: number): Promise<MockTab> => {
      const tab = this.tabs.find(t => t.id === tabId);
      if (!tab) throw new Error(`Tab ${tabId} not found`);
      return { ...tab };
    },
    create: async (createProperties: chrome.tabs.CreateProperties): Promise<MockTab> => {
      const id = this.tabs.length + 100; // avoid clashing with seeded ids
      const tab: MockTab = {
        id,
        windowId: createProperties.windowId ?? 1,
        url: createProperties.url ?? 'about:blank',
        active: createProperties.active ?? false,
        groupId: -1,
      };
      this.tabs.push(tab);
      return { ...tab };
    },
    remove: async (tabIds: number | number[]) => {
      const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
      for (const id of ids) {
        await this.removeTab(id);
      }
    },
    query: async (queryInfo: any): Promise<MockTab[]> => {
      let result = [...this.tabs];
      if (queryInfo.active !== undefined) {
        result = result.filter(t => t.active === queryInfo.active);
      }
      if (queryInfo.windowId !== undefined) {
        result = result.filter(t => t.windowId === queryInfo.windowId);
      }
      if (queryInfo.groupId !== undefined) {
        result = result.filter(t => t.groupId === queryInfo.groupId);
      }
      return result.map(t => ({ ...t }));
    },
    group: async (options: { tabIds: number[]; groupId?: number; createProperties?: { windowId?: number } }) => {
      if (options.groupId !== undefined) {
        // Add tabs to existing group
        const group = this.groups.find(g => g.id === options.groupId);
        if (!group) throw new Error(`Group ${options.groupId} not found`);
        for (const tab of this.tabs) {
          if (options.tabIds.includes(tab.id)) {
            tab.groupId = options.groupId;
          }
        }
        return options.groupId;
      }
      // Create new group
      const newGroupId = this.groups.length + 1;
      const group: MockTabGroup = {
        id: newGroupId,
        windowId: options.createProperties?.windowId ?? 1,
        title: undefined,
        color: 'blue',
        collapsed: false,
      };
      this.groups.push(group);
      for (const tab of this.tabs) {
        if (options.tabIds.includes(tab.id)) {
          tab.groupId = newGroupId;
        }
      }
      return newGroupId;
    },
    onRemoved: {
      addListener: (cb: any) => { this.tabRemovedListeners.push(cb); },
      removeListener: (_cb: any) => {},
    },
  };

  tabGroupsAPI = {
    update: async (groupId: number, updateProperties: any) => {
      const group = this.groups.find(g => g.id === groupId);
      if (group) {
        Object.assign(group, updateProperties);
      }
    },
    query: async (_queryInfo: any): Promise<MockTabGroup[]> => {
      return [...this.groups];
    },
    onRemoved: {
      addListener: (cb: any) => { this.groupRemovedListeners.push(cb); },
      removeListener: (_cb: any) => {},
    },
  };

  sidePanelAPI = {
    open: async (options: { windowId: number }) => {
      this.sidePanelOpenCalls.push(options);
      this.sidePanelOpened = true;
      // Do NOT auto-fire onOpened via setTimeout — tests must call it manually
      // to avoid race conditions between test resets.
    },
    setPanelBehavior: async (behavior: any) => {
      this.sidePanelBehavior = { ...this.sidePanelBehavior, ...behavior };
    },
    onOpened: {
      addListener: (cb: any) => { this.sidePanelOpenedListeners.push(cb); },
      removeListener: (_cb: any) => {},
    },
  };

  /** Manually trigger all sidePanel.onOpened listeners (tests use this). */
  async fireSidePanelOpened() {
    for (const listener of this.sidePanelOpenedListeners) {
      await listener();
    }
  }

  actionAPI = {
    onClicked: {
      addListener: (cb: any) => { this.actionClickedListeners.push(cb); },
      removeListener: (_cb: any) => {},
    },
  };

  storageAPI = {
    local: {
      get: async (keys?: string | string[] | null | Record<string, any>): Promise<Record<string, any>> => {
        if (keys === null || keys === undefined) {
          return { ...this.storageLocal };
        }
        if (typeof keys === 'string') {
          return keys in this.storageLocal ? { [keys]: this.storageLocal[keys] } : {};
        }
        if (Array.isArray(keys)) {
          const result: Record<string, any> = {};
          for (const key of keys) {
            if (key in this.storageLocal) result[key] = this.storageLocal[key];
          }
          return result;
        }
        // object with defaults
        const result: Record<string, any> = {};
        for (const [key, defaultValue] of Object.entries(keys)) {
          result[key] = key in this.storageLocal ? this.storageLocal[key] : defaultValue;
        }
        return result;
      },
      set: async (items: Record<string, any>) => {
        Object.assign(this.storageLocal, items);
      },
      remove: async (keys: string | string[]) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const key of keyList) {
          delete this.storageLocal[key];
        }
      },
    },
  };

  runtimeAPI = {
    getURL: (path: string) => `chrome-extension://test-id/${path}`,
    connect: (connectInfo?: { name?: string }) => {
      const disconnectListeners: Array<() => void> = [];
      const port = {
        name: connectInfo?.name || '',
        postMessage: (_msg: any) => {},
        disconnect: () => {
          for (const cb of disconnectListeners) cb();
        },
        onDisconnect: {
          addListener: (cb: any) => { disconnectListeners.push(cb); },
          removeListener: (_cb: any) => {},
        },
        onMessage: {
          addListener: (_cb: any) => {},
          removeListener: (_cb: any) => {},
        },
      };
      for (const listener of this.runtimeOnConnectListeners) {
        listener(port);
      }
      return port;
    },
    onConnect: {
      addListener: (cb: any) => { this.runtimeOnConnectListeners.push(cb); },
      removeListener: (cb: any) => {
        const idx = this.runtimeOnConnectListeners.indexOf(cb);
        if (idx >= 0) this.runtimeOnConnectListeners.splice(idx, 1);
      },
    },
    onInstalled: {
      addListener: (_cb: any) => {},
      removeListener: (_cb: any) => {},
    },
    onStartup: {
      addListener: (_cb: any) => {},
      removeListener: (_cb: any) => {},
    },
    onMessage: {
      addListener: (_cb: any) => {},
      removeListener: (_cb: any) => {},
    },
    onMessageExternal: {
      addListener: (_cb: any) => {},
      removeListener: (_cb: any) => {},
    },
    sendMessage: async (_message: any) => {},
  };

  windowsAPI = {
    getLastFocused: async () => {
      const win = this.windows.find(w => w.focused) || this.windows[0];
      if (!win) throw new Error('No windows');
      return { ...win };
    },
  };

  alarmsAPI = {
    onAlarm: {
      addListener: (_cb: any) => {},
      removeListener: (_cb: any) => {},
    },
    create: async (_name: string, _alarmInfo?: any) => {},
    clear: async (_name?: string) => true,
  };

  notificationsAPI = {
    onClicked: {
      addListener: (_cb: any) => {},
      removeListener: (_cb: any) => {},
    },
    create: async (_notificationId: string | undefined, _options: any) => 'test-notification-id',
    clear: async (_notificationId?: string) => true,
  };

  permissionsAPI = {
    onAdded: {
      addListener: (_cb: any) => {},
      removeListener: (_cb: any) => {},
    },
    onRemoved: {
      addListener: (_cb: any) => {},
      removeListener: (_cb: any) => {},
    },
    contains: async (_permissions: any) => ({ permissions: [] }),
    request: async (_permissions: any) => true,
  };

  webNavigationAPI = {
    onBeforeNavigate: {
      addListener: (_cb: any) => {},
      removeListener: (_cb: any) => {},
    },
  };

  commandsAPI = {
    onCommand: {
      addListener: (_cb: any) => {},
      removeListener: (_cb: any) => {},
    },
  };

  declarativeNetRequestAPI = {
    updateDynamicRules: async (_options: any) => {},
    updateSessionRules: async (_options: any) => {},
    getDynamicRules: async () => [],
    getSessionRules: async () => [],
  };

  offscreenAPI = {
    createDocument: async (_options: any) => {},
    closeDocument: async () => {},
    hasDocument: async () => false,
  };

  debuggerAPI = {
    attach: async (_target: any, _requiredVersion: string) => {},
    detach: async (_target: any) => {},
    sendCommand: async (_target: any, _method: string, _params?: any) => ({}),
    onDetach: {
      addListener: (_cb: any) => {},
      removeListener: (_cb: any) => {},
    },
    onEvent: {
      addListener: (_cb: any) => {},
      removeListener: (_cb: any) => {},
    },
  };

  scriptingAPI = {
    executeScript: async (_injection: any) => [],
    insertCSS: async (_injection: any) => {},
    removeCSS: async (_injection: any) => {},
    registerContentScripts: async (_scripts: any) => {},
    getRegisteredContentScripts: async () => [],
    unregisterContentScripts: async (_filter?: any) => {},
  };

  identityAPI = {
    getRedirectURL: () => 'https://test-id.chromiumapp.org/',
    launchWebAuthFlow: async (_details: any) => '',
    getAuthToken: async (_details?: any) => ({ token: '' }),
    removeCachedAuthToken: async (_details: any) => {},
  };

  downloadsAPI = {
    download: async (_options: any) => 1,
    onChanged: {
      addListener: (_cb: any) => {},
      removeListener: (_cb: any) => {},
    },
    onCreated: {
      addListener: (_cb: any) => {},
      removeListener: (_cb: any) => {},
    },
  };

  i18nAPI = {
    getMessage: (_messageName: string, _substitutions?: string | string[]) => '',
    getUILanguage: () => 'en-US',
    getAcceptLanguages: async () => ['en-US'],
    detectLanguage: async (_text: string) => ({ isReliable: true, languages: [] }),
  };
}

let activeMock: ChromeMock | null = null;

export function setupChromeMock(mock: ChromeMock) {
  activeMock = mock;
  (globalThis as any).chrome = {
    tabs: mock.tabsAPI,
    tabGroups: mock.tabGroupsAPI,
    sidePanel: mock.sidePanelAPI,
    action: mock.actionAPI,
    storage: mock.storageAPI,
    runtime: mock.runtimeAPI,
    windows: mock.windowsAPI,
    alarms: mock.alarmsAPI,
    notifications: mock.notificationsAPI,
    permissions: mock.permissionsAPI,
    webNavigation: mock.webNavigationAPI,
    commands: mock.commandsAPI,
    declarativeNetRequest: mock.declarativeNetRequestAPI,
    offscreen: mock.offscreenAPI,
    debugger: mock.debuggerAPI,
    scripting: mock.scriptingAPI,
    identity: mock.identityAPI,
    downloads: mock.downloadsAPI,
    i18n: mock.i18nAPI,
  };
}

export function getActiveMock(): ChromeMock {
  if (!activeMock) throw new Error('No active Chrome mock. Call setupChromeMock first.');
  return activeMock;
}

export function clearChromeMock() {
  activeMock = null;
  delete (globalThis as any).chrome;
}

export { ChromeMock };
