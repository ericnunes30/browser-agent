/* ------------------------------------------------------------------ */
/*  ProviderManager tests                                             */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadProviderConfig,
  saveProviderConfig,
  getActiveProviderId,
  setActiveProviderId,
} from '../options/provider-config';
import type { CustomModelEntry, ProviderEndpoint, StoredProviderConfig } from './providers/types';
import { ChromeMock, setupChromeMock, clearChromeMock } from './__tests__/chrome-mock';

async function importManager() {
  const { ProviderManager } = await import('./provider-manager');
  return ProviderManager.getInstance();
}

function createEndpoint(
  overrides: Partial<ProviderEndpoint> = {},
): ProviderEndpoint {
  return {
    id: 'test-provider',
    type: 'openai',
    label: 'Test Provider',
    baseUrl: 'https://api.test.com/v1',
    authType: 'bearer',
    apiKey: 'sk-test',
    enabled: true,
    modelsSource: 'auto',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

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

describe('ProviderManager', () => {
  let mock: ChromeMock;

  beforeEach(() => {
    mock = new ChromeMock();
    setupChromeMock(mock);
    vi.stubGlobal('fetch', vi.fn());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearChromeMock();
  });

  describe('getConfig', () => {
    it('returns the stored provider configuration', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [createEndpoint()],
      };
      mock.storageLocal['ba-provider-config'] = stored;

      const manager = await importManager();
      const config = await manager.getConfig();

      expect(config.providers).toHaveLength(1);
      expect(config.providers[0].id).toBe('test-provider');
    });
  });

  describe('saveConfig', () => {
    it('saves a valid configuration and returns ok:true', async () => {
      const manager = await importManager();
      const config: StoredProviderConfig = {
        version: 1,
        activeProviderId: 'test-provider',
        providers: [createEndpoint()],
      };

      const result = await manager.saveConfig(config);

      expect(result.ok).toBe(true);
      const stored = await loadProviderConfig();
      expect(stored.providers[0].id).toBe('test-provider');
    });

    it('returns ok:false when active provider does not exist', async () => {
      const manager = await importManager();
      const config: StoredProviderConfig = {
        version: 1,
        activeProviderId: 'missing',
        providers: [createEndpoint()],
      };

      const result = await manager.saveConfig(config);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/missing/);
      }
    });
  });

  describe('listModels', () => {
    it('lists models for a specific provider via adapter', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [createEndpoint()],
      };
      mock.storageLocal['ba-provider-config'] = stored;

      (fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'gpt-3.5-turbo' }] }),
          { status: 200 },
        ),
      );

      const manager = await importManager();
      const result = await manager.listModels('test-provider');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.models).toHaveLength(2);
        expect(result.models[0].providerId).toBe('test-provider');
      }
    });

    it('uses manual models when provider is configured for manual source', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [
          createEndpoint({
            id: 'manual-provider',
            modelsSource: 'manual',
            manualModels: ['custom-model-1', 'custom-model-2'],
          }),
        ],
      };
      mock.storageLocal['ba-provider-config'] = stored;

      const manager = await importManager();
      const result = await manager.listModels('manual-provider');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.models.map((m) => m.id)).toEqual([
          'custom-model-1',
          'custom-model-2',
        ]);
      }
    });

    it('merges custom models for the provider', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [createEndpoint({ id: 'custom-provider' })],
      };
      mock.storageLocal['ba-provider-config'] = stored;
      mock.storageLocal['ba-custom-models'] = [
        {
          id: 'cm-1',
          providerId: 'custom-provider',
          modelId: 'discovered-override',
          name: 'Custom Override',
          capabilities: { vision: true, tools: false, streaming: true },
          createdAt: 1,
        },
        {
          id: 'cm-2',
          providerId: 'custom-provider',
          modelId: 'extra-model',
          name: 'Extra Model',
          capabilities: { vision: false, tools: true, streaming: true },
          createdAt: 2,
        },
      ] as CustomModelEntry[];

      (fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ id: 'discovered-override' }, { id: 'other-model' }] }),
          { status: 200 },
        ),
      );

      const manager = await importManager();
      const result = await manager.listModels('custom-provider');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const ids = result.models.map((m) => m.id).sort();
        expect(ids).toEqual(['discovered-override', 'extra-model', 'other-model']);

        const overridden = result.models.find((m) => m.id === 'discovered-override')!;
        expect(overridden.name).toBe('Custom Override');
        expect(overridden.capabilities).toEqual({
          vision: true,
          tools: false,
          streaming: true,
        });

        const extra = result.models.find((m) => m.id === 'extra-model')!;
        expect(extra.name).toBe('Extra Model');
        expect(extra.capabilities).toEqual({
          vision: false,
          tools: true,
          streaming: true,
        });
      }
    });

    it('merges custom models with manual source providers', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [
          createEndpoint({
            id: 'manual-provider',
            modelsSource: 'manual',
            manualModels: ['manual-a', 'manual-b'],
          }),
        ],
      };
      mock.storageLocal['ba-provider-config'] = stored;
      mock.storageLocal['ba-custom-models'] = [
        {
          id: 'cm-3',
          providerId: 'manual-provider',
          modelId: 'manual-a',
          name: 'Renamed Manual A',
          capabilities: { vision: true, tools: true, streaming: false },
          createdAt: 3,
        },
        {
          id: 'cm-4',
          providerId: 'manual-provider',
          modelId: 'manual-c',
          createdAt: 4,
        },
      ] as CustomModelEntry[];

      const manager = await importManager();
      const result = await manager.listModels('manual-provider');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const ids = result.models.map((m) => m.id).sort();
        expect(ids).toEqual(['manual-a', 'manual-b', 'manual-c']);

        const renamed = result.models.find((m) => m.id === 'manual-a')!;
        expect(renamed.name).toBe('Renamed Manual A');
        expect(renamed.capabilities.streaming).toBe(false);

        const added = result.models.find((m) => m.id === 'manual-c')!;
        expect(added.name).toBe('manual-c');
      }
    });

    it('surfaces custom models when the provider adapter fails', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [createEndpoint({ id: 'failing-provider' })],
      };
      mock.storageLocal['ba-provider-config'] = stored;
      mock.storageLocal['ba-custom-models'] = [
        {
          id: 'cm-failing',
          providerId: 'failing-provider',
          modelId: 'custom-on-failing',
          name: 'Custom on Failing',
          capabilities: { vision: true, tools: true, streaming: true },
          createdAt: 7,
        },
      ] as CustomModelEntry[];

      (fetch as any).mockRejectedValue(new Error('network error'));

      const manager = await importManager();
      const result = await manager.listModels('failing-provider');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.models).toHaveLength(1);
        expect(result.models[0].id).toBe('custom-on-failing');
        expect(result.models[0].name).toBe('Custom on Failing');
        expect(result.models[0].providerId).toBe('failing-provider');
      }
    });

    it('aggregates custom models across enabled providers', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [
          createEndpoint({ id: 'agg-p1', baseUrl: 'https://agg1.test/v1', enabled: true }),
          createEndpoint({ id: 'agg-p2', baseUrl: 'https://agg2.test/v1', enabled: true }),
        ],
      };
      mock.storageLocal['ba-provider-config'] = stored;
      mock.storageLocal['ba-custom-models'] = [
        {
          id: 'cm-5',
          providerId: 'agg-p1',
          modelId: 'agg-p1-custom',
          name: 'P1 Custom',
          createdAt: 5,
        },
        {
          id: 'cm-6',
          providerId: 'agg-p2',
          modelId: 'agg-p2-custom',
          name: 'P2 Custom',
          createdAt: 6,
        },
      ] as CustomModelEntry[];

      (fetch as any).mockImplementation((url: string) => {
        if (url.includes('agg1')) {
          return new Response(JSON.stringify({ data: [{ id: 'agg-p1-auto' }] }), { status: 200 });
        }
        if (url.includes('agg2')) {
          return new Response(JSON.stringify({ data: [{ id: 'agg-p2-auto' }] }), { status: 200 });
        }
        return new Response('not found', { status: 404 });
      });

      const manager = await importManager();
      const result = await manager.listModels();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const ids = result.models.map((m) => m.id).sort();
        expect(ids).toEqual([
          'agg-p1-auto',
          'agg-p1-custom',
          'agg-p2-auto',
          'agg-p2-custom',
        ]);
      }
    });

    it('aggregates models from all enabled providers', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [
          createEndpoint({
            id: 'p1',
            baseUrl: 'https://p1.test/v1',
            enabled: true,
          }),
          createEndpoint({
            id: 'p2',
            baseUrl: 'https://p2.test/v1',
            enabled: true,
          }),
          createEndpoint({
            id: 'p3',
            baseUrl: 'https://p3.test/v1',
            enabled: false,
          }),
        ],
      };
      mock.storageLocal['ba-provider-config'] = stored;

      (fetch as any).mockImplementation((url: string) => {
        if (url.includes('p1')) {
          return new Response(JSON.stringify({ data: [{ id: 'model-p1' }] }), { status: 200 });
        }
        if (url.includes('p2')) {
          return new Response(JSON.stringify({ data: [{ id: 'model-p2' }] }), { status: 200 });
        }
        return new Response('not found', { status: 404 });
      });

      const manager = await importManager();
      const result = await manager.listModels();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.models).toHaveLength(2);
        expect(result.models.map((m) => m.id).sort()).toEqual(['model-p1', 'model-p2']);
      }
    });

    it('returns an error when an unknown provider is requested', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [createEndpoint()],
      };
      mock.storageLocal['ba-provider-config'] = stored;

      const manager = await importManager();
      const result = await manager.listModels('unknown-provider');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/unknown-provider/);
      }
    });
  });

  describe('testConnection', () => {
    it('returns latency on success', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [createEndpoint()],
      };
      mock.storageLocal['ba-provider-config'] = stored;

      (fetch as any).mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );

      const manager = await importManager();
      const result = await manager.testConnection('test-provider');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('returns error when provider is not found', async () => {
      const manager = await importManager();
      const result = await manager.testConnection('missing');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/missing/);
      }
    });
  });

  describe('getActiveProvider', () => {
    it('returns the configured active provider', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [createEndpoint({ id: 'active' })],
      };
      mock.storageLocal['ba-provider-config'] = stored;
      await setActiveProviderId('active');

      const manager = await importManager();
      const active = await manager.getActiveProvider();

      expect(active).not.toBeNull();
      expect(active!.id).toBe('active');
    });

    it('returns null when active provider is not set', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [createEndpoint({ id: 'enabled', enabled: true })],
      };
      mock.storageLocal['ba-provider-config'] = stored;
      await setActiveProviderId(null);

      const manager = await importManager();
      const active = await manager.getActiveProvider();

      expect(active).toBeNull();
    });

    it('returns null when active provider is missing', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [createEndpoint({ id: 'existing', enabled: true })],
      };
      mock.storageLocal['ba-provider-config'] = stored;
      await setActiveProviderId('missing');

      const manager = await importManager();
      const active = await manager.getActiveProvider();

      expect(active).toBeNull();
    });

    it('returns null when active provider is disabled', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [createEndpoint({ id: 'disabled', enabled: false })],
      };
      mock.storageLocal['ba-provider-config'] = stored;
      await setActiveProviderId('disabled');

      const manager = await importManager();
      const active = await manager.getActiveProvider();

      expect(active).toBeNull();
    });

    it('returns null when no providers are configured', async () => {
      const stored: StoredProviderConfig = { version: 1, providers: [] };
      mock.storageLocal['ba-provider-config'] = stored;

      const manager = await importManager();
      const active = await manager.getActiveProvider();

      expect(active).toBeNull();
    });
  });

  describe('setActiveProvider', () => {
    it('persists the active provider id', async () => {
      const manager = await importManager();
      await manager.setActiveProvider('my-provider');

      expect(await getActiveProviderId()).toBe('my-provider');
    });
  });

  describe('sendPrompt', () => {
    it('routes prompts to the correct adapter', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [createEndpoint({ id: 'openai-route' })],
      };
      mock.storageLocal['ba-provider-config'] = stored;
      await setActiveProviderId('openai-route');

      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hi"},"index":0}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      ];
      (fetch as any).mockResolvedValue(createStreamResponse(chunks));

      const manager = await importManager();
      const onTextDelta = vi.fn();
      const onDone = vi.fn();
      const onError = vi.fn();

      await manager.sendPrompt(
        {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'hello' }],
        },
        { onTextDelta, onDone, onError },
      );

      expect(onTextDelta).toHaveBeenCalledWith('Hi');
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    });

    it('calls onError and onDone when no active provider is configured', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [createEndpoint({ id: 'idle', enabled: true })],
      };
      mock.storageLocal['ba-provider-config'] = stored;
      await setActiveProviderId(null);

      const manager = await importManager();
      const onDone = vi.fn();
      const onError = vi.fn();

      await manager.sendPrompt(
        {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'hello' }],
        },
        { onTextDelta: vi.fn(), onDone, onError },
      );

      expect(onError).toHaveBeenCalledWith('No provider configured');
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('errors when active provider is missing', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [createEndpoint({ id: 'existing', enabled: true })],
      };
      mock.storageLocal['ba-provider-config'] = stored;
      await setActiveProviderId('missing');

      const manager = await importManager();
      const onDone = vi.fn();
      const onError = vi.fn();

      await manager.sendPrompt(
        {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'hello' }],
        },
        { onTextDelta: vi.fn(), onDone, onError },
      );

      expect(onError).toHaveBeenCalledWith('No provider configured');
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  describe('resolveAvailableProviders', () => {
    it('returns only enabled configured providers', async () => {
      const stored: StoredProviderConfig = {
        version: 1,
        providers: [
          createEndpoint({ id: 'enabled', enabled: true }),
          createEndpoint({ id: 'disabled', enabled: false }),
        ],
      };
      mock.storageLocal['ba-provider-config'] = stored;

      const manager = await importManager();
      const providers = await manager.resolveAvailableProviders();

      expect(providers).toHaveLength(1);
      expect(providers[0].id).toBe('enabled');
    });
  });
});
