import type { ProviderEndpoint, StoredProviderConfig } from '../service-worker/providers/types';
import { CUSTOM_MODELS_STORAGE_KEY, type CustomModelEntry } from '../service-worker/providers/types';
import { deobfuscate, obfuscate } from '../utils/obfuscation';

const CONFIG_KEY = 'ba-provider-config';
const ACTIVE_KEY = 'ba-active-provider';

export const CUSTOM_MODELS_KEY = CUSTOM_MODELS_STORAGE_KEY;

const DEFAULT_CONFIG: StoredProviderConfig = {
  version: 1,
  providers: [],
};

function deobfuscateProvider(provider: ProviderEndpoint): ProviderEndpoint {
  return {
    ...provider,
    apiKey: provider.apiKey ? deobfuscate(provider.apiKey) : '',
  };
}

function obfuscateProvider(provider: ProviderEndpoint): ProviderEndpoint {
  return {
    ...provider,
    apiKey: provider.apiKey ? obfuscate(provider.apiKey) : '',
  };
}

/**
 * Load the provider configuration from storage.
 * API keys are returned in plain text (deobfuscated in memory only).
 */
export async function loadProviderConfig(): Promise<StoredProviderConfig> {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  const stored = result[CONFIG_KEY] as StoredProviderConfig | undefined;
  if (!stored) {
    return DEFAULT_CONFIG;
  }
  return {
    ...stored,
    providers: stored.providers.map(deobfuscateProvider),
  };
}

/**
 * Save the provider configuration to storage.
 * API keys are obfuscated before writing.
 */
export async function saveProviderConfig(config: StoredProviderConfig): Promise<void> {
  const toSave: StoredProviderConfig = {
    ...config,
    providers: config.providers.map(obfuscateProvider),
  };
  await chrome.storage.local.set({ [CONFIG_KEY]: toSave });
}

/**
 * Read the currently active provider ID, if any.
 */
export async function getActiveProviderId(): Promise<string | undefined> {
  const result = await chrome.storage.local.get(ACTIVE_KEY);
  return result[ACTIVE_KEY] as string | undefined;
}

/**
 * Set or clear the currently active provider ID.
 */
export async function setActiveProviderId(id: string | null): Promise<void> {
  if (id === null) {
    await chrome.storage.local.remove(ACTIVE_KEY);
  } else {
    await chrome.storage.local.set({ [ACTIVE_KEY]: id });
  }
}

/**
 * Load custom model entries from storage.
 */
export async function loadCustomModels(): Promise<CustomModelEntry[]> {
  const result = await chrome.storage.local.get(CUSTOM_MODELS_KEY);
  const stored = result[CUSTOM_MODELS_KEY] as CustomModelEntry[] | undefined;
  return Array.isArray(stored) ? stored : [];
}

/**
 * Save custom model entries to storage.
 */
export async function saveCustomModels(entries: CustomModelEntry[]): Promise<void> {
  await chrome.storage.local.set({ [CUSTOM_MODELS_KEY]: entries });
}
