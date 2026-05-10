/* ─── NativeBridge singleton & shared state ────────────────────── */
import { NativeBridge } from './native-bridge';
import { executeTool } from './tools';

/* ── Mutable state (getter/setter for cross-module access) ─────── */

let cachedActiveTabId: number | null = null;
export function getCachedActiveTabId() { return cachedActiveTabId; }
export function setCachedActiveTabId(id: number | null) { cachedActiveTabId = id; }

let pendingModelListResolve: ((value: any) => void) | null = null;
export function setPendingModelListResolve(r: ((v: any) => void) | null) { pendingModelListResolve = r; }
export function getPendingModelListResolve() { return pendingModelListResolve; }

/* ── Helpers ───────────────────────────────────────────────────── */

export async function getActiveTabId(): Promise<number | null> {
  try {
    const win = await chrome.windows.getLastFocused();
    const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
    return tabs[0]?.id ?? null;
  } catch {
    return null;
  }
}

/* ── Singleton bridge ──────────────────────────────────────────── */

let nativeBridge: NativeBridge;

export function getNativeBridge(): NativeBridge {
  if (!nativeBridge) {
    nativeBridge = new NativeBridge({
      onDelta: () => {},
      onReasoning: () => {},
      onToolExec: async (toolCallId, name, args) => {
        const tabId = cachedActiveTabId ?? await getActiveTabId();
        if (tabId) {
          chrome.tabs.sendMessage(tabId, { type: 'indicator:show' }).catch(() => {});
          chrome.tabs.sendMessage(tabId, { type: 'indicator:action', action: name, text: `Performing ${name}` }).catch(() => {});
        }
        const result = await executeTool(name, args, tabId ?? undefined);
        if (tabId) {
          chrome.tabs.sendMessage(tabId, { type: 'indicator:hide_action' }).catch(() => {});
        }
        const images = result.images || result.screenshots?.map(s => s.data) || [];
        return { content: result.content, error: result.error, images };
      },
      onToolEnd: () => {
        getActiveTabId().then((tabId) => {
          if (tabId) chrome.tabs.sendMessage(tabId, { type: 'indicator:hide_action' }).catch(() => {});
        });
      },
      onTurnEnd: () => {},
      onDone: () => {},
      onError: (err) => console.error('[SW] NativeBridge error:', err),
      onModelList: (providersList) => {
        const resolve = pendingModelListResolve;
        if (resolve) {
          pendingModelListResolve = null;
          resolve({
            providers: providersList.map((p: any) => ({
              id: p.id,
              name: p.name,
              models: p.models || [],
            })),
          });
        }
      },
      onSessionInfo: (sessionId) => {
        chrome.storage.local.set({ 'ba-session-id': sessionId }).catch(() => {});
      },
    });
  }
  return nativeBridge;
}
