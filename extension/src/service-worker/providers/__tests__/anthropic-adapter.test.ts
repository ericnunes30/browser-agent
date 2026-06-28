import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicAdapter } from '../anthropic-adapter';
import type { ProviderEndpoint } from '../types';

function createEndpoint(overrides: Partial<ProviderEndpoint> = {}): ProviderEndpoint {
  return {
    id: 'anthropic-test',
    type: 'anthropic',
    label: 'Anthropic Test',
    baseUrl: 'https://api.anthropic.com/v1',
    authType: 'bearer',
    apiKey: 'test-api-key',
    enabled: true,
    modelsSource: 'auto',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function createJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status === 200,
    status,
    statusText: status === 200 ? 'OK' : 'Unauthorized',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function createSSEResponse(events: string[]): Response {
  const body = events.join('');
  const encoder = new TextEncoder();
  const bytes = encoder.encode(body);
  let done = false;

  const reader = {
    read: async () => {
      if (done) return { done: true as const, value: undefined };
      done = true;
      return { done: false as const, value: bytes };
    },
    releaseLock: vi.fn(),
    cancel: vi.fn(),
  };

  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body: { getReader: () => reader },
  } as unknown as Response;
}

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new AnthropicAdapter();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('listModels', () => {
    it('returns parsed models with capabilities', async () => {
      fetchMock.mockResolvedValue(
        createJsonResponse({
          data: [
            { id: 'claude-3-opus-20240229', display_name: 'Claude 3 Opus' },
            { id: 'claude-2.1' },
          ],
        }),
      );

      const endpoint = createEndpoint();
      const models = await adapter.listModels(endpoint);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models',
        expect.any(Object),
      );

      const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
      const headers = requestInit.headers as Record<string, string>;
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers.Authorization).toBe('Bearer test-api-key');

      expect(models).toHaveLength(2);
      expect(models[0]).toEqual({
        id: 'claude-3-opus-20240229',
        name: 'claude-3-opus-20240229',
        providerId: 'anthropic-test',
        providerLabel: 'Anthropic Test',
        capabilities: { vision: true, tools: true, streaming: true },
      });
      expect(models[1].capabilities.vision).toBe(false);
      expect(models[1].capabilities.tools).toBe(true);
      expect(models[1].capabilities.streaming).toBe(true);
    });

    it('throws on HTTP error', async () => {
      fetchMock.mockResolvedValue(
        createJsonResponse({ error: { message: 'Invalid API key' } }, 401),
      );

      await expect(adapter.listModels(createEndpoint())).rejects.toThrow(
        'HTTP 401',
      );
    });
  });

  describe('testConnection', () => {
    it('returns ok and latency on success', async () => {
      fetchMock.mockResolvedValue(createJsonResponse({ data: [] }));

      const result = await adapter.testConnection(createEndpoint());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      }
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('returns error on failure', async () => {
      fetchMock.mockResolvedValue(
        createJsonResponse({ error: { message: 'Invalid API key' } }, 401),
      );

      const result = await adapter.testConnection(createEndpoint());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('HTTP 401');
      }
    });
  });

  describe('sendPrompt', () => {
    it('streams text deltas and calls onDone', async () => {
      fetchMock.mockResolvedValue(
        createSSEResponse([
          sseEvent('message_start', {
            type: 'message_start',
            message: {
              id: 'msg_01',
              type: 'message',
              role: 'assistant',
              model: 'claude-3-5-sonnet-20241022',
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 10, output_tokens: 1 },
            },
          }),
          sseEvent('content_block_start', {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          }),
          sseEvent('content_block_delta', {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Hello' },
          }),
          sseEvent('content_block_delta', {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: ' world' },
          }),
          sseEvent('content_block_stop', {
            type: 'content_block_stop',
            index: 0,
          }),
          sseEvent('message_delta', {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: 2 },
          }),
          sseEvent('message_stop', { type: 'message_stop' }),
        ]),
      );

      const onTextDelta = vi.fn();
      const onDone = vi.fn();
      const onError = vi.fn();

      await adapter.sendPrompt(
        createEndpoint(),
        {
          model: 'claude-3-5-sonnet-20241022',
          messages: [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Say hello.' },
          ],
          temperature: 0.7,
          maxTokens: 1024,
        },
        { onTextDelta, onDone, onError },
      );

      expect(onTextDelta).toHaveBeenCalledTimes(2);
      expect(onTextDelta).toHaveBeenNthCalledWith(1, 'Hello');
      expect(onTextDelta).toHaveBeenNthCalledWith(2, ' world');
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.any(Object),
      );

      const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
      const headers = requestInit.headers as Record<string, string>;
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers.Authorization).toBe('Bearer test-api-key');

      const body = JSON.parse(requestInit.body as string);
      expect(body.model).toBe('claude-3-5-sonnet-20241022');
      expect(body.system).toBe('You are helpful.');
      expect(body.temperature).toBe(0.7);
      expect(body.max_tokens).toBe(1024);
      expect(body.stream).toBe(true);
      expect(body.messages).toEqual([
        { role: 'user', content: 'Say hello.' },
      ]);
    });
  });
});
