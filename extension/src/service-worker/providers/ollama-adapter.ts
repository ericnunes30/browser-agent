/* ------------------------------------------------------------------ */
/*  Ollama provider adapter                                           */
/* ------------------------------------------------------------------ */

import {
  buildAuthHeaders,
  buildBaseHeaders,
  normalizeError,
  parseNDJSON,
} from './http-helpers';
import type { ModelInfo, ProviderEndpoint } from './types';
import type {
  ContentPart,
  ProviderAdapter,
  PromptParams,
  StreamCallbacks,
} from './adapter';

function extractTextAndImages(content: string | ContentPart[] | undefined): { text: string; images: string[] } {
  if (!content) return { text: '', images: [] };
  if (typeof content === 'string') return { text: content, images: [] };

  const images: string[] = [];
  let text = '';
  for (const part of content) {
    if (part.type === 'text' && part.text) {
      text += part.text;
    } else if (part.type === 'image_url' && part.image_url?.url) {
      // Extract base64 from data URL or use URL directly
      const url = part.image_url.url;
      if (url.startsWith('data:')) {
        // data:image/png;base64,ABC123... → extract base64 part
        const base64Part = url.split(',')[1];
        if (base64Part) images.push(base64Part);
      } else {
        images.push(url);
      }
    }
  }
  return { text, images };
}

function pickModelId(model: { name?: string; model?: string }): string {
  // Some Ollama versions/cloud wrappers expose `model` instead of `name`,
  // or leave one of them empty. Use the first non-empty string we find.
  const name = typeof model.name === 'string' ? model.name.trim() : '';
  const modelField = typeof model.model === 'string' ? model.model.trim() : '';
  return name || modelField;
}

function buildOllamaCorsErrorMessage(response: Response, body?: string): string {
  const base = normalizeError(response, body);
  return (
    `${base}\n\n` +
    'Ollama rejected this request because of CORS/origin restrictions.\n\n' +
    'To allow this Chrome extension, restart Ollama with OLLAMA_ORIGINS set to chrome-extension://*.\n\n' +
    'Windows (run as Administrator to persist):\n' +
    '  scripts/diagnose-ollama-cors.ps1 -Persist\n\n' +
    'Or manually:\n' +
    '  set OLLAMA_ORIGINS=chrome-extension://* && ollama serve\n\n' +
    'macOS / Linux:\n' +
    '  OLLAMA_ORIGINS=chrome-extension://* ollama serve'
  );
}

