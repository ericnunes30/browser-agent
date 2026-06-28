/* ------------------------------------------------------------------ */
/*  Ollama adapter tests                                              */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaAdapter } from '../ollama-adapter';
import type { ProviderEndpoint } from '../../types';

const baseEndpoint: ProviderEndpoint = {
  id: 'ollama-local',
  type: 'ollama',
  label: 'Ollama',
  baseUrl: 'http://localhost:11434',
  authType: 'none',
  apiKey: '',
  enabled: true,
  modelsSource: 'auto',
  createdAt: 0,
  updatedAt: 0,
};

function createJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Internal Server Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
    body: null,
  } as unknown as Response;
}

function createErrorResponse(status: number, bodyText: string): Response {
  return {
    ok: false,
    status,
    statusText: 'Internal Server Error',
    json: async () => {
      throw new Error('Invalid JSON');
    },
    text: async () => bodyText,
    body: null,
  } as unknown as Response;
}

function createNdjsonResponse(lines: string[]): Response {
  const chunks = lines.map((line) => `${line}\n`);
  let index = 0;

  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body: {
      getReader: () => ({
        read: async () => {
          if (index >= chunks.length) {
            return { done: true, value: undefined };
          }
          const value = new TextEncoder().encode(chunks[index]);
          index += 1;
          return { done: false, value };
        },
        releaseLock: () => {},
      }),
    },
  } as unknown as Response;
}

