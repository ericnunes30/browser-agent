/* ─── Chat handler — routes prompts through ProviderManager ───── */
import { ProviderManager } from './provider-manager';
import type {
  ChatMessage,
  PromptParams,
  StreamCallbacks,
  ToolDefinition as AdapterToolDefinition,
} from './providers/adapter';
import { ALL_TOOLS, executeTool } from './tools';
import { startKeepAlive, stopKeepAlive } from './keep-alive';

/**
 * Convert the side-panel message history into the adapter's
 * ChatMessage format.
 * Supports both string content and ContentPart arrays (for images).
 */
function convertMessages(
  messages: Array<{
    role: string;
    content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
    tool_call_id?: string;
    name?: string;
  }>,
): ChatMessage[] {
  return messages.map((m) => {
    const result: any = {
      role: m.role as ChatMessage['role'],
      content: m.content,
    };
    if (m.tool_call_id) result.tool_call_id = m.tool_call_id;
    if (m.name) result.name = m.name;
    return result;
  });
}

/**
 * Tool definitions exposed by the browser agent, mapped to the shape expected
 * by provider adapters.
 */
export function getAdapterTools(): AdapterToolDefinition[] {
  return ALL_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  }));
}

/**
 * Read the user-configured max tool iterations from chrome.storage.
 * Falls back to a sensible default (30) if not set or invalid.
 */
async function getMaxToolIterations(): Promise<number> {
  try {
    const result = await chrome.storage.local.get('ba-max-tool-iterations');
    const value = result['ba-max-tool-iterations'];
    const parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 100) {
      console.log(`[SW] 🔄 getMaxToolIterations: ${parsed} (raw from storage: ${JSON.stringify(value)})`);
      return parsed;
    }
    console.log(`[SW] 🔄 getMaxToolIterations: invalid value ${JSON.stringify(value)}, using default 30`);
  } catch (err) {
    console.warn('[SW] 🔄 getMaxToolIterations: storage read failed, using default 30', err);
  }
  return 30;
}

/**
 * Send a prompt through the active provider using ProviderManager.
 *
 * Implements the tool loop:
 * 1. Send prompt + tools to LLM
 * 2. LLM responds with text and/or tool calls
 * 3. If tool calls: execute each tool, add results to messages, go to step 1
 * 4. If no tool calls: stream final text and done
 *
 * When the loop exceeds MAX_TOOL_ITERATIONS, calls onContinuePrompt (if provided)
 * to ask the user whether to continue or stop. If the user continues, the counter
 * resets for another batch of MAX_TOOL_ITERATIONS.
 */
