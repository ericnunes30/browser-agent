/* ------------------------------------------------------------------ */
/*  Browser Agent — Service Worker (Background)                        */
/* ------------------------------------------------------------------ */
import { tabGroupManager } from './tab-group';
import { scheduledTaskManager } from './scheduled-tasks';
import { getNativeBridge, setCachedActiveTabId, getCachedActiveTabId } from './bridge-singleton';
import { handleChatSend } from './chat-handler';
import { handleChatStream } from './chat-stream';
import { registerMessageRouter } from './message-router';

/* ──── Register message router ────────────────────────────────────── */
registerMessageRouter();

/* ──── Init ───────────────────────────────────────────────────────── */

chrome.runtime.onInstalled.addListener(async () => { await initialize(); });
chrome.runtime.onStartup.addListener(async () => { await initialize(); await markPendingSyncIfNeeded(); });

async function initialize() {
  scheduledTaskManager.setCommandHandler(async (command: string) => {
    try {
      const result = await handleChatSend({
        provider: 'openai',
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: command }],
        tabId: undefined,
      }, {} as chrome.runtime.MessageSender);
      if (result?.error) return `Error: ${result.error}`;
      if (result?.content) return result.content;
      return 'Task executed successfully';
    } catch (err: unknown) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  });

  try {
    const bridge = getNativeBridge();
    bridge.connect();
    const stored = await chrome.storage.local.get('ba-session-id');
    bridge.resumeSession(stored['ba-session-id']);
  } catch { /* Host not available, continue without session */ }
}

async function markPendingSyncIfNeeded() {
  try {
    const result = await chrome.storage.local.get('ba-last-sync');
    const lastSync = result['ba-last-sync'] || 0;
    const url = chrome.runtime.getURL('config/models.custom.json');
    const resp = await fetch(url, { cache: 'no-cache' });
    const lastModified = resp.headers.get('Last-Modified');
    if (lastModified && new Date(lastModified).getTime() > lastSync) {
      await chrome.storage.local.set({ 'ba-pending-sync': true });
      console.log('[SW] New models detected since last sync');
    }
  } catch { /* Silently ignore — sync check is best-effort */ }
}

/* ──── Side panel open handler ────────────────────────────────────── */

/**
 * Guarda o contexto da aba ativa quando o usuário clica no botão da
 * extensão (action). O chrome.action.onClicked recebe a aba correta,
 * ao contrário do onOpened que não fornece contexto nenhum.
 */
let pendingSidePanelContext: { tabId: number; windowId: number } | null = null;

/* Desliga a abertura automática para podermos capturar o contexto */
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

/* Captura a aba ativa no momento do clique no ícone da toolbar */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.windowId) return;

  // Armazena o contexto para o handler onOpened
  pendingSidePanelContext = { tabId: tab.id, windowId: tab.windowId };
  console.log(`[SW] Action clicked, storing context: tab=${tab.id} window=${tab.windowId}`);

  // Abre o side panel manualmente
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (err) {
    console.error('[SW] Failed to open side panel:', err);
    pendingSidePanelContext = null;
  }
});

(chrome.sidePanel as any).onOpened.addListener(async () => {
  let targetTabId: number | null = null;
  let windowId: number | undefined;

  // Se temos um contexto pendente do action.onClicked, usa ele (mais confiável)
  if (pendingSidePanelContext) {
    targetTabId = pendingSidePanelContext.tabId;
    windowId = pendingSidePanelContext.windowId;
    pendingSidePanelContext = null; // limpa após usar
    console.log(`[SW] Side panel opened, using context from action click: tab=${targetTabId}`);
  } else {
    // Fallback: side panel aberto por outros meios (dropdown, atalho)
    try {
      const win = await chrome.windows.getLastFocused();
      windowId = win.id;
    } catch { return; }

    if (!windowId) return;

    const tabs = await chrome.tabs.query({ active: true, windowId }).catch(() => []);
    const activeTab = tabs[0];
    if (!activeTab?.id) return;

    const url = activeTab.url;

    if (url && (url.startsWith('devtools://') || url.startsWith('chrome://') || url.startsWith('chrome-extension://'))) {
      // Active tab is internal — find first usable tab in this window
      const allTabs = await chrome.tabs.query({ windowId }).catch(() => []);
      const usableTab = allTabs.find(t => t.id && t.url
        && !t.url.startsWith('devtools://') && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));
      if (usableTab?.id) {
        targetTabId = usableTab.id;
        console.log(`[SW] Side panel opened (fallback), active tab is internal. Using first usable tab: ${targetTabId} (${usableTab.url})`);
      }
    } else {
      targetTabId = activeTab.id;
    }
  }

  if (!targetTabId) {
    setCachedActiveTabId(null);
    console.log('[SW] Side panel opened, no usable tab found');
    return;
  }

  setCachedActiveTabId(targetTabId);
  console.log(`[SW] Side panel opened, cached active tab: ${getCachedActiveTabId()} (window ${windowId})`);

  if (tabGroupManager.getGroupId() === null) {
    // First time: create a new group with the current tab
    try {
      await tabGroupManager.createGroupWithTab(
        `BrowserAgent Task - ${new Date().toLocaleString()}`,
        targetTabId,
      );
      console.log(`[SW] Tab group created with tab ${targetTabId}`);
    } catch (err) {
      console.error('[SW] Failed to create tab group:', err);
    }
  } else {
    // Group already exists: adopt the current tab into the existing group
    // This handles opening the side panel in a different tab/window
    try {
      await tabGroupManager.adoptTab(targetTabId);
      console.log(`[SW] Tab ${targetTabId} adopted into existing group (${tabGroupManager.getGroupId()})`);
    } catch (err) {
      console.error('[SW] Failed to adopt tab into existing group:', err);
    }
  }
});

/* ──── Port-based streaming (Side Panel) ─────────────────────────── */

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'chat-stream') return;
  handleChatStream(port);
});
