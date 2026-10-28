/* ------------------------------------------------------------------ */
/*  OpenAI / OpenAI-compatible provider adapter                       */
/* ------------------------------------------------------------------ */

import type { ProviderAdapter, PromptParams, StreamCallbacks } from './adapter';
import {
  buildAuthHeaders,
  buildBaseHeaders,
  buildOpencodeHeaders,
  normalizeError,
  parseSSE,
} from './http-helpers';
import type { ModelInfo, ProviderEndpoint, ProviderType } from './types';

const SUPPORTED_TYPES: Set<ProviderType> = new Set(['openai', 'openai-compatible']);

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function isSupported(endpoint: ProviderEndpoint): boolean {
  return SUPPORTED_TYPES.has(endpoint.type);
}

function buildHeaders(endpoint: ProviderEndpoint): Record<string, string> {
  return { ...buildBaseHeaders(), ...buildAuthHeaders(endpoint), ...buildOpencodeHeaders(endpoint) };
}

export class OpenAIAdapter implements ProviderAdapter {
  async listModels(endpoint: ProviderEndpoint): Promise<ModelInfo[]> {
    if (!isSupported(endpoint)) {
      throw new Error(`Unsupported provider type: ${endpoint.type}`);
    }

    const baseUrl = normalizeBaseUrl(endpoint.baseUrl);
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: buildHeaders(endpoint),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(normalizeError(response, body));
    }

    const json = (await response.json().catch(() => ({}))) as {
      data?: Array<{ id?: string }>;
    };
    const data = Array.isArray(json.data) ? json.data : [];

    return data.map((model) => {
      const id = String(model.id ?? '');
      const isVision =
        id.includes('vision') || id.toLowerCase().includes('gpt-4o');

      return {
        id,
        name: id,
        providerId: endpoint.id,
        providerLabel: endpoint.label,
        capabilities: {
          vision: isVision,
          tools: true,
          streaming: true,
        },
      };
    });
  }

  async testConnection(
    endpoint: ProviderEndpoint,
  ): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }> {
    if (!isSupported(endpoint)) {
      return { ok: false, error: `Unsupported provider type: ${endpoint.type}` };
    }

    const baseUrl = normalizeBaseUrl(endpoint.baseUrl);
    const url = `${baseUrl}/models`;
    const headers = buildHeaders(endpoint);
    const start = Date.now();

    try {
      const response = (await Promise.race([
        fetch(url, { method: 'GET', headers }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timed out after 10s')), 10000),
        ),
      ])) as Response;

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        return { ok: false, error: normalizeError(response, body) };
      }

      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async sendPrompt(
    endpoint: ProviderEndpoint,
    params: PromptParams,
    callbacks: StreamCallbacks,
  ): Promise<void> {
    if (!isSupported(endpoint)) {
      callbacks.onError(`Unsupported provider type: ${endpoint.type}`);
      callbacks.onDone();
      return;
    }

    const baseUrl = normalizeBaseUrl(endpoint.baseUrl);
    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
      stream: true,
    };

    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
    }

    if (params.temperature !== undefined) {
      body.temperature = params.temperature;
    }

    if (params.maxTokens !== undefined) {
      body.max_tokens = params.maxTokens;
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: buildHeaders(endpoint),
        body: JSON.stringify(body),
      });
    } catch (err) {
      callbacks.onError(err instanceof Error ? err.message : String(err));
      callbacks.onDone();
      return;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      callbacks.onError(
        `${normalizeError(response, body)}\n(model "${params.model}" on "${endpoint.label}" — check the id in Options → Inspect Raw, or pick another model)`,
      );
      callbacks.onDone();
      return;
    }

    // Tool call arguments stream in fragments: the first delta usually carries
    // only id/name with empty arguments, and the JSON arrives piecemeal after
    // that. Accumulate per call id and announce only once the arguments parse,
    // so the UI and the tool loop see complete args instead of {}.
    const pendingCalls = new Map<string, { name: string; argsText: string; argsObj: unknown; fired: boolean }>();

    const fireToolStart = (id: string, force: boolean) => {
      const entry = pendingCalls.get(id);
      if (!entry || entry.fired || !entry.name) return;
      let args: unknown;
      let ready = false;
      if (entry.argsObj !== undefined) {
        args = entry.argsObj;
        ready = true;
      } else if (entry.argsText) {
        try {
          args = JSON.parse(entry.argsText);
          ready = typeof args !== 'object' || args === null || Object.keys(args).length > 0 || force;
        } catch {
          if (!force) return; // wait for more fragments
          args = entry.argsText;
          ready = true;
        }
      } else if (force) {
        args = {};
        ready = true;
      } else {
        return;
      }
      if (!ready) return;
      entry.fired = true;
      callbacks.onToolStart?.(id, entry.name, args);
    };

    const flushToolStarts = () => {
      for (const id of pendingCalls.keys()) fireToolStart(id, true);
    };

    try {
      for await (const event of parseSSE(response)) {
        if (event.data === '[DONE]') {
          flushToolStarts();
          callbacks.onDone();
          return;
        }

        let chunk: unknown;
        try {
          chunk = JSON.parse(event.data);
        } catch {
          continue;
        }

        const choice = (chunk as any)?.choices?.[0];
        const delta = choice?.delta;

        if (delta?.content != null) {
          callbacks.onTextDelta(String(delta.content));
        }

        if (Array.isArray(delta?.tool_calls)) {
          for (const toolCall of delta.tool_calls) {
            const id = toolCall?.id;
            if (!id) continue;
            let entry = pendingCalls.get(id);
            if (!entry) {
              entry = { name: '', argsText: '', argsObj: undefined, fired: false };
              pendingCalls.set(id, entry);
            }
            if (toolCall?.function?.name) entry.name = toolCall.function.name;
            const frag = toolCall?.function?.arguments;
            if (typeof frag === 'string') entry.argsText += frag;
            else if (frag !== undefined && frag !== null && typeof frag === 'object') entry.argsObj = frag;
            fireToolStart(id, false);
          }
        }

        const finishReason = choice?.finish_reason;
        if (finishReason === 'stop') {
          flushToolStarts();
          callbacks.onDone();
          return;
        }

        if (finishReason === 'tool_calls') {
          flushToolStarts();
          callbacks.onToolEnd?.('', undefined, undefined);
          callbacks.onDone();
          return;
        }
      }

      callbacks.onDone();
    } catch (err) {
      callbacks.onError(err instanceof Error ? err.message : String(err));
      callbacks.onDone();
    }
  }
}
