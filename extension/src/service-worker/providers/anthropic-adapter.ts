/* ------------------------------------------------------------------ */
/*  Anthropic provider adapter                                        */
/* ------------------------------------------------------------------ */

import type {
  ChatMessage,
  ContentPart,
  ProviderAdapter,
  PromptParams,
  StreamCallbacks,
  ToolDefinition,
} from './adapter';
import {
  buildAuthHeaders,
  buildBaseHeaders,
  normalizeError,
  parseSSE,
} from './http-helpers';
import type { ModelInfo, ProviderEndpoint } from './types';

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;
const TEST_TIMEOUT_MS = 5000;

interface AnthropicToolState {
  id: string;
  name: string;
  inputJson: string;
}

export class AnthropicAdapter implements ProviderAdapter {
  async listModels(endpoint: ProviderEndpoint): Promise<ModelInfo[]> {
    const response = await fetch(`${endpoint.baseUrl}/models`, {
      method: 'GET',
      headers: this.buildHeaders(endpoint),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(normalizeError(response, body));
    }

    const json = (await response.json()) as {
      data?: Array<{ id: string; display_name?: string; name?: string }>;
    };

    const models = json.data ?? [];
    return models.map((item) => this.toModelInfo(item.id, endpoint));
  }

  async testConnection(
    endpoint: ProviderEndpoint,
  ): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
    const start = Date.now();

    try {
      const response = await fetch(`${endpoint.baseUrl}/models`, {
        method: 'GET',
        headers: this.buildHeaders(endpoint),
        signal: controller.signal,
      });

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
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async sendPrompt(
    endpoint: ProviderEndpoint,
    params: PromptParams,
    callbacks: StreamCallbacks,
  ): Promise<void> {
    const { system, messages } = this.convertMessages(params.messages);
    const tools = params.tools?.map((tool) => this.convertTool(tool));

    const body: Record<string, unknown> = {
      model: params.model,
      messages,
      max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: true,
    };

    if (system) body.system = system;
    if (params.temperature !== undefined) body.temperature = params.temperature;
    if (tools && tools.length > 0) body.tools = tools;

    let finished = false;
    const finish = (errorMessage?: string): void => {
      if (finished) return;
      finished = true;
      if (errorMessage) callbacks.onError(errorMessage);
      callbacks.onDone();
    };

    try {
      const response = await fetch(`${endpoint.baseUrl}/messages`, {
        method: 'POST',
        headers: this.buildHeaders(endpoint),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const responseBody = await response.text().catch(() => '');
        finish(normalizeError(response, responseBody));
        return;
      }

      const activeTools = new Map<number, AnthropicToolState>();

      for await (const sse of parseSSE(response)) {
        const parsedData = this.safeParseJson(sse.data);
        const eventType = sse.event ?? parsedData?.type;
        const data = parsedData;

        if (data?.type === 'error' || eventType === 'error') {
          const message = data?.error?.message ?? 'Anthropic stream error';
          finish(message);
          return;
        }

        switch (eventType) {
          case 'content_block_start': {
            const block = data?.content_block;
            const index = data?.index ?? 0;
            if (block?.type === 'tool_use') {
              const state: AnthropicToolState = {
                id: block.id ?? '',
                name: block.name ?? '',
                inputJson: '',
              };
              activeTools.set(index, state);
              callbacks.onToolStart?.(state.id, state.name, block.input ?? {});
            }
            break;
          }

          case 'content_block_delta': {
            const delta = data?.delta;
            const index = data?.index ?? 0;
            if (!delta) break;

            if (delta.type === 'text_delta') {
              const text = delta.text ?? '';
              if (text) callbacks.onTextDelta(text);
            } else if (delta.type === 'thinking_delta') {
              callbacks.onReasoningDelta?.(delta.thinking ?? '');
            } else if (delta.type === 'input_json_delta') {
              const state = activeTools.get(index);
              if (state) {
                state.inputJson += delta.partial_json ?? '';
              }
            }
            break;
          }

          case 'content_block_stop': {
            const index = data?.index ?? 0;
            const state = activeTools.get(index);
            if (state) {
              let result: unknown;
              let error: string | undefined;
              try {
                result = state.inputJson ? JSON.parse(state.inputJson) : {};
              } catch (err) {
                error = `Invalid tool arguments: ${
                  err instanceof Error ? err.message : String(err)
                }`;
                result = state.inputJson;
              }
              callbacks.onToolEnd?.(state.name, result, error);
              activeTools.delete(index);
            }
            break;
          }

          case 'message_stop': {
            finish();
            return;
          }

          case 'message_start':
          case 'message_delta':
          case 'ping':
          default:
            // Lifecycle / keep-alive events are intentionally ignored.
            break;
        }
      }

      // If the stream ends without an explicit message_stop, close gracefully.
      finish();
    } catch (err) {
      finish(err instanceof Error ? err.message : String(err));
    }
  }

  private buildHeaders(
    endpoint: ProviderEndpoint,
  ): Record<string, string> {
    return {
      ...buildBaseHeaders(),
      ...buildAuthHeaders(endpoint),
      'anthropic-version': ANTHROPIC_VERSION,
    };
  }

  private toModelInfo(
    id: string,
    endpoint: ProviderEndpoint,
  ): ModelInfo {
    return {
      id,
      name: id,
      providerId: endpoint.id,
      providerLabel: endpoint.label,
      capabilities: {
        vision: id.startsWith('claude-3'),
        tools: true,
        streaming: true,
      },
    };
  }

  private convertTool(tool: ToolDefinition): {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  } {
    const inputSchema =
      tool.parameters &&
      typeof tool.parameters === 'object' &&
      tool.parameters.type === 'object'
        ? tool.parameters
        : { type: 'object', properties: tool.parameters ?? {} };

    return {
      name: tool.name,
      description: tool.description ?? '',
      input_schema: inputSchema,
    };
  }

  private convertMessages(
    messages: ChatMessage[],
  ): { system?: string; messages: unknown[] } {
    const systemParts: string[] = [];

    for (const message of messages) {
      if (message.role !== 'system') continue;
      if (typeof message.content === 'string') {
        systemParts.push(message.content);
      } else {
        systemParts.push(this.textFromContentParts(message.content));
      }
    }

    const converted = messages
      .filter((message) => message.role !== 'system')
      .map((message) => {
        if (message.role === 'tool') {
          return {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: message.tool_call_id ?? '',
                content:
                  typeof message.content === 'string'
                    ? message.content
                    : this.textFromContentParts(message.content),
              },
            ],
          };
        }

        // Assistant messages with tool_calls: add tool_use content blocks
        if (message.role === 'assistant' && message.tool_calls && message.tool_calls.length > 0) {
          const content: unknown[] = [];
          // Add text content if present
          const text = typeof message.content === 'string' ? message.content : this.textFromContentParts(message.content);
          if (text) {
            content.push({ type: 'text', text });
          }
          // Add tool_use blocks for each tool call
          for (const tc of message.tool_calls) {
            let input: unknown = {};
            try {
              input = JSON.parse(tc.function.arguments);
            } catch {
              input = tc.function.arguments;
            }
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input,
            });
          }
          return { role: 'assistant', content };
        }

        return {
          role: message.role,
          content: this.convertContent(message.content),
        };
      });

    return {
      system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
      messages: converted,
    };
  }

  private convertContent(content: string | ContentPart[]): unknown {
    if (typeof content === 'string') return content;

    const blocks: unknown[] = [];
    for (const part of content) {
      if (part.type === 'text' && part.text) {
        blocks.push({ type: 'text', text: part.text });
      } else if (part.type === 'image_url' && part.image_url?.url) {
        const source = this.parseImageSource(part.image_url.url);
        if (source) blocks.push({ type: 'image', source });
      }
    }

    if (blocks.length === 0) return '';
    if (blocks.length === 1 && (blocks[0] as { type: string }).type === 'text') {
      return (blocks[0] as { text: string }).text;
    }
    return blocks;
  }

  private textFromContentParts(parts: ContentPart[]): string {
    return parts
      .filter((part): part is ContentPart & { text: string } =>
        Boolean(part.type === 'text' && part.text),
      )
      .map((part) => part.text)
      .join('\n');
  }

  private parseImageSource(
    url: string,
  ): { type: 'base64'; media_type: string; data: string } | null {
    const match = url.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) return null;
    return { type: 'base64', media_type: match[1], data: match[2] };
  }

  private safeParseJson(data: string): any {
    try {
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

}
