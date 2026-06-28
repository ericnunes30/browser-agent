/* ─── Active tab caching helpers ───────────────────────────────── */

let cachedActiveTabId: number | null = null;

export function getCachedActiveTabId(): number | null {
  return cachedActiveTabId;
}

export function setCachedActiveTabId(id: number | null): void {
  cachedActiveTabId = id;
}

export async function getActiveTabId(): Promise<number | null> {
  try {
    const win = await chrome.windows.getLastFocused();
    const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
    return tabs[0]?.id ?? null;
  } catch {
    return null;
  }
}
