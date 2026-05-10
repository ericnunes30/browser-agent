/* ─── Message Router — chrome.runtime.onMessage handler ────────── */
import { executeTool } from './tools';
import { tabGroupManager } from './tab-group';
import { scheduledTaskManager } from './scheduled-tasks';
import { NativeBridge } from './native-bridge';
import { getNativeBridge, setPendingModelListResolve, getPendingModelListResolve } from './bridge-singleton';
import { handleChatSend } from './chat-handler';
import { handlePermission, forwardToActiveTab } from './permissions-handler';

/** Abort controller for the currently running tool execution. */
let currentAbortController: AbortController | null = null;

export function registerMessageRouter() {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {

      case 'chat:send':
        handleChatSend(msg, sender).then(sendResponse).catch((err) => sendResponse({ error: err.message }));
        return true;

      case 'chat:clear':
        tabGroupManager.closeGroup().then(() => sendResponse({ success: true })).catch((err) => sendResponse({ error: err.message }));
        return true;

      case 'tab:create':
        if (msg.url) {
          tabGroupManager.openTab(msg.url).then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ error: err.message }));
        } else {
          sendResponse({ error: 'No URL provided' });
        }
        return true;

      case 'tool:execute':
        executeTool(msg.name, msg.input, msg.tabId).then(sendResponse).catch((err) => sendResponse({ error: err.message }));
        return true;

      case 'tab:getActive':
        (async () => {
          try {
            const win = await chrome.windows.getLastFocused();
            const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
            sendResponse(tabs[0] || null);
          } catch {
            sendResponse(null);
          }
        })();
        return true;

      case 'models:list': {
        const bridge = getNativeBridge();
        if (bridge.isHostAvailable) {
          bridge.connect();
          bridge.listModels();
          return new Promise<any>((resolve) => {
            setPendingModelListResolve(resolve);
            setTimeout(() => {
              if (getPendingModelListResolve() === resolve) {
                setPendingModelListResolve(null);
                resolve({ providers: [] });
              }
            }, 10000);
          });
        } else {
          NativeBridge.loadModelsFallback().then((providers) => sendResponse({ providers }));
          return true;
        }
      }

      case 'SHOW_AGENT_INDICATORS':
      case 'HIDE_AGENT_INDICATORS':
      case 'UPDATE_PHANTOM_CURSOR':
      case 'SHOW_STATIC_INDICATOR':
      case 'HIDE_STATIC_INDICATOR':
      case 'HIDE_FOR_TOOL_USE':
      case 'SHOW_AFTER_TOOL_USE':
        forwardToActiveTab(msg, sender).then(sendResponse).catch(() => sendResponse({ success: false }));
        return true;

      case 'permission:check':
      case 'permission:grant':
      case 'permission:allow_once':
      case 'permission:deny':
      case 'permission:clear-session':
        handlePermission(msg, sender).then(sendResponse).catch((err) => sendResponse({ error: err.message }));
        return true;

      case 'indicator:stop':
        if (currentAbortController) { currentAbortController.abort(); currentAbortController = null; }
        sendResponse({ success: true });
        return false;

      case 'task:create':
        scheduledTaskManager.create(msg.task).then((task) => sendResponse({ ok: true, task })).catch((err) => sendResponse({ error: err.message }));
        return true;
      case 'task:delete':
        scheduledTaskManager.delete(msg.taskId).then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ error: err.message }));
        return true;
      case 'task:getAll':
        scheduledTaskManager.getAll().then((tasks) => sendResponse({ tasks })).catch((err) => sendResponse({ error: err.message }));
        return true;
      case 'task:toggle':
        scheduledTaskManager.toggle(msg.taskId, msg.enabled).then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ error: err.message }));
        return true;
      case 'task:execute':
        scheduledTaskManager.execute(msg.taskId).then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ error: err.message }));
        return true;

      case 'test:tool':
        executeTool(msg.name || 'tabs_context', msg.input || {}, msg.tabId).then(sendResponse).catch((err) => sendResponse({ error: err.message }));
        return true;

      case 'test:toolcall':
        (async () => {
          try {
            const result = await handleChatSend({
              provider: msg.provider || 'openai',
              model: msg.model || 'gpt-4o',
              messages: [
                { role: 'system', content: 'You are a browser automation agent. Use tools to interact with the browser.' },
                { role: 'user', content: msg.message || 'Get the list of open tabs' },
              ],
              tabId: msg.tabId,
            }, sender);
            sendResponse({ success: true, content: result?.content || '', fullResponse: result });
          } catch (err: any) {
            sendResponse({ error: err.message });
          }
        })();
        return true;

      case 'STATIC_INDICATOR_HEARTBEAT':
        sendResponse({ success: true });
        return false;

      default:
        sendResponse({ error: `Unknown message type: ${msg.type}` });
        return false;
    }
  });
}
