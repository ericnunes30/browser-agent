/* ------------------------------------------------------------------ */
/*  Provider adapter interface                                        */
/* ------------------------------------------------------------------ */

import type { ModelInfo, ProviderEndpoint } from './types';

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'low' | 'high' | 'auto' };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type?: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: any;
}

export interface PromptParams {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface StreamCallbacks {
  onTextDelta(text: string): void;
  onReasoningDelta?(text: string): void;
  onToolStart?(toolCallId: string, name: string, args: any): void;
  onToolResult?(toolCallId: string, content: string, error?: string): void;
  onToolEnd?(name: string, result?: any, error?: string): void;
  onError(message: string): void;
  onDone(): void;
}

export interface ProviderAdapter {
  listModels(endpoint: ProviderEndpoint): Promise<ModelInfo[]>;
  testConnection(
    endpoint: ProviderEndpoint,
  ): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }>;
  sendPrompt(
    endpoint: ProviderEndpoint,
    params: PromptParams,
    callbacks: StreamCallbacks,
  ): Promise<void>;
}
