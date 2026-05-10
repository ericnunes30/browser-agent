/* ─── Port-based streaming (Side Panel ↔ Service Worker) ──────── */
import type { NativeBridgeCallbacks } from './native-bridge';
import { executeTool } from './tools';
import { directChat } from './chat-handler';
import { getCachedActiveTabId, setCachedActiveTabId, getActiveTabId, getNativeBridge } from './bridge-singleton';
import { startKeepAlive, stopKeepAlive } from './keep-alive';

/**
 * Handle a chat-stream port connection from the side panel.
 * Reuses the singleton NativeBridge with temporarily overridden callbacks.
 */
export async function handleChatStream(port: chrome.runtime.Port) {
  let singletonBridge: ReturnType<typeof getNativeBridge> | null = null;
  let originalCallbacks: NativeBridgeCallbacks | null = null;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    // Restore original callbacks if we overrode them
    if (originalCallbacks && singletonBridge) {
      singletonBridge.setCallbacks(originalCallbacks);
      originalCallbacks = null;
    }
    stopKeepAlive();
  };

  port.onMessage.addListener(async (msg: any) => {
    if (disposed) return;

    switch (msg.type) {
      case 'chat:send': {
        startKeepAlive();
        console.log(`[SW] 📨 chat:send received (messages: ${msg.messages?.length})`);

        const lastMsg = msg.messages?.[msg.messages?.length - 1];
        const promptText = typeof lastMsg?.content === 'string' ? lastMsg.content : '';
        if (!promptText) {
          if (!disposed) port.postMessage({ type: 'chat:error', error: 'No message content' });
          dispose();
          break;
        }

        const streamTabId = msg.tabId ?? getCachedActiveTabId() ?? await getActiveTabId();
        setCachedActiveTabId(streamTabId);

        singletonBridge = getNativeBridge();
        const hostAvailable = singletonBridge.isHostAvailable;
        console.log(`[SW] 📨 chat:send processing (hostAvailable: ${hostAvailable}, promptText: "${promptText.substring(0, 50)}")`);

        if (hostAvailable) {
          // ── PATH A: Reuse singleton bridge with stream callbacks ──
          originalCallbacks = singletonBridge.getCallbacks();

          let firstDelta = true;
          const streamCallbacks: NativeBridgeCallbacks = {
            onDelta: (text: string) => {
              if (firstDelta) { firstDelta = false; console.log('[SW] <<< First response chunk received'); }
              if (!disposed) port.postMessage({ type: 'chat:delta', text });
            },
            onReasoning: (text: string) => {
              if (!disposed) port.postMessage({ type: 'chat:reasoning', text });
            },
            onToolExec: async (toolCallId: string, name: string, args: Record<string, unknown>) => {
              console.log(`[SW] 🔧 Tool exec: ${name} (id: ${toolCallId})`);
              const toolStart = Date.now();
              if (streamTabId) {
                chrome.tabs.sendMessage(streamTabId, { type: 'indicator:show' }).catch(() => {});
                chrome.tabs.sendMessage(streamTabId, { type: 'indicator:action', action: name, text: `Performing ${name}` }).catch(() => {});
              }
              const result = await executeTool(name, args, streamTabId ?? undefined);
              console.log(`[SW] 🔧 Tool done: ${name} (${Date.now() - toolStart}ms)${result.error ? ' ERROR: ' + result.error : ''}`);
              if (streamTabId) {
                chrome.tabs.sendMessage(streamTabId, { type: 'indicator:hide_action' }).catch(() => {});
              }
              const images = result.images || result.screenshots?.map(s => s.data) || [];
              return { content: result.content, error: result.error, images };
            },
            onToolEnd: (name: string, result: string, error?: boolean) => {
              console.log(`[SW] 🔧 Tool end: ${name} (error: ${!!error})`);
              if (!disposed) port.postMessage({ type: 'chat:toolEnd', name, result, error });
              if (streamTabId) chrome.tabs.sendMessage(streamTabId, { type: 'indicator:hide_action' }).catch(() => {});
            },
            onTurnEnd: () => {},
            onDone: () => {
              console.log('[SW] ✅ Stream done');
              if (!disposed) port.postMessage({ type: 'chat:result' });
              dispose();
            },
            onError: (err: string) => {
              console.error('[SW] ❌ Stream error:', err);
              if (!disposed) port.postMessage({ type: 'chat:error', error: err });
              dispose();
            },
            onModelList: () => {},
            onSessionInfo: (sessionId: string) => {
              chrome.storage.local.set({ 'ba-session-id': sessionId }).catch(() => {});
            },
          };

          singletonBridge.setCallbacks(streamCallbacks);

          if (msg.provider && msg.model) {
            singletonBridge.setModel(msg.provider, msg.model);
          }

          console.log(`[SW] >>> Sending prompt (${promptText.length} chars) to native host`);
          console.log(`[SW] >>> Sending prompt (${promptText.length} chars) to native host (second? ${singletonBridge.getCallbacks() !== originalCallbacks})`);
          singletonBridge.prompt(promptText);
        } else {
          // ── PATH B: Direct API fallback (no tools) ──
          try {
            const result = await directChat(msg.provider || 'openai', msg.model || 'gpt-4o', msg.messages || []);
            if (!disposed) {
              if (result.content) port.postMessage({ type: 'chat:delta', text: result.content });
              if (result.reasoning) port.postMessage({ type: 'chat:reasoning', text: result.reasoning });
              port.postMessage({ type: 'chat:result' });
            }
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error('[SW] Chat stream directChat error:', errMsg);
            if (!disposed) port.postMessage({ type: 'chat:error', error: errMsg });
          } finally {
            dispose();
          }
        }
        break;
      }

      case 'chat:stop': {
        singletonBridge?.abort();
        dispose();
        break;
      }

      default:
        console.warn('[SW] Unknown chat-stream message:', msg.type);
    }
  });

  port.onDisconnect.addListener(() => dispose());
}
