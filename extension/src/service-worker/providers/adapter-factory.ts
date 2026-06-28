/* ------------------------------------------------------------------ */
/*  Provider adapter factory                                          */
/* ------------------------------------------------------------------ */

import { AnthropicAdapter } from './anthropic-adapter';
import { OllamaAdapter } from './ollama-adapter';
import { OpenAIAdapter } from './openai-adapter';
import type { ProviderAdapter } from './adapter';
import type { ProviderType } from './types';

export function getAdapter(type: ProviderType): ProviderAdapter {
  switch (type) {
    case 'openai':
    case 'openai-compatible':
      return new OpenAIAdapter();
    case 'anthropic':
      return new AnthropicAdapter();
    case 'ollama':
      return new OllamaAdapter();
    default:
      throw new Error(`Unsupported provider type: ${type}`);
  }
}
