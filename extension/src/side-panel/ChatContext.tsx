import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';

import type { PermissionRequest } from './components/PermissionPrompt';
import { ChatStream } from './chat-stream';

/* ─── Types ────────────────────────────────────────────────────── */

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  reasoning?: string;
  tool_calls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  tool_call_id?: string;
  name?: string;
  timestamp: number;
  streaming?: boolean;
}

export type PermissionMode = 'follow_a_plan' | 'skip_all_permission_checks';

interface ChatContextValue {
  messages: DisplayMessage[];
  sendMessage: (text: string) => Promise<void>;
  clearConversation: () => void;
  isStreaming: boolean;
  stopGeneration: () => void;
  activeProvider: string;
  activeModel: string;
  setProvider: (id: string, model: string) => void;
  permissionMode: PermissionMode;
  setPermissionMode: (mode: PermissionMode) => void;
  pendingPermission: PermissionRequest | null;
  respondPermission: (domain: string, action: 'allow' | 'allow_once' | 'deny', forAllChats: boolean) => void;
  hasNewModels: boolean;
  reloadModels: () => Promise<void>;
  providers: Array<{ id: string; name: string; models: string[] }>;
}

const ChatCtx = createContext<ChatContextValue>(null!);

let msgCounter = 0;
function nextId() { return `msg_${Date.now()}_${++msgCounter}`; }

