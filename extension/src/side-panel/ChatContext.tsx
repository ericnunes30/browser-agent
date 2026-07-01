import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';

import type { PermissionRequest } from './components/PermissionPrompt';
import { ChatStream } from './chat-stream';

/* ─── Types ────────────────────────────────────────────────────── */

export interface ToolExecution {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  result?: string;
  error?: string;
  status: 'running' | 'done' | 'error';
  timestamp: number;
}

export interface ImageAttachment {
  id: string;
  dataUrl: string;
  name: string;
  type: string;
}

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  attachments?: ImageAttachment[];
  reasoning?: string;
  toolExecutions?: ToolExecution[];
  tool_calls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  tool_call_id?: string;
  name?: string;
  timestamp: number;
  streaming?: boolean;
}

export type PermissionMode = 'follow_a_plan' | 'skip_all_permission_checks';

interface ChatContextValue {
  messages: DisplayMessage[];
  sendMessage: (text: string, attachments?: ImageAttachment[]) => Promise<void>;
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
  showContinuePrompt: boolean;
  respondContinue: (shouldContinue: boolean) => void;
}

const ChatCtx = createContext<ChatContextValue>(null!);

let msgCounter = 0;
function nextId() { return `msg_${Date.now()}_${++msgCounter}`; }

/* ─── Provider ─────────────────────────────────────────────────── */

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeProvider, setActiveProvider] = useState('');
  const [activeModel, setActiveModel] = useState('');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('follow_a_plan');
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);
  const [hasNewModels, setHasNewModels] = useState(false);
  const [providers, setProviders] = useState<Array<{ id: string; name: string; models: string[] }>>([]);
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);
  const messagesRef = useRef<DisplayMessage[]>([]);
  const chatStreamRef = useRef<ChatStream | null>(null);
  const currentAssistantIdRef = useRef<string>('');

  // Load provider/model from storage on mount
  useEffect(() => {
    chrome.storage.local.get(
      ['ba-active-provider', 'ba-selected-model', 'ba-default-model', 'ba-permission-mode'],
      (result) => {
        if (result['ba-active-provider']) {
          setActiveProvider(result['ba-active-provider'] as string);
        }
        if (result['ba-selected-model']) {
          setActiveModel(result['ba-selected-model'] as string);
        }
        if (result['ba-permission-mode']) {
          setPermissionMode(result['ba-permission-mode']);
        }
      },
    );
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

  const loadProvidersList = useCallback(async () => {
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'models:list',
      });
      console.log('[ChatContext] models:list raw response:', resp);
      if (!resp?.providers) return;

      const newProviders: Array<{ id: string; name: string; models: string[] }> =
        resp.providers.map((p: any) => ({
          id: p.id,
          name: p.name,
          models: (p.models || []).map((m: any) => m.id || m.name || String(m)),
        }));
      console.log('[ChatContext] transformed providers:', newProviders);
      setProviders(newProviders);

      const stored = await chrome.storage.local.get([
        'ba-active-provider',
        'ba-selected-model',
        'ba-default-model',
      ]);
      const savedProvider = stored['ba-active-provider'] as string | undefined;
      const savedModel = stored['ba-selected-model'] as string | undefined;
      const defaultModel = stored['ba-default-model'] as string | undefined;

      setActiveProvider((prev) => {
        if (prev) return prev;
        if (savedProvider) return savedProvider;
        if (defaultModel) {
          const provider = newProviders.find((p) => p.models.includes(defaultModel));
          if (provider) return provider.id;
        }
        return resp.activeProviderId || '';
      });

      setActiveModel((prev) => {
        if (prev) return prev;
        if (savedModel) return savedModel;
        if (defaultModel) {
          const exists = newProviders.some((p) => p.models.includes(defaultModel));
          if (exists) return defaultModel;
        }
        return resp.activeModel || '';
      });
    } catch {
      // Best-effort refresh.
    }
  }, []);

  const checkForNewModels = useCallback(async () => {
    try {
      await loadProvidersList();
      setHasNewModels(false);
    } catch {
      setHasNewModels(false);
    }
  }, [loadProvidersList]);

  const reloadModels = useCallback(async () => {
    try {
      await loadProvidersList();
      setHasNewModels(false);
    } catch {}
  }, [loadProvidersList]);

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
  }, [loadProvidersList]);

  // Reload providers when the options page changes configuration.
  useEffect(() => {
    const handler = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      if (changes['ba-active-provider']) {
        setActiveProvider(changes['ba-active-provider'].newValue || '');
      }
      if (changes['ba-provider-config'] || changes['ba-active-provider'] || changes['ba-custom-models']) {
        loadProvidersList();
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, [loadProvidersList]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
  }, []);

  const setProvider = useCallback((id: string, model: string) => {
    setActiveProvider(id);
    setActiveModel(model);
    chrome.storage.local.set({ 'ba-active-provider': id, 'ba-selected-model': model });
  }, []);

  const handleSetPermissionMode = useCallback((mode: PermissionMode) => {
    setPermissionMode(mode);
    chrome.storage.local.set({ 'ba-permission-mode': mode });
  }, []);

  const sendMessage = useCallback(
    async (text: string, attachments?: ImageAttachment[]) => {
      if (isStreaming) return;
      setIsStreaming(true);

      // Add user message (with attachments if any)
      const userMsg: DisplayMessage = {
        id: nextId(),
        role: 'user',
        content: text,
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
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
      currentAssistantIdRef.current = assistantMsg.id;

      if (!activeProvider || !activeModel) {
        updateMessage(assistantMsg.id, 'No provider/model selected. Open options.');
        setIsStreaming(false);
        return;
      }

      // Get active tab
      let activeTabId: number | null = null;
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'tab:getActive' });
        activeTabId = resp?.id ?? null;
      } catch {
        // no tab
      }

      // Build conversation history with system prompt for clean responses
      const systemPrompt = `You are a browser automation assistant. You help users interact with web pages through tools.

CRITICAL INSTRUCTIONS FOR RESPONSE FORMAT:
- When giving the FINAL response after using tools, be CONCISE and directly answer the user's question.
- NEVER repeat or summarize the full history of what was done step-by-step. The user already saw the tool executions in the chat.
- DO NOT list every action taken, every tab visited, or every screenshot captured.
- DO NOT repeat the full list of tabs unless explicitly asked.
- Use markdown formatting: **bold** for emphasis, tables for structured data, and lists when helpful.
- Focus on the RESULTS and KEY INFORMATION, not the process.
- If the user asked to take screenshots, mention that they were captured, but don't describe each one in detail.
- Keep the final response to 2-4 short paragraphs maximum unless the user specifically asked for details.`;

      // Message content can be string or ContentPart array (for images)
      type HistoryContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

      const history: Array<{ role: string; content: HistoryContent; tool_call_id?: string; name?: string }> = [
        { role: 'system', content: systemPrompt },
        ...messagesRef.current
          .slice(0, -1) // exclude the placeholder
          .filter((m) => m.role === 'user' || m.role === 'tool' || (m.role === 'assistant' && (m.content || m.tool_calls)))
          .map((m) => {
            // Convert attachments to ContentPart array for user messages with images
            let content: HistoryContent = m.content;
            if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
              const parts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [];
              if (m.content.trim()) {
                parts.push({ type: 'text', text: m.content });
              }
              for (const att of m.attachments) {
                parts.push({ type: 'image_url', image_url: { url: att.dataUrl } });
              }
              content = parts;
            }
            return {
              role: m.role,
              content,
              // Do NOT include tool_calls from previous turns —
              // the LLM would see them without corresponding tool_result messages.
              // The SW's internal tool loop handles tool execution in one turn.
              ...(m.tool_call_id && m.role === 'tool' ? { tool_call_id: m.tool_call_id, name: m.name } : {}),
            };
          }),
      ];

      // Use streaming via port
      const stream = new ChatStream();
      chatStreamRef.current = stream;

      try {
        stream.start(activeProvider, activeModel, history, activeTabId, {
        onDelta: (deltaText: string) => {
          const targetId = currentAssistantIdRef.current;
          if (!targetId) return;
          setMessages((prev: DisplayMessage[]) => {
            const updated = prev.map((m: DisplayMessage) =>
              m.id === targetId
                ? { ...m, content: m.content + deltaText }
                : m,
            );
            messagesRef.current = updated;
            return updated;
          });
        },
        onReasoning: (text: string) => {
          const targetId = currentAssistantIdRef.current;
          if (!targetId) return;
          setMessages((prev: DisplayMessage[]) => {
            const updated = prev.map((m: DisplayMessage) =>
              m.id === targetId
                ? { ...m, reasoning: (m.reasoning || '') + text }
                : m,
            );
            messagesRef.current = updated;
            return updated;
          });
        },
        onToolStart: (name: string, args?: Record<string, unknown>) => {
          // 1. Freeze current assistant message (remove streaming)
          const frozenId = currentAssistantIdRef.current;
          if (frozenId) {
            setMessages((prev: DisplayMessage[]) => {
              const updated = prev.map((m: DisplayMessage) =>
                m.id === frozenId ? { ...m, streaming: false } : m,
              );
              messagesRef.current = updated;
              return updated;
            });
          }

          // 2. Create tool execution message
          const toolMsg: DisplayMessage = {
            id: nextId(),
            role: 'tool',
            content: '',
            name,
            toolExecutions: [{
              id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              name,
              args,
              status: 'running' as const,
              timestamp: Date.now(),
            }],
            timestamp: Date.now(),
            streaming: true,
          };
          setMessages((prev: DisplayMessage[]) => {
            const updated = [...prev, toolMsg];
            messagesRef.current = updated;
            return updated;
          });

          // 3. Create new assistant placeholder for next text
          const newAssistantMsg: DisplayMessage = {
            id: nextId(),
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            streaming: true,
          };
          setMessages((prev: DisplayMessage[]) => {
            const updated = [...prev, newAssistantMsg];
            messagesRef.current = updated;
            return updated;
          });
          currentAssistantIdRef.current = newAssistantMsg.id;
        },
        onToolEnd: (name: string, result?: string, error?: string) => {
          // Find the most recent tool message that is running
          setMessages((prev: DisplayMessage[]) => {
            const reversed = [...prev].reverse();
            const toolIdx = reversed.findIndex((m) =>
              m.role === 'tool' && m.streaming && m.toolExecutions?.some((e) => e.name === name && e.status === 'running'),
            );
            if (toolIdx === -1) return prev;
            const actualIdx = prev.length - 1 - toolIdx;
            const updated = [...prev];
            const toolMsg = updated[actualIdx];
            const execs = toolMsg.toolExecutions || [];
            const lastIdx = [...execs].reverse().findIndex((e) => e.name === name && e.status === 'running');
            if (lastIdx === -1) return prev;
            const execIdx = execs.length - 1 - lastIdx;
            const newExecs = [...execs];
            newExecs[execIdx] = {
              ...newExecs[execIdx],
              result,
              error,
              status: error ? 'error' : 'done' as const,
            };
            updated[actualIdx] = { ...toolMsg, toolExecutions: newExecs, streaming: false };
            messagesRef.current = updated;
            return updated;
          });
        },
        onContinuePrompt: () => {
          setShowContinuePrompt(true);
        },
        onDone: (content: string, reasoning?: string) => {
          const targetId = currentAssistantIdRef.current;
          if (targetId) {
            updateMessage(targetId, content, reasoning);
          }
          setIsStreaming(false);
          chatStreamRef.current = null;
          currentAssistantIdRef.current = '';
        },
        onError: (error: string) => {
          const targetId = currentAssistantIdRef.current;
          if (targetId) {
            updateMessage(targetId, `Error: ${error}`);
          }
          setIsStreaming(false);
          chatStreamRef.current = null;
          currentAssistantIdRef.current = '';
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

  const respondContinue = useCallback((shouldContinue: boolean) => {
    setShowContinuePrompt(false);
    chatStreamRef.current?.respondContinue(shouldContinue);
  }, []);

  return (
    <ChatCtx.Provider
      value={{
        messages,
        sendMessage,
        clearConversation,
        isStreaming,
        stopGeneration,
        respondContinue,
        showContinuePrompt,
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
