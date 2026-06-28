/* ------------------------------------------------------------------ */
/*  Tool & provider types — simplified after provider migration       */
/* ------------------------------------------------------------------ */

/* ──── Tool definitions (Claude extension format) ───────────────── */

export type ToolAction =
  | 'click'
  | 'fill'
  | 'type'
  | 'keypress'
  | 'scroll'
  | 'wait'
  | 'screenshot';

export interface ComputerToolInput {
  action: ToolAction;
  /** Element uid from take_snapshot — used with click/fill actions */
  uid?: string;
  /** Text for type/fill actions */
  text?: string;
  /** Keyboard key(s) for keypress action */
  keys?: string[];
  /** Scroll delta [dx, dy] */
  scroll_distance?: [number, number];
  /** Wait duration in ms */
  duration?: number;
  /** Tab ID to act on */
  tabId: number;
}

export interface NavigateToolInput {
  url?: string;
  /** 'forward' | 'back' for history navigation */
  direction?: 'forward' | 'back';
  tabId: number;
}

export interface JavaScriptToolInput {
  code: string;
  tabId: number;
}

export interface FileUploadToolInput {
  /** Element uid from take_snapshot */
  uid: string;
  /** Absolute file paths on the local machine */
  paths: string[];
  tabId: number;
}

export interface GetPageTextToolInput {
  tabId: number;
}

export interface ReadConsoleToolInput {
  pattern?: string;
  tabId: number;
}

export interface ReadNetworkToolInput {
  tabId: number;
}

export interface ResizeWindowToolInput {
  width: number;
  height: number;
  tabId: number;
}

export interface TabsContextToolInput {
  // no input needed — returns all tabs in group
}

export interface TabsCreateToolInput {
  url?: string;
}

export interface ScreenshotResult {
  type: 'screenshot';
  data: string; // base64
}

export interface ToolResult {
  type: 'tool_result';
  content: string;
  /** Base64-encoded screenshots interleaved with results */
  images?: string[];
  /** MCP-style screenshots */
  screenshots?: ScreenshotResult[];
  error?: string;
}

/* ──── Batch tool ────────────────────────────────────────────────── */

export interface BatchToolItem {
  name: string;
  input: Record<string, unknown>;
}

export interface BatchToolInput {
  actions: BatchToolItem[];
}

/* ──── Tool definitions for provider schema ──────────────────────── */

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

/* ──── Generic tool call (provider-agnostic) ─────────────────────── */

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** OpenAI requires type: 'function' on each tool_call */
  type?: string;
}

/* ──── OpenAI-style function calling ─────────────────────────────── */

export interface OpenAIFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/* ──── Message types ─────────────────────────────────────────────── */
// ChatMessage, ChatChunk, ChatRequest removed — no longer used by SW.
// Side panel uses DisplayMessage defined locally in ChatContext.

/* ──── Tab info ──────────────────────────────────────────────────── */

export interface TabInfo {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
  groupId?: number;
}

/* ──── Permission types ──────────────────────────────────────────── */

/** Permission mode (side panel uses a local copy) */
export type PermissionMode = 'follow_a_plan' | 'skip_all_permission_checks';

/* ──── Web search / fetch types ────────────────────────────────────── */

export interface WebSearchInput {
  query: string;
  count?: number;
}

export interface WebFetchInput {
  url: string;
  maxChars?: number;
}

export interface SearchProviderConfig {
  url: string;
  parser: 'searxng' | 'google' | 'custom';
  apiKey?: string;
}

/* ──── File tool types ─────────────────────────────────────────────── */

export interface FileDownloadInput {
  url: string;
  filename?: string;
}

export interface ReadFileInput {
  path: string;
  encoding?: 'utf-8' | 'base64';
}

export interface CreateFileInput {
  path: string;
  content: string;
}

export interface EditFileInput {
  path: string;
  oldText: string;
  newText: string;
}

/* ------------------------------------------------------------------ */
/*  Provider endpoint configuration types                             */
/* ------------------------------------------------------------------ */

export type ProviderType =
  | 'ollama'
  | 'openai'
  | 'anthropic'
  | 'openai-compatible';

export type AuthType =
  | 'bearer'
  | 'x-api-key'
  | 'custom-header'
  | 'none';

export interface ProviderEndpoint {
  id: string;
  type: ProviderType;
  label: string;
  baseUrl: string;
  authType: AuthType;
  authHeaderName?: string;
  apiKey: string; // obfuscated in storage
  enabled: boolean;
  modelsSource: 'auto' | 'manual';
  manualModels?: string[];
  defaultModel?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredProviderConfig {
  version: 1;
  activeProviderId?: string;
  providers: ProviderEndpoint[];
}

export interface ModelInfo {
  id: string;
  name: string;
  providerId: string;
  providerLabel: string;
  capabilities: {
    vision: boolean;
    tools: boolean;
    streaming: boolean;
    maxTokens?: number;
    contextWindow?: number;
  };
}

export interface CustomModelEntry {
  id: string;             // unique entry id
  providerId: string;     // which provider this model belongs to
  modelId: string;        // the model id sent to the API
  name?: string;          // display name (optional, defaults to modelId)
  capabilities?: {
    vision?: boolean;
    tools?: boolean;
    streaming?: boolean;
  };
  createdAt: number;
}

export const CUSTOM_MODELS_STORAGE_KEY = 'ba-custom-models';
