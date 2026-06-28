/* ------------------------------------------------------------------ */
/*  Shared HTTP helpers for provider adapters                         */
/* ------------------------------------------------------------------ */

import { deobfuscate } from '../../utils/obfuscation';
import type { ProviderEndpoint } from './types';

export interface SSEEvent {
  event?: string;
  data: string;
}

/**
 * Parse a Server-Sent Events (SSE) response body.
 * Yields one object per event with the optional event name and data payload.
 */
export async function* parseSSE(
  response: Response,
): AsyncGenerator<SSEEvent> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent: string | undefined;
  const dataLines: string[] = [];

  const flush = (): SSEEvent | null => {
    if (dataLines.length === 0) return null;
    const data = dataLines.join('\n');
    dataLines.length = 0;
    const event = currentEvent ? { event: currentEvent, data } : { data };
    currentEvent = undefined;
    return event;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line === '') {
          const event = flush();
          if (event) yield event;
        } else if (line.startsWith(':')) {
          // SSE comment — ignore
        } else if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
        // Unknown SSE fields are ignored.
      }
    }

    // Flush any trailing content that didn't end with a newline.
    if (buffer !== '') {
      if (buffer.startsWith('event:')) {
        currentEvent = buffer.slice(6).trim();
      } else if (buffer.startsWith('data:')) {
        dataLines.push(buffer.slice(5).trim());
      }
    }
    const event = flush();
    if (event) yield event;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a newline-delimited JSON (NDJSON) response body.
 * Yields parsed JSON objects and skips malformed lines.
 */
export async function* parseNDJSON(response: Response): AsyncGenerator<any> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.trim() === '') continue;
        try {
          yield JSON.parse(line);
        } catch {
          // Ignore parse errors per line and continue streaming.
        }
      }
    }

    if (buffer.trim() !== '') {
      try {
        yield JSON.parse(buffer);
      } catch {
        // Ignore trailing malformed chunk.
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Resolve the API key, applying deobfuscation when available.
 * Falls back to the raw value if deobfuscation fails.
 */
function getApiKey(endpoint: ProviderEndpoint): string {
  try {
    return deobfuscate(endpoint.apiKey);
  } catch {
    return endpoint.apiKey;
  }
}

/**
 * Build authentication headers based on the endpoint's authType.
 * Never logs the API key.
 */
export function buildAuthHeaders(
  endpoint: ProviderEndpoint,
): Record<string, string> {
  if (endpoint.authType === 'none') return {};

  const apiKey = getApiKey(endpoint);

  switch (endpoint.authType) {
    case 'bearer':
      return { Authorization: `Bearer ${apiKey}` };
    case 'x-api-key':
      return { 'x-api-key': apiKey };
    case 'custom-header':
      return { [endpoint.authHeaderName ?? 'Authorization']: apiKey };
    default:
      return {};
  }
}

/**
 * Base HTTP headers for JSON API requests.
 */
export function buildBaseHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

const FRIENDLY_STATUS: Record<number, string> = {
  400: 'Bad request',
  401: 'Unauthorized — check your API key',
  403: 'Forbidden — CORS/origin restriction. If using Ollama, allow chrome-extension://* in OLLAMA_ORIGINS',
  404: 'Not found',
  408: 'Request timeout',
  429: 'Rate limited',
  500: 'Server error',
  502: 'Bad gateway',
  503: 'Service unavailable',
  504: 'Gateway timeout',
};

/**
 * Normalize an HTTP error response into a human-readable message.
 * Never includes the API key.
 */
export function normalizeError(response: Response, body?: string): string {
  const statusText =
    FRIENDLY_STATUS[response.status] ?? response.statusText ?? 'Request failed';
  let message = `HTTP ${response.status}: ${statusText}`;
  if (body) {
    message += `\n${body}`;
  }
  return message;
}
