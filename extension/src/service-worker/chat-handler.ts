/* ─── Chat handler — direct API fallback + NativeBridge prompt ── */
import { getNativeBridge } from './bridge-singleton';
import { startKeepAlive, stopKeepAlive } from './keep-alive';

/**
 * Direct API call without Pi SDK (fallback).
 * Only supports text chat — no tools, no tool execution.
 */
export async function directChat(
  providerId: string,
  modelId: string,
  messages: Array<{ role: string; content: string }>,
): Promise<{ content: string; reasoning?: string }> {
  const defaultUrl = chrome.runtime.getURL('config/models.default.json');
  const customUrl = chrome.runtime.getURL('config/models.custom.json');

  const [defaultResp, customResp] = await Promise.allSettled([
    fetch(defaultUrl).then(r => r.json()),
    fetch(customUrl).then(r => r.json()),
  ]);

  let config: any = null;
  if (customResp.status === 'fulfilled' && customResp.value?.providers?.[providerId]) {
    config = customResp.value.providers[providerId];
  }
  if (!config && defaultResp.status === 'fulfilled' && defaultResp.value?.providers?.[providerId]) {
    config = defaultResp.value.providers[providerId];
  }
  if (!config) throw new Error(`Provider "${providerId}" not found in models config files.`);

  const { api: apiType, apiKey, baseUrl, authHeader: authHeaderFlag } = config;
  const authHeader = authHeaderFlag !== false;
  if (!apiKey) throw new Error(`API key not configured for "${providerId}".`);
  if (!baseUrl) throw new Error(`Base URL not configured for "${providerId}".`);
  if (!apiType) throw new Error(`API type not configured for "${providerId}".`);

  if (apiType === 'openai-completions') {
    const body = {
      model: modelId,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: 4096,
      stream: false,
    };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = `Bearer ${apiKey}`;

    const resp = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!resp.ok) throw new Error(`API error (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    const json = await resp.json() as any;
    const choice = json.choices?.[0];
    return { content: choice?.message?.content || '', reasoning: choice?.message?.reasoning_content || undefined };
  }

  if (apiType === 'anthropic-messages') {
    const body = {
      model: modelId,
      max_tokens: 4096,
      messages: messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    };
    const resp = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`API error (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    const json = await resp.json() as any;
    return { content: json.content?.[0]?.text || '' };
  }

  throw new Error(`Unsupported API type: ${apiType}`);
}

/**
 * Handle a chat:send message — uses NativeBridge or falls back to direct API.
 */
export async function handleChatSend(msg: any, _sender: chrome.runtime.MessageSender): Promise<any> {
  startKeepAlive();
  try {
    const { model: modelId, messages } = msg;
    if (!messages || messages.length === 0) return { type: 'done', content: '' };

    const lastMessage = messages[messages.length - 1];
    const bridge = getNativeBridge();

    if (bridge.isHostAvailable) {
      console.log('[SW] handleChatSend using NativeBridge');
      const result = await bridge.promptAndWait(lastMessage.content);
      return { type: 'done', content: result.content, reasoning: result.reasoning };
    }

    console.log('[SW] handleChatSend using direct API (fallback)');
    const result = await directChat(msg.provider || 'openai', modelId || 'gpt-4o', messages);
    return { type: 'done', content: result.content, reasoning: result.reasoning };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[SW] handleChatSend error:', errMsg);
    return { type: 'error', content: `Error: ${errMsg}` };
  } finally {
    stopKeepAlive();
  }
}
