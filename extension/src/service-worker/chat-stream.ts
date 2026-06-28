/* ─── Port-based streaming (Side Panel ↔ Service Worker) ──────── */
import { sendChatPrompt, getAdapterTools } from './chat-handler';
import {
  getCachedActiveTabId,
  setCachedActiveTabId,
  getActiveTabId,
} from './active-tab';
import { startKeepAlive, stopKeepAlive } from './keep-alive';
import type { PromptParams } from './providers/adapter';

/**
 * Convert the simplified side-panel message history into the adapter's
 * ChatMessage format.
 */
function convertMessages(
  messages: Array<{
    role: string;
    content: string;
    tool_call_id?: string;
    name?: string;
  }>,
): PromptParams['messages'] {
  return messages.map((m) => ({
    role: m.role as PromptParams['messages'][number]['role'],
    content: m.content,
    ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    ...(m.name ? { name: m.name } : {}),
  }));
}

/**
 * Handle a chat-stream port connection from the side panel.
 * Routes every prompt through ProviderManager so the active configured
 * adapter handles the stream.
 */
export async function handleChatStream(port: chrome.runtime.Port) {
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
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

        const streamTabId = msg.tabId ?? getCachedActiveTabId() ?? (await getActiveTabId());
        setCachedActiveTabId(streamTabId);

        const params: PromptParams = {
          model: msg.model || '',
          messages: convertMessages(msg.messages || []),
          tools: getAdapterTools(),
          stream: true,
        };

        try {
          await sendChatPrompt(
            params,
            {
              onTextDelta: (text: string) => {
                if (!disposed) port.postMessage({ type: 'chat:delta', text });
              },
              onReasoningDelta: (text: string) => {
                if (!disposed) port.postMessage({ type: 'chat:reasoning', text });
              },
              onToolStart: (toolCallId: string, name: string) => {
                console.log(`[SW] 🔧 Tool start: ${name} (id: ${toolCallId})`);
                if (streamTabId) {
                  chrome.tabs
                    .sendMessage(streamTabId, { type: 'indicator:show' })
                    .catch(() => {});
                  chrome.tabs
                    .sendMessage(streamTabId, {
                      type: 'indicator:action',
                      action: name,
                      text: `Performing ${name}`,
                    })
                    .catch(() => {});
                }
                if (!disposed) port.postMessage({ type: 'chat:toolStart', name });
              },
              onToolEnd: (name: string, result?: any, error?: string) => {
                console.log(`[SW] 🔧 Tool end: ${name} (error: ${error || ''})`);
                if (streamTabId) {
                  chrome.tabs
                    .sendMessage(streamTabId, { type: 'indicator:hide_action' })
                    .catch(() => {});
                }
                if (!disposed) port.postMessage({ type: 'chat:toolEnd', name, result, error });
              },
              onError: (err: string) => {
                console.error('[SW] ❌ Stream error:', err);
                if (!disposed) port.postMessage({ type: 'chat:error', error: err });
                dispose();
              },
              onDone: () => {
                console.log('[SW] ✅ Stream done');
                if (!disposed) port.postMessage({ type: 'chat:result' });
                dispose();
              },
            },
            streamTabId ?? undefined,
            // onContinuePrompt: ask user via port
            async (): Promise<boolean> => {
              if (disposed) return false;
              port.postMessage({ type: 'chat:continuePrompt' });
              return new Promise<boolean>((resolve) => {
                const handler = (msg: any) => {
                  if (msg.type === 'chat:continueResponse') {
                    port.onMessage.removeListener(handler);
                    resolve(msg.continue === true);
                  }
                };
                port.onMessage.addListener(handler);
              });
            },
          );
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error('[SW] Chat stream error:', errMsg);
          if (!disposed) port.postMessage({ type: 'chat:error', error: errMsg });
          dispose();
        }
        break;
      }

      case 'chat:stop': {
        dispose();
        break;
      }

      default:
        console.warn('[SW] Unknown chat-stream message:', msg.type);
    }
  });

  port.onDisconnect.addListener(() => dispose());
}
