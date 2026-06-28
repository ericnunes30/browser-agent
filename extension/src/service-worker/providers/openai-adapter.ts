/* ------------------------------------------------------------------ */
/*  OpenAI / OpenAI-compatible provider adapter                       */
/* ------------------------------------------------------------------ */

import type { ProviderAdapter, PromptParams, StreamCallbacks } from './adapter';
import {
  buildAuthHeaders,
  buildBaseHeaders,
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
  return { ...buildBaseHeaders(), ...buildAuthHeaders(endpoint) };
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
      callbacks.onError(normalizeError(response, body));
      callbacks.onDone();
      return;
    }

    const startedToolCalls = new Set<string>();

    try {
      for await (const event of parseSSE(response)) {
        if (event.data === '[DONE]') {
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
            if (!id || startedToolCalls.has(id)) continue;

            startedToolCalls.add(id);
            const name = toolCall?.function?.name ?? '';
            let args: unknown = {};
            const argString = toolCall?.function?.arguments;
            if (typeof argString === 'string' && argString.length > 0) {
              try {
                args = JSON.parse(argString);
              } catch {
                args = argString;
              }
            }
            callbacks.onToolStart?.(id, name, args);
          }
        }

        const finishReason = choice?.finish_reason;
        if (finishReason === 'stop') {
          callbacks.onDone();
          return;
        }

        if (finishReason === 'tool_calls') {
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