function normalizeOllamaBaseUrl(url: string): string {
  let cleaned = url.trim();
  while (cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }
  if (cleaned.toLowerCase().endsWith('/v1')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned;
}

export class OllamaAdapter implements ProviderAdapter {
  async listModels(endpoint: ProviderEndpoint): Promise<ModelInfo[]> {
    const headers: Record<string, string> = {
      ...buildBaseHeaders(),
      ...buildAuthHeaders(endpoint),
    };

    const baseUrl = normalizeOllamaBaseUrl(endpoint.baseUrl);
    const url = `${baseUrl}/api/tags`;
    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(normalizeError(response, body));
    }

    const data = (await response.json()) as {
      models?: Array<{ name?: string; model?: string; [key: string]: any }>;
    };
    const models = data.models ?? [];

    const result = models
      .map((model) => {
        const id = pickModelId(model);
        return {
          id,
          name: id,
          providerId: endpoint.id,
          providerLabel: endpoint.label,
          capabilities: {
            streaming: true,
            tools: true,
            vision: false,
          },
        };
      })
      .filter((model) => model.id.length > 0);

    if (result.length !== models.length) {
      console.warn(
        `[OllamaAdapter] ${url} returned ${models.length} entr` +
          `${models.length === 1 ? 'y' : 'ies'}; ${result.length} had a valid ` +
          `name/model id. Skipped ${models.length - result.length}.`,
      );
    }

    console.log(
      `[OllamaAdapter] ${url} returning ${result.length} model(s):`,
      result.map((m) => m.id),
    );

    return result;
  }

  async testConnection(
    endpoint: ProviderEndpoint,
  ): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }> {
    const headers: Record<string, string> = {
      ...buildBaseHeaders(),
      ...buildAuthHeaders(endpoint),
    };

    const controller = new AbortController();
    const timeoutMs = 10000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const start = performance.now();

    try {
      const baseUrl = normalizeOllamaBaseUrl(endpoint.baseUrl);
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      const latencyMs = Math.round(performance.now() - start);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        return { ok: false, error: normalizeError(response, body) };
      }

      return { ok: true, latencyMs };
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - start);
      clearTimeout(timeoutId);
      return {
        ok: false,
        error: err?.name === 'AbortError' ? 'Connection timed out' : err?.message ?? 'Connection failed',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async sendPrompt(
    endpoint: ProviderEndpoint,
    params: PromptParams,
    callbacks: StreamCallbacks,
  ): Promise<void> {
    const headers: Record<string, string> = {
      ...buildBaseHeaders(),
      ...buildAuthHeaders(endpoint),
      // Note: we cannot set the Origin header from fetch(); the browser sends
      // null or chrome-extension://<id>. Ollama must allow those origins via
      // OLLAMA_ORIGINS=chrome-extension://*.
    };

    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages.map((message) => {
        const { text, images } = extractTextAndImages(message.content);
        const msg: Record<string, unknown> = {
          role: message.role,
          content: text,
        };
        // Ollama supports images via the 'images' field (base64 array)
        if (images.length > 0) {
          msg.images = images;
        }
        // Ollama tool_calls: arguments must be an object, not a JSON string
        if (message.tool_calls && message.tool_calls.length > 0) {
          msg.tool_calls = message.tool_calls.map((tc) => {
            let args: unknown = {};
            if (typeof tc.function.arguments === 'string' && tc.function.arguments.length > 0) {
              try {
                args = JSON.parse(tc.function.arguments);
              } catch {
                args = tc.function.arguments;
              }
            } else {
              args = tc.function.arguments;
            }
            return {
              id: tc.id,
              type: tc.type || 'function',
              function: {
                name: tc.function.name,
                arguments: args,
              },
            };
          });
        }
        return msg;
      }),
      stream: true,
      options: {
        temperature: params.temperature,
        num_predict: params.maxTokens,
      },
    };

    // Ollama supports OpenAI-compatible tool format via /api/chat
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

    let response: Response;
    try {
      const baseUrl = normalizeOllamaBaseUrl(endpoint.baseUrl);
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      callbacks.onError(err?.message ?? 'Failed to connect to Ollama');
      callbacks.onDone();
      return;
    }

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      if (response.status === 403) {
        callbacks.onError(buildOllamaCorsErrorMessage(response, responseBody));
      } else {
        callbacks.onError(normalizeError(response, responseBody));
      }
      callbacks.onDone();
      return;
    }

    try {
      const startedToolCalls = new Set<string>();

      for await (const chunk of parseNDJSON(response)) {
        if (chunk?.done) {
          break;
        }

        const message = chunk?.message;
        if (!message) continue;

        // Text content
        const content = message?.content;
        if (typeof content === 'string' && content.length > 0) {
          callbacks.onTextDelta(content);
        }

        // Tool calls (Ollama uses OpenAI-compatible format)
        const toolCalls = message?.tool_calls;
        if (Array.isArray(toolCalls)) {
          for (const toolCall of toolCalls) {
            const fn = toolCall?.function;
            if (!fn) continue;

            const id = toolCall?.id ?? `${fn.name}-${Date.now()}-${Math.random()}`;
            if (startedToolCalls.has(id)) continue;
            startedToolCalls.add(id);

            const name = fn.name ?? '';
            let args: unknown = {};
            if (typeof fn.arguments === 'string' && fn.arguments.length > 0) {
              try {
                args = JSON.parse(fn.arguments);
              } catch {
                args = fn.arguments;
              }
            } else if (typeof fn.arguments === 'object') {
              args = fn.arguments;
            }

            callbacks.onToolStart?.(id, name, args);
            callbacks.onToolEnd?.(name, args);
          }
        }
      }
    } catch (err: any) {
      callbacks.onError(err?.message ?? 'Stream error');
    } finally {
      callbacks.onDone();
    }
  }


}
