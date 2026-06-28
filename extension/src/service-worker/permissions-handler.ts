/* ─── Permission & shield helpers ──────────────────────────────── */
import { permissionManager } from './permissions';
import { getActiveTabId } from './active-tab';

export async function handlePermission(msg: any, sender?: chrome.runtime.MessageSender): Promise<any> {
  const tabId = sender?.tab?.id || msg.tabId;

  switch (msg.type) {
    case 'permission:check': {
      const result = await permissionManager.check(msg.domain, msg.toolName || 'unknown');
      if (tabId && (result.requiresPrompt || !result.allowed)) {
        notifyShield(tabId, result.requiresPrompt).catch(() => {});
      }
      return result;
    }
    case 'permission:grant': {
      await permissionManager.allow(msg.domain, msg.forAllChats ?? true);
      if (tabId) clearShield(tabId).catch(() => {});
      return { ok: true };
    }
    case 'permission:allow_once': {
      await permissionManager.allow(msg.domain, false);
      if (tabId) clearShield(tabId).catch(() => {});
      return { ok: true };
    }
    case 'permission:deny': {
      await permissionManager.deny(msg.domain);
      if (tabId) clearShield(tabId).catch(() => {});
      return { ok: true };
    }
    case 'permission:clear-session': {
      await permissionManager.clearSession();
      const activeTabId = tabId || await getActiveTabId();
      if (activeTabId) clearShield(activeTabId).catch(() => {});
      return { ok: true };
    }
    default:
      return { error: 'Unknown permission type' };
  }
}

export async function notifyShield(tabId: number, restricted: boolean) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'indicator:shield', show: true, restricted });
  } catch { /* content script not loaded */ }
}

export async function clearShield(tabId: number) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'indicator:shield', show: false });
  } catch { /* content script not loaded */ }
}

export async function forwardToActiveTab(msg: any, sender: chrome.runtime.MessageSender): Promise<any> {
  const tabId = msg.tabId || sender.tab?.id;
  if (!tabId) {
    try {
      const win = await chrome.windows.getLastFocused();
      const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
      if (tabs[0]?.id) return chrome.tabs.sendMessage(tabs[0].id, msg);
    } catch { /* ignore */ }
    return { success: false };
  }
  return chrome.tabs.sendMessage(tabId, msg);
}