/* ─── Provider ─────────────────────────────────────────────────── */

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeProvider, setActiveProvider] = useState('openai');
  const [activeModel, setActiveModel] = useState('gpt-4o');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('follow_a_plan');
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);
  const [hasNewModels, setHasNewModels] = useState(false);
  const [providers, setProviders] = useState<Array<{ id: string; name: string; models: string[] }>>([]);
  const messagesRef = useRef<DisplayMessage[]>([]);
  const chatStreamRef = useRef<ChatStream | null>(null);

  // Load provider/model from storage on mount
  useEffect(() => {
    chrome.storage.local.get(['ba-providers', 'ba-permission-mode'], (result) => {
      const ba = result['ba-providers'] as Record<string, { selectedModel?: string }> | undefined;
      if (ba) {
        const entries = Object.entries(ba);
        if (entries.length > 0) {
          const [id, cfg] = entries[0];
          setActiveProvider(id);
          if (cfg.selectedModel) setActiveModel(cfg.selectedModel);
        }
      }
      if (result['ba-permission-mode']) {
        setPermissionMode(result['ba-permission-mode']);
      }
    });
  }, []);

  // Listen for permission requests from service worker
  useEffect(() => {
    const handler = (msg: any) => {
      if (msg.type === 'permission:request') {
        setPendingPermission({
          domain: msg.domain,
          toolName: msg.toolName,
          action: msg.action,
          tabId: msg.tabId,
        });
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const respondPermission = useCallback(async (
    domain: string,
    action: 'allow' | 'allow_once' | 'deny',
    forAllChats: boolean,
  ) => {
    setPendingPermission(null);

    // Send response back to service worker
    if (action === 'allow') {
      await chrome.runtime.sendMessage({
        type: 'permission:grant',
        domain,
        forAllChats,
      });
    } else if (action === 'allow_once') {
      await chrome.runtime.sendMessage({
        type: 'permission:allow_once',
        domain,
      });
    } else if (action === 'deny') {
      await chrome.runtime.sendMessage({
        type: 'permission:deny',
        domain,
      });
    }
  }, []);

  const checkForNewModels = useCallback(async () => {
    // Models are managed by native host — no config-based sync needed.
    // Refresh the providers list from the host instead.
    try {
      await loadProvidersList();
      setHasNewModels(false);
    } catch {
      setHasNewModels(false);
    }
  }, []);

  const reloadModels = useCallback(async () => {
    try {
      // Request fresh model list from native host via the SW
      await loadProvidersList();
      setHasNewModels(false);
    } catch {}
  }, []);

  async function loadProvidersList() {
    try {
      // Uses NativeBridge internally via the SW handler
      const resp = await chrome.runtime.sendMessage({ type: 'models:list' });
      if (resp?.providers) {
        setProviders(
          resp.providers.map((p: any) => ({
            id: p.id,
            name: p.name,
            models: (p.models || []).map((m: any) => m.id || m.name || String(m)),
          })),
        );
      }
    } catch {}
  }

  // Check for new models on mount
  useEffect(() => {
    checkForNewModels();
  }, [checkForNewModels]);

  // Periodic check every 5 minutes
  useEffect(() => {
    const interval = setInterval(checkForNewModels, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkForNewModels]);

  // Load providers list on mount
  useEffect(() => {
    loadProvidersList();
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
  }, []);

  const setProvider = useCallback((id: string, model: string) => {
    setActiveProvider(id);
    setActiveModel(model);
  }, []);

  const handleSetPermissionMode = useCallback((mode: PermissionMode) => {
    setPermissionMode(mode);
    chrome.storage.local.set({ 'ba-permission-mode': mode });
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return;
      setIsStreaming(true);

      // Add user message
      const userMsg: DisplayMessage = {
        id: nextId(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };
      setMessages((prev) => {
        const updated = [...prev, userMsg];
        messagesRef.current = updated;
        return updated;
      });

      // Add placeholder assistant message (thinking)
      const assistantMsg: DisplayMessage = {
        id: nextId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        streaming: true,
      };
      setMessages((prev) => {
        const updated = [...prev, assistantMsg];
        messagesRef.current = updated;
        return updated;
      });

      // Get active tab
      let activeTabId: number | null = null;
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'tab:getActive' });
        activeTabId = resp?.id ?? null;
      } catch {
        // no tab
      }

      // Build conversation history (local type — ChatMessage removed from shared types)
      const history: Array<{ role: string; content: string; tool_call_id?: string; name?: string }> = messagesRef.current
        .slice(0, -1) // exclude the placeholder
        .filter((m) => m.role === 'user' || m.role === 'tool' || (m.role === 'assistant' && (m.content || m.tool_calls)))
        .map((m) => ({
          role: m.role,
          content: m.content,
          // Do NOT include tool_calls from previous turns —
          // the LLM would see them without corresponding tool_result messages.
          // The SW's internal tool loop handles tool execution in one turn.
          ...(m.tool_call_id && m.role === 'tool' ? { tool_call_id: m.tool_call_id, name: m.name } : {}),
        }));

      // Use streaming via port
      const stream = new ChatStream();
      chatStreamRef.current = stream;

      try {
        stream.start(activeProvider, activeModel, history, activeTabId, {
        onDelta: (deltaText: string) => {
          setMessages((prev: DisplayMessage[]) => {
            const updated = prev.map((m: DisplayMessage) =>
              m.id === assistantMsg.id
                ? { ...m, content: m.content + deltaText }
                : m,
            );
            messagesRef.current = updated;
            return updated;
          });
        },
        onReasoning: (text: string) => {
          setMessages((prev: DisplayMessage[]) => {
            const updated = prev.map((m: DisplayMessage) =>
              m.id === assistantMsg.id
                ? { ...m, reasoning: (m.reasoning || '') + text }
                : m,
            );
            messagesRef.current = updated;
            return updated;
          });
        },
        onToolStart: (_name: string) => {
          // No action needed for basic streaming
        },
        onToolEnd: (_name: string) => {
          // No action needed for basic streaming
        },
        onDone: (content: string, reasoning?: string) => {
          updateMessage(assistantMsg.id, content, reasoning);
          setIsStreaming(false);
          chatStreamRef.current = null;
        },
        onError: (error: string) => {
          updateMessage(assistantMsg.id, `Error: ${error}`);
          setIsStreaming(false);
          chatStreamRef.current = null;
        },
      });
      } catch (e) {
        console.error('[ChatCtx] Failed to start stream:', e);
        updateMessage(assistantMsg.id, `Error: ${e instanceof Error ? e.message : String(e)}`);
        setIsStreaming(false);
        chatStreamRef.current = null;
      }
    },
    [isStreaming, activeProvider, activeModel],
  );

  function updateMessage(msgId: string, content: string, reasoning?: string, tool_calls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>) {
    setMessages((prev) => {
      const updated = prev.map((m) =>
        m.id === msgId
          ? { ...m, content, reasoning: reasoning || m.reasoning, streaming: false, tool_calls: tool_calls || m.tool_calls }
          : m,
      );
      messagesRef.current = updated;
      return updated;
    });
  }

  const stopGeneration = useCallback(() => {
    chatStreamRef.current?.stop();
    chatStreamRef.current = null;
    setIsStreaming(false);
    setMessages((prev) => {
      const updated = prev.map((m) => (m.streaming ? { ...m, content: '(stopped)', streaming: false } : m));
      messagesRef.current = updated;
      return updated;
    });
  }, []);

  return (
    <ChatCtx.Provider
      value={{
        messages,
        sendMessage,
        clearConversation,
        isStreaming,
        stopGeneration,
        activeProvider,
        activeModel,
        setProvider,
        permissionMode,
        setPermissionMode: handleSetPermissionMode,
        pendingPermission,
        respondPermission,
        hasNewModels,
        reloadModels,
        providers,
      }}
    >
      {children}
    </ChatCtx.Provider>
  );
}

export function useChat() {
  return useContext(ChatCtx);
}
