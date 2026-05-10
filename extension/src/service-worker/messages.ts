/** Message types shared between side panel and service worker */

export interface ChatSendMessage {
  type: 'chat:send';
  provider: string;
  model: string;
  messages: any[];
  tabId?: number;
}

export interface ToolExecuteMessage {
  type: 'tool:execute';
  name: string;
  input: Record<string, unknown>;
  tabId?: number;
}

export interface TabGetActiveMessage {
  type: 'tab:getActive';
}

export interface ModelsListMessage {
  type: 'models:list';
}

/** Agent indicator messages (forwarded to content script) */
export interface ShowAgentIndicators {
  type: 'SHOW_AGENT_INDICATORS';
  isMcp?: boolean;
}

export interface HideAgentIndicators {
  type: 'HIDE_AGENT_INDICATORS';
}

export interface UpdatePhantomCursor {
  type: 'UPDATE_PHANTOM_CURSOR';
  x: number;
  y: number;
}

export interface HideForToolUse {
  type: 'HIDE_FOR_TOOL_USE';
}

export interface ShowAfterToolUse {
  type: 'SHOW_AFTER_TOOL_USE';
}

export interface ShowStaticIndicator {
  type: 'SHOW_STATIC_INDICATOR';
}

export interface HideStaticIndicator {
  type: 'HIDE_STATIC_INDICATOR';
}

export type ExtensionMessage =
  | ChatSendMessage
  | ToolExecuteMessage
  | TabGetActiveMessage
  | ModelsListMessage
  | ShowAgentIndicators
  | HideAgentIndicators
  | UpdatePhantomCursor
  | HideForToolUse
  | ShowAfterToolUse
  | ShowStaticIndicator
  | HideStaticIndicator;
