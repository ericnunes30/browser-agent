/* ------------------------------------------------------------------ */
/*  OpenAI adapter tests                                              */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIAdapter } from '../openai-adapter';
import type { ProviderEndpoint } from '../../types';

const adapter = new OpenAIAdapter();

const endpoint: ProviderEndpoint = {
  id: 'openai-test',
  type: 'openai',
  label: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  authType: 'bearer',
  apiKey: 'sk-test',
  enabled: true,
  modelsSource: 'auto',
  createdAt: 0,
  updatedAt: 0,
};

function createStreamResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;

  const reader = {
    async read() {
      if (index >= lines.length) {
        return { done: true, value: undefined };
      }
      return { done: false, value: encoder.encode(lines[index++]) };
    },
    releaseLock() {},
  };

  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body: { getReader: () => reader },
    headers: new Headers({ 'content-type': 'text/event-stream' }),
  } as unknown as Response;
}

describe('OpenAIAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('listModels', () => {
    it('returns parsed models with default capabilities', async () => {
      (fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              { id: 'gpt-4o' },
              { id: 'gpt-4-vision-preview' },
              { id: 'gpt-3.5-turbo' },
            ],
          }),
          { status: 200 },
        ),
      );

      const models = await adapter.listModels(endpoint);

      expect(models).toHaveLength(3);
      expect(models[0]).toEqual({
        id: 'gpt-4o',
        name: 'gpt-4o',
        providerId: endpoint.id,
        providerLabel: endpoint.label,
        capabilities: { vision: true, tools: true, streaming: true },
      });
      expect(models[1].capabilities.vision).toBe(true);
      expect(models[2].capabilities.vision).toBe(false);
    });

    it('throws a normalized error on failure', async () => {
      (fetch as any).mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Bad key' } }), {
          status: 401,
        }),
      );

      await expect(adapter.listModels(endpoint)).rejects.toThrow(
        /HTTP 401/,
      );
    });
  });

  describe('testConnection', () => {
    it('returns ok and latency on success', async () => {
      (fetch as any).mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );

      const result = await adapter.testConnection(endpoint);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('returns ok:false with an error message on failure', async () => {
      (fetch as any).mockResolvedValue(
        new Response('Internal server error', { status: 500 }),
      );

      const result = await adapter.testConnection(endpoint);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/HTTP 500/);
      }
    });
  });

  describe('sendPrompt', () => {
    it('streams text deltas and calls onDone', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"},"index":0}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"},"index":0}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      ];
      (fetch as any).mockResolvedValue(createStreamResponse(chunks));

      const onTextDelta = vi.fn();
      const onDone = vi.fn();
      const onError = vi.fn();

      await adapter.sendPrompt(
        endpoint,
        {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'hi' }],
        },
        { onTextDelta, onDone, onError },
      );

      expect(onTextDelta).toHaveBeenCalledTimes(2);
      expect(onTextDelta).toHaveBeenNthCalledWith(1, 'Hello');
      expect(onTextDelta).toHaveBeenNthCalledWith(2, ' world');
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    });

    it('detects tool calls and emits tool start/end callbacks', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"computer","arguments":""}}]},"index":0}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}}]},"index":0}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      ];
      (fetch as any).mockResolvedValue(createStreamResponse(chunks));

      const onToolStart = vi.fn();
      const onToolEnd = vi.fn();
      const onDone = vi.fn();
      const onError = vi.fn();

      await adapter.sendPrompt(
        endpoint,
        {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'click the button' }],
          tools: [
            {
              name: 'computer',
              description: 'Control the browser',
              parameters: { type: 'object', properties: {} },
            },
          ],
        },
        { onTextDelta: vi.fn(), onToolStart, onToolEnd, onDone, onError },
      );

      expect(onToolStart).toHaveBeenCalledTimes(1);
      expect(onToolStart).toHaveBeenCalledWith(
        'call_1',
        'computer',
        expect.any(Object),
      );
      expect(onToolEnd).toHaveBeenCalledTimes(1);
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    });
  });
});
