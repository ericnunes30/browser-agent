/* ------------------------------------------------------------------ */
/*  Provider Manager — orchestrates adapters and storage               */
/* ------------------------------------------------------------------ */

import {
  getActiveProviderId,
  loadCustomModels,
  loadProviderConfig,
  saveProviderConfig,
  setActiveProviderId,
} from '../options/provider-config';
import { getAdapter } from './providers/adapter-factory';
import type {
  PromptParams,
  StreamCallbacks,
} from './providers/adapter';
import type {
  CustomModelEntry,
  ModelInfo,
  ProviderEndpoint,
  StoredProviderConfig,
} from './providers/types';

function toModelInfo(id: string, endpoint: ProviderEndpoint): ModelInfo {
  return {
    id,
    name: id,
    providerId: endpoint.id,
    providerLabel: endpoint.label,
    capabilities: {
      vision: false,
      tools: true,
      streaming: true,
    },
  };
}

function customEntryToModelInfo(
  entry: CustomModelEntry,
  endpoint: ProviderEndpoint,
): ModelInfo {
  return {
    id: entry.modelId,
    name: entry.name?.trim() || entry.modelId,
    providerId: endpoint.id,
    providerLabel: endpoint.label,
    capabilities: {
      vision: entry.capabilities?.vision ?? false,
      tools: entry.capabilities?.tools ?? true,
      streaming: entry.capabilities?.streaming ?? true,
    },
  };
}

async function mergeCustomModels(
  provider: ProviderEndpoint,
  baseModels: ModelInfo[],
): Promise<ModelInfo[]> {
  const allCustom = await loadCustomModels();
  const entries = allCustom.filter((e) => e.providerId === provider.id);
  if (entries.length === 0) {
    return baseModels;
  }

  const merged = new Map<string, ModelInfo>();
  for (const model of baseModels) {
    merged.set(model.id, model);
  }

  for (const entry of entries) {
    const modelId = entry.modelId.trim();
    if (!modelId) continue;
    merged.set(modelId, customEntryToModelInfo(entry, provider));
  }

  return Array.from(merged.values());
}

/**
 * Orchestrates provider adapters and storage.
 * Use ProviderManager.getInstance() to access the shared singleton.
 */
export class ProviderManager {
  private static instance: ProviderManager | null = null;

  static getInstance(): ProviderManager {
    if (!ProviderManager.instance) {
      ProviderManager.instance = new ProviderManager();
    }
    return ProviderManager.instance;
  }

  async getConfig(): Promise<StoredProviderConfig> {
    return loadProviderConfig();
  }

  async saveConfig(
    config: StoredProviderConfig,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (config.activeProviderId) {
      const exists = config.providers.some((p) => p.id === config.activeProviderId);
      if (!exists) {
        return {
          ok: false,
          error: `Active provider "${config.activeProviderId}" not found`,
        };
      }
    }

    try {
      await saveProviderConfig(config);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async listModels(
    providerId?: string,
  ): Promise<{ ok: true; models: ModelInfo[] } | { ok: false; error: string }> {
    try {
      const config = await loadProviderConfig();

      if (providerId) {
        const provider = config.providers.find((p) => p.id === providerId);
        if (!provider) {
          return { ok: false, error: `Provider "${providerId}" not found` };
        }

        const models = await this.listModelsForProvider(provider);
        return { ok: true, models };
      }

      const models: ModelInfo[] = [];

      for (const provider of config.providers) {
        if (!provider.enabled) continue;
        try {
          const providerModels = await this.listModelsForProvider(provider);
          models.push(...providerModels);
        } catch {
          // Ignore failing providers during aggregation so one broken endpoint
          // does not hide models from the rest.
        }
      }

      return { ok: true, models };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async testConnection(
    providerId: string,
  ): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }> {
    const config = await loadProviderConfig();
    const provider = config.providers.find((p) => p.id === providerId);

    if (!provider) {
      return { ok: false, error: `Provider "${providerId}" not found` };
    }

    const adapter = getAdapter(provider.type);
    return adapter.testConnection(provider);
  }

  async getActiveProvider(): Promise<ProviderEndpoint | null> {
    const config = await loadProviderConfig();
    const activeId = await getActiveProviderId();

    if (activeId) {
      const active = config.providers.find(
        (p) => p.id === activeId && p.enabled,
      );
      if (active) return active;
    }

    return null;
  }

  async setActiveProvider(providerId: string | null): Promise<void> {
    await setActiveProviderId(providerId);
  }

  async sendPrompt(
    params: PromptParams,
    callbacks: StreamCallbacks,
  ): Promise<void> {
    const active = await this.getActiveProvider();

    if (!active) {
      callbacks.onError('No provider configured');
      callbacks.onDone();
      return;
    }

    const adapter = getAdapter(active.type);
    await adapter.sendPrompt(active, params, callbacks);
  }

  async resolveAvailableProviders(): Promise<ProviderEndpoint[]> {
    const config = await loadProviderConfig();
    return config.providers.filter((p) => p.enabled);
  }

  private async listModelsForProvider(
    provider: ProviderEndpoint,
  ): Promise<ModelInfo[]> {
    let baseModels: ModelInfo[] = [];

    try {
      if (
        provider.modelsSource === 'manual' &&
        Array.isArray(provider.manualModels) &&
        provider.manualModels.length > 0
      ) {
        baseModels = provider.manualModels.map((id) => toModelInfo(id, provider));
      } else {
        const adapter = getAdapter(provider.type);
        baseModels = await adapter.listModels(provider);
      }
    } catch (err) {
      // Adapter/manual model failures must not hide custom models for the
      // provider. Log the failure and continue so saved custom entries still
      // surface in the UI.
      console.warn(
        `[ProviderManager] Failed to load base models for provider "${provider.id}":`,
        err,
      );
    }

    return mergeCustomModels(provider, baseModels);
  }
}
