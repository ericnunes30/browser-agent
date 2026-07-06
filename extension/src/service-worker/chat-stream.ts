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
 * Convert the side-panel message history into the adapter's ChatMessage format.
 * Supports both string content and ContentPart arrays (for images).
 */
function convertMessages(
  messages: Array<{
    role: string;
    content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
    tool_call_id?: string;
    name?: string;
  }>,
): PromptParams['messages'] {
  return messages.map((m) => {
    // Content is already in the right format (string or ContentPart array)
    const content = m.content;
    const result: any = {
      role: m.role as PromptParams['messages'][number]['role'],
      content,
    };
    if (m.tool_call_id) result.tool_call_id = m.tool_call_id;
    if (m.name) result.name = m.name;
    return result;
  });
}

/**
 * Handle a chat-stream port connection from the side panel.
 * Routes every prompt through ProviderManager so the active configured
 * adapter handles the stream.
 */
export async function handleChatStream(port: chrome.runtime.Port) {
  let disposed = false;
  // AbortController fires when the user clicks Stop. The signal is
  // propagated into sendChatPrompt + every awaitable point (tool calls,
  // wait timers, continue prompt) so the loop actually unwinds instead
  // of running in the background after the side panel moves on.
  const abortController = new AbortController();
  const { signal } = abortController;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    abortController.abort();
    stopKeepAlive();
  };

  port.onMessage.addListener(async (msg: any) => {
    if (disposed) return;

    switch (msg.type) {
      case 'chat:send': {
        startKeepAlive();
        console.log(`[SW] 📨 chat:send received (messages: ${msg.messages?.length})`);

        const lastMsg = msg.messages?.[msg.messages?.length - 1];
        // Extract text from last message (string or ContentPart array)
        let promptText = '';
        let hasImages = false;
        if (typeof lastMsg?.content === 'string') {
          promptText = lastMsg.content;
        } else if (Array.isArray(lastMsg?.content)) {
          for (const part of lastMsg.content) {
            if (part.type === 'text') promptText += part.text ?? '';
            if (part.type === 'image_url') hasImages = true;
          }
        }
        // Allow empty text if there are images attached
        if (!promptText && !hasImages) {
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
              onToolStart: (toolCallId: string, name: string, args?: unknown) => {
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
                if (!disposed) port.postMessage({ type: 'chat:toolStart', name, args });
              },
              onToolEnd: (name: string, result?: any, error?: string) => {
                console.log(`[SW] 🔧 Tool end: ${name} (error: ${error || ''})`);
                if (streamTabId) {
                  chrome.tabs
                    .sendMessage(streamTabId, { type: 'indicator:hide_action' })
                    .catch(() => {});
                }
                const resultStr = result?.content ? String(result.content) : undefined;
                if (!disposed) port.postMessage({ type: 'chat:toolEnd', name, result: resultStr, error });
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
              if (disposed || signal.aborted) return false;
              port.postMessage({ type: 'chat:continuePrompt' });
              return new Promise<boolean>((resolve) => {
                const handler = (msg: any) => {
                  if (msg.type === 'chat:continueResponse') {
                    port.onMessage.removeListener(handler);
                    resolve(msg.continue === true);
                  }
                };
                port.onMessage.addListener(handler);
                // If aborted while waiting for the user's response, resolve false
                // so the loop exits cleanly.
                const abortHandler = () => {
                  port.onMessage.removeListener(handler);
                  resolve(false);
                };
                signal.addEventListener('abort', abortHandler, { once: true });
              });
            },
            signal,
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