export async function sendChatPrompt(
  params: PromptParams,
  callbacks: StreamCallbacks,
  tabId?: number,
  onContinuePrompt?: () => Promise<boolean>,
  signal?: AbortSignal,
): Promise<void> {
  const manager = ProviderManager.getInstance();
  const active = await manager.getActiveProvider();

  // If the user hit Stop before we even picked a provider, bail out cleanly.
  if (signal?.aborted) {
    callbacks.onDone();
    return;
  }

  if (!active) {
    callbacks.onError('No provider configured. Open options to add one.');
    callbacks.onDone();
    return;
  }

  if (!params.model) {
    callbacks.onError('No model selected. Open options to choose a model.');
    callbacks.onDone();
    return;
  }

  let currentMessages = [...params.messages];
  let iteration = 0;

  // Read user-configured max iterations from storage
  const maxIterations = await getMaxToolIterations();

  // Helper: wait for `ms` but bail out immediately if aborted.
  const abortableWait = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      if (signal?.aborted) return resolve();
      const t = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    });

  while (true) {
    // Honor abort between iterations so a Stop click unwinds the loop.
    if (signal?.aborted) {
      callbacks.onDone();
      return;
    }

    // Check iteration limit — ask user to continue or stop
    if (iteration >= maxIterations) {
      if (onContinuePrompt) {
        const shouldContinue = await onContinuePrompt();
        if (signal?.aborted) {
          callbacks.onDone();
          return;
        }
        if (shouldContinue) {
          iteration = 0;
          // Continue the loop
        } else {
          // User chose to stop — text already streamed in real-time
          callbacks.onDone();
          return;
        }
      } else {
        // No continue prompt available — stop
        callbacks.onDone();
        return;
      }
    }

    iteration++;

    const toolCalls: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
    }> = [];
    let textContent = '';
    let reasoningContent = '';
    let errorContent = '';

    const wrappedCallbacks: StreamCallbacks = {
      onTextDelta: (text: string) => {
        textContent += text;
        callbacks.onTextDelta(text);
      },
      onReasoningDelta: (text: string) => {
        reasoningContent += text;
        callbacks.onReasoningDelta?.(text);
      },
      onToolStart: (toolCallId: string, name: string, args: any) => {
        toolCalls.push({ id: toolCallId, name, args: args ?? {} });
        callbacks.onToolStart?.(toolCallId, name, args);
      },
      onToolEnd: (name: string, result?: any, error?: string) => {
        callbacks.onToolEnd?.(name, result, error);
      },
      onError: (message: string) => {
        errorContent = message;
        callbacks.onError(message);
      },
      onDone: () => {},
    };

    await manager.sendPrompt(
      {
        ...params,
        messages: currentMessages,
      },
      wrappedCallbacks,
    );

    if (errorContent) {
      callbacks.onDone();
      return;
    }

    // No tool calls → final answer is ready
    if (toolCalls.length === 0) {
      callbacks.onDone();
      return;
    }

    // --- Tool loop iteration ---
    // Execute each tool and collect results
    const executedToolIds = new Set<string>();
    const toolResultMessages: ChatMessage[] = [];

    for (const tc of toolCalls) {
      if (executedToolIds.has(tc.id)) continue;
      executedToolIds.add(tc.id);

      const argsWithTab = {
        ...tc.args,
        tabId: (tc.args.tabId as number | undefined) ?? tabId,
        // Internal channel so the wait tool can bail out immediately on Stop.
        _abortSignal: signal,
      };

      // If the user clicked Stop, don't execute the remaining tools in this
      // batch — bail out of the loop entirely.
      if (signal?.aborted) {
        callbacks.onDone();
        return;
      }

      try {
        const result = await executeTool(tc.name, argsWithTab, tabId);
        const toolContent = result.error
          ? `Error: ${result.error}\n${result.content}`
          : result.content;
        toolResultMessages.push({
          role: 'tool',
          content: toolContent,
          tool_call_id: tc.id,
          name: tc.name,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        toolResultMessages.push({
          role: 'tool',
          content: `Error: ${errMsg}`,
          tool_call_id: tc.id,
          name: tc.name,
        });
      }

      // Honor abort between tools so a Stop during a long-running tool
      // (e.g. a `wait` of 30s) doesn't keep executing the rest of the batch.
      if (signal?.aborted) {
        callbacks.onDone();
        return;
      }
    }

    // Build the assistant message with tool_calls for context.
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: textContent || '',
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.args),
        },
      })),
    };

    // Append assistant message + tool results for the next LLM call
    currentMessages = [...currentMessages, assistantMsg, ...toolResultMessages];
  }
}

/**
 * Handle a chat:send message — accumulates a streaming response and returns
 * a single result object for non-port callers.
 */
export async function handleChatSend(msg: any, _sender: chrome.runtime.MessageSender): Promise<any> {
  startKeepAlive();
  try {
    const { model: modelId, messages } = msg;
    if (!messages || messages.length === 0) return { type: 'done', content: '' };

    const params: PromptParams = {
      model: modelId || '',
      messages: convertMessages(messages),
      tools: getAdapterTools(),
      stream: true,
    };

    let content = '';
    let reasoning = '';
    let error = '';

    await sendChatPrompt(params, {
      onTextDelta: (text: string) => {
        content += text;
      },
      onReasoningDelta: (text: string) => {
        reasoning += text;
      },
      onError: (message: string) => {
        error = message;
      },
      onDone: () => {},
    });

    if (error) {
      return { type: 'error', content: `Error: ${error}` };
    }

    return { type: 'done', content, reasoning: reasoning || undefined };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[SW] handleChatSend error:', errMsg);
    return { type: 'error', content: `Error: ${errMsg}` };
  } finally {
    stopKeepAlive();
  }
}