describe('OllamaAdapter', () => {
  let adapter: OllamaAdapter;

  beforeEach(() => {
    adapter = new OllamaAdapter();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('listModels', () => {
    it('returns ModelInfo entries for each Ollama model', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        createJsonResponse({
          models: [{ name: 'llama3:latest', size: 1000 }, { name: 'phi3' }],
        }),
      );

      const models = await adapter.listModels(baseEndpoint);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(models).toHaveLength(2);
      expect(models[0]).toMatchObject({
        id: 'llama3:latest',
        name: 'llama3:latest',
        providerId: 'ollama-local',
        providerLabel: 'Ollama',
        capabilities: { streaming: true, tools: true, vision: false },
      });
    });

    it('normalizes a /v1 base URL when listing models', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        createJsonResponse({ models: [{ name: 'llama3:latest' }] }),
      );

      await adapter.listModels({ ...baseEndpoint, baseUrl: 'http://localhost:11434/v1' });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('falls back to the `model` field when `name` is missing', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        createJsonResponse({
          models: [{ model: 'minimax-m3:cloud' }, { name: 'kimi-k2.7-code:cloud' }],
        }),
      );

      const models = await adapter.listModels(baseEndpoint);

      expect(models).toHaveLength(2);
      expect(models[0]).toMatchObject({
        id: 'minimax-m3:cloud',
        name: 'minimax-m3:cloud',
      });
      expect(models[1]).toMatchObject({
        id: 'kimi-k2.7-code:cloud',
        name: 'kimi-k2.7-code:cloud',
      });
    });

    it('reads both `name` and `model` fields for cloud Ollama models', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        createJsonResponse({
          models: [
            { name: 'minimax-m3:cloud', model: 'minimax-m3:cloud', size: 100 },
            { name: 'kimi-k2.7-code:cloud', model: 'kimi-k2.7-code:cloud', size: 100 },
          ],
        }),
      );

      const models = await adapter.listModels(baseEndpoint);

      expect(models).toHaveLength(2);
      expect(models.map((m) => m.id)).toEqual([
        'minimax-m3:cloud',
        'kimi-k2.7-code:cloud',
      ]);
      expect(models[0]).toMatchObject({
        id: 'minimax-m3:cloud',
        name: 'minimax-m3:cloud',
        providerId: 'ollama-local',
        providerLabel: 'Ollama',
        capabilities: { streaming: true, tools: true, vision: false },
      });
      expect(models[1]).toMatchObject({
        id: 'kimi-k2.7-code:cloud',
        name: 'kimi-k2.7-code:cloud',
        providerId: 'ollama-local',
        providerLabel: 'Ollama',
        capabilities: { streaming: true, tools: true, vision: false },
      });
    });

    it('skips entries that have neither `name` nor `model`', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        createJsonResponse({
          models: [
            { name: 'llama3:latest' },
            { size: 100 },
            { name: '', model: '', size: 100 },
          ],
        }),
      );

      const models = await adapter.listModels(baseEndpoint);

      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('llama3:latest');
    });

    it('throws a normalized error when the API fails', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        createErrorResponse(500, 'Internal Server Error'),
      );

      await expect(adapter.listModels(baseEndpoint)).rejects.toThrow(
        'HTTP 500: Server error',
      );
    });
  });

  describe('testConnection', () => {
    it('returns ok and latency when Ollama is reachable', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(createJsonResponse({}));

      const result = await adapter.testConnection(baseEndpoint);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      }
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('returns an error message when the API responds with an error', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        createErrorResponse(401, 'Unauthorized'),
      );

      const result = await adapter.testConnection(baseEndpoint);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('HTTP 401');
      }
    });

    it('returns a timeout error when the request aborts', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValueOnce(
        new DOMException('The operation was aborted', 'AbortError'),
      );

      const result = await adapter.testConnection(baseEndpoint);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Connection timed out');
      }
    });
  });

  describe('sendPrompt', () => {
    it('streams NDJSON chunks and calls onDone when finished', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        createNdjsonResponse([
          JSON.stringify({ message: { role: 'assistant', content: 'Hello' } }),
          JSON.stringify({ message: { role: 'assistant', content: ' world' } }),
          JSON.stringify({ done: true }),
        ]),
      );

      const onTextDelta = vi.fn();
      const onDone = vi.fn();
      const onError = vi.fn();

      await adapter.sendPrompt(
        baseEndpoint,
        {
          model: 'llama3',
          messages: [{ role: 'user', content: 'Hi' }],
          temperature: 0.7,
          maxTokens: 128,
        },
        { onTextDelta, onDone, onError },
      );

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"model":"llama3"'),
        }),
      );
      expect(onTextDelta).toHaveBeenCalledTimes(2);
      expect(onTextDelta).toHaveBeenNthCalledWith(1, 'Hello');
      expect(onTextDelta).toHaveBeenNthCalledWith(2, ' world');
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    });

    it('strips a /v1 suffix and calls /api/chat', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        createNdjsonResponse([JSON.stringify({ done: true })]),
      );

      const onTextDelta = vi.fn();
      const onDone = vi.fn();
      const onError = vi.fn();

      await adapter.sendPrompt(
        { ...baseEndpoint, baseUrl: 'http://localhost:11434/v1' },
        {
          model: 'llama3',
          messages: [{ role: 'user', content: 'Hi' }],
          temperature: 0.7,
          maxTokens: 128,
        },
        { onTextDelta, onDone, onError },
      );

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    });

    it('calls onError and onDone when the chat request fails', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        createErrorResponse(500, 'Server Error'),
      );

      const onTextDelta = vi.fn();
      const onDone = vi.fn();
      const onError = vi.fn();

      await adapter.sendPrompt(
        baseEndpoint,
        { model: 'llama3', messages: [{ role: 'user', content: 'Hi' }] },
        { onTextDelta, onDone, onError },
      );

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toContain('HTTP 500');
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onTextDelta).not.toHaveBeenCalled();
    });

    it('calls onError with CORS instructions when the chat request returns 403', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        createErrorResponse(403, 'Forbidden'),
      );

      const onTextDelta = vi.fn();
      const onDone = vi.fn();
      const onError = vi.fn();

      await adapter.sendPrompt(
        baseEndpoint,
        { model: 'llama3', messages: [{ role: 'user', content: 'Hi' }] },
        { onTextDelta, onDone, onError },
      );

      expect(onError).toHaveBeenCalledTimes(1);
      const errorMessage = onError.mock.calls[0][0] as string;
      expect(errorMessage).toContain('HTTP 403');
      expect(errorMessage).toContain('OLLAMA_ORIGINS');
      expect(errorMessage).toContain('chrome-extension://*');
      expect(errorMessage).toContain('ollama serve');
      expect(errorMessage).toMatch(/Windows/);
      expect(errorMessage).toMatch(/macOS \/ Linux/);
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onTextDelta).not.toHaveBeenCalled();
    });

    it('sends tools in the request body when provided', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        createNdjsonResponse([JSON.stringify({ done: true })]),
      );

      const onTextDelta = vi.fn();
      const onDone = vi.fn();
      const onError = vi.fn();

      const tools = [
        {
          name: 'get_weather',
          description: 'Get the current weather',
          parameters: { type: 'object', properties: { location: { type: 'string' } } },
        },
      ];

      await adapter.sendPrompt(
        baseEndpoint,
        {
          model: 'llama3',
          messages: [{ role: 'user', content: 'How is the weather?' }],
          tools,
        },
        { onTextDelta, onDone, onError },
      );

      const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
      const body = JSON.parse((fetchCall[1] as any).body);
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0]).toMatchObject({
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the current weather',
          parameters: { type: 'object', properties: { location: { type: 'string' } } },
        },
      });
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    });

    it('parses tool calls from NDJSON response and invokes onToolStart/onToolEnd', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        createNdjsonResponse([
          JSON.stringify({
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call-abc',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location":"NYC"}',
                  },
                },
              ],
            },
          }),
          JSON.stringify({ done: true }),
        ]),
      );

      const onTextDelta = vi.fn();
      const onDone = vi.fn();
      const onError = vi.fn();
      const onToolStart = vi.fn();
      const onToolEnd = vi.fn();

      await adapter.sendPrompt(
        baseEndpoint,
        {
          model: 'llama3',
          messages: [{ role: 'user', content: 'Get weather' }],
          tools: [
            {
              name: 'get_weather',
              description: 'Get weather',
              parameters: { type: 'object' },
            },
          ],
        },
        { onTextDelta, onDone, onError, onToolStart, onToolEnd },
      );

      expect(onToolStart).toHaveBeenCalledTimes(1);
      expect(onToolStart).toHaveBeenCalledWith('call-abc', 'get_weather', { location: 'NYC' });
      expect(onToolEnd).toHaveBeenCalledWith('get_weather', { location: 'NYC' });
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    });

    it('calls onError and onDone when fetch throws', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValueOnce(
        new Error('Network failure'),
      );

      const onTextDelta = vi.fn();
      const onDone = vi.fn();
      const onError = vi.fn();

      await adapter.sendPrompt(
        baseEndpoint,
        { model: 'llama3', messages: [{ role: 'user', content: 'Hi' }] },
        { onTextDelta, onDone, onError },
      );

      expect(onError).toHaveBeenCalledWith('Network failure');
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onTextDelta).not.toHaveBeenCalled();
    });
  });
});
