import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import { createBrowserTools, type ToolExecCallback } from "./browser-tools.js";
import type { HostEvent, ThinkingLevel } from "./protocol.js";

/**
 * PiSDKHost — Gerencia o ciclo de vida do Pi SDK no Native Messaging Host.
 *
 * Encapsula:
 * - Criação e destruição de sessões (AgentSession)
 * - Roteamento de eventos do SDK via eventCallback
 * - Descoberta de modelos (ModelRegistry)
 * - Persistência de credenciais (AuthStorage)
 */
export class PiSDKHost {
  private session: AgentSession | null = null;
  private authStorage: AuthStorage;
  private modelRegistry: ModelRegistry;
  private sessionManager: SessionManager;
  private eventCallback: (event: HostEvent) => void;
  private sessionDir: string | undefined;
  private pendingToolCalls = new Map<
    string,
    {
      resolve: (value: { content: string; error?: string; images?: string[] }) => void;
      reject: (err: Error) => void;
    }
  >();

  /** Pending model selection, applied when session is created. */
  private selectedModel: any = null;

  constructor(eventCallback: (event: HostEvent) => void, sessionDir?: string) {
    this.eventCallback = eventCallback;
    this.authStorage = AuthStorage.create();
    this.modelRegistry = ModelRegistry.create(this.authStorage);
    this.sessionManager = sessionDir 
      ? SessionManager.create(process.cwd(), sessionDir) 
      : SessionManager.inMemory();
    this.sessionDir = sessionDir;
  }

  /** Current session ID, or undefined if no session is active. */
  get sessionId(): string | undefined {
    return this.session?.sessionId;
  }

  // ── Lifecycle ─────────────────────────────────────────

  /** Initialize the host (AuthStorage/ModelRegistry already set up in ctor). */
  async init(): Promise<void> {
    // Models come exclusively from ~/.pi/agent/models.json via the pi SDK
    // ModelRegistry — no packaged config fallback. This is intentional and
    // documented in the architecture decisions.
  }

  /** Send a prompt to the agent. */
  async prompt(message: string, images?: string[]): Promise<void> {
    if (!this.session) {
      await this.createSession();
    }
    // images (string[] = file paths) → ImageContent[] conversion is a T4 concern.
    // For now we only pass text; images will be handled in a follow-up.
    await this.session!.prompt(message);
  }

  /** Set model for current session. */
  async setModel(provider: string, modelId: string): Promise<void> {
    const model = this.modelRegistry.find(provider, modelId);
    if (!model) throw new Error(`Model ${provider}/${modelId} not found`);

    // Store the selected model for when session is created
    this.selectedModel = model;

    // If session already exists, apply immediately
    if (this.session) {
      await this.session.setModel(model);
    }
  }

  /** Set thinking level. */
  setThinking(level: ThinkingLevel): void {
    if (this.session) {
      this.session.setThinkingLevel(level);
    }
  }

  /** Abort current execution. */
  async abort(): Promise<void> {
    if (this.session) {
      await this.session.abort();
    }
  }

  /** Create a new session (clear conversation). */
  async newSession(): Promise<void> {
    if (this.session) {
      this.session.dispose();
      this.session = null;
    }
    await this.createSession();
    this.eventCallback({
      type: "sessionInfo",
      sessionId: this.session!.sessionId,
      messageCount: this.session!.messages.length,
    });
  }

  /**
   * Resume a persisted session after host restart.
   * Tries specific sessionId first, then most recent, then creates new.
   */
  async resumeSession(sessionId?: string): Promise<void> {
    // Already has an active session — emit info and return
    if (this.session) {
      this.eventCallback({
        type: "sessionInfo",
        sessionId: this.session.sessionId,
        messageCount: this.session.messages.length,
      });
      return;
    }

    // Try to resume from disk if a session directory was configured
    if (this.sessionDir) {
      // 1) Try specific session by ID
      if (sessionId) {
        try {
          const sessions = await SessionManager.list(process.cwd(), this.sessionDir);
          const target = sessions.find((s) => s.id === sessionId);
          if (target) {
            this.sessionManager = SessionManager.open(target.path, this.sessionDir);
            await this.createSession();
            this.eventCallback({
              type: "sessionInfo",
              sessionId: this.session!.sessionId,
              messageCount: this.session!.messages.length,
            });
            return;
          }
        } catch {
          // Fall through to next strategy
        }
      }

      // 2) Try most recent session
      try {
        this.sessionManager = SessionManager.continueRecent(process.cwd(), this.sessionDir);
        await this.createSession();
        this.eventCallback({
          type: "sessionInfo",
          sessionId: this.session!.sessionId,
          messageCount: this.session!.messages.length,
        });
        return;
      } catch {
        // Fall through to create new
      }
    }

    // 3) No persisted session found — create a new one
    await this.newSession();
  }

  /** Get available models grouped by provider. */
  async getAvailableModels(): Promise<
    Array<{
      id: string;
      name: string;
      models: Array<{ id: string; name: string }>;
    }>
  > {
    const available = await this.modelRegistry.getAvailable();
    // Group by provider
    const providersMap = new Map<
      string,
      {
        id: string;
        name: string;
        models: Array<{ id: string; name: string }>;
      }
    >();
    for (const m of available) {
      const providerId = m.provider || "unknown";
      if (!providersMap.has(providerId)) {
        providersMap.set(providerId, {
          id: providerId,
          name: providerId.charAt(0).toUpperCase() + providerId.slice(1),
          models: [],
        });
      }
      providersMap.get(providerId)!.models.push({
        id: m.id,
        name: m.name || m.id,
      });
    }
    return Array.from(providersMap.values());
  }

  /** Set system prompt override (placeholder — see DefaultResourceLoader). */
  setSystemPrompt(_prompt: string): void {
    // Can be implemented via custom DefaultResourceLoader
    // For now, placeholder
  }

  /** Dispose session and release resources. */
  dispose(): void {
    if (this.session) {
      this.session.dispose();
      this.session = null;
    }
  }

  /** Resolve a pending tool execution with the result from SW */
  resolveToolCall(
    toolCallId: string,
    content: string,
    error?: string,
    images?: string[],
  ): void {
    const pending = this.pendingToolCalls.get(toolCallId);
    if (pending) {
      this.pendingToolCalls.delete(toolCallId);
      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve({ content, error, images });
      }
    } else {
      console.warn(`[PiSDKHost] No pending tool call for ${toolCallId}`);
    }
  }

  // ── Private helpers ────────────────────────────────────

  private async createSession(): Promise<void> {
    const execToolCallback: ToolExecCallback = async (toolCallId, name, args) => {
      // Notify SW a tool needs execution
      this.eventCallback({
        type: "toolExec",
        toolCallId,
        name,
        args: args as Record<string, unknown>,
      });

      // Wait for SW to respond via toolResult message
      return new Promise((resolve, reject) => {
        this.pendingToolCalls.set(toolCallId, { resolve, reject });
        // Timeout after 30s
        setTimeout(() => {
          if (this.pendingToolCalls.has(toolCallId)) {
            this.pendingToolCalls.delete(toolCallId);
            reject(new Error(`Tool ${name} timed out after 30s`));
          }
        }, 30000);
      });
    };

    // Configure SettingsManager with compaction enabled
    const settingsManager = SettingsManager.inMemory({
      compaction: {
        enabled: true,
      },
    });

    const result = await createAgentSession({
      sessionManager: this.sessionManager,
      settingsManager,
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      noTools: "builtin", // Disable built-in tools but keep custom tools
      customTools: createBrowserTools(execToolCallback)
    });

    this.session = result.session;

    // Apply the previously selected model, if any
    if (this.selectedModel) {
      await this.session.setModel(this.selectedModel);
    }

    // Subscribe to events
    this.session.subscribe((event) => {
      switch (event.type) {
        case "message_update":
          if (event.assistantMessageEvent.type === "text_delta") {
            this.eventCallback({
              type: "delta",
              text: event.assistantMessageEvent.delta,
            });
          }
          if (event.assistantMessageEvent.type === "thinking_delta") {
            this.eventCallback({
              type: "reasoning",
              text: event.assistantMessageEvent.delta,
            });
          }
          break;
        case "tool_execution_start":
          this.eventCallback({
            type: "toolStart",
            name: event.toolName,
            input: event.args || {},
          });
          break;
        case "tool_execution_end":
          this.eventCallback({
            type: "toolEnd",
            name: event.toolName,
            result: event.isError ? "Error" : "Success",
            error: event.isError,
          });
          break;
        case "agent_end":
          // Agent finished responding — notify the extension
          this.eventCallback({ type: "done" });
          break;
        case "turn_end":
          this.eventCallback({
            type: "turnEnd",
            text: (event as any).message?.content?.[0]?.text || '',
          });
          break;
        case "compaction_start":
          this.eventCallback({ type: "compaction", status: "started" });
          break;
        case "compaction_end":
          this.eventCallback({ type: "compaction", status: "ended" });
          break;
      }
    });
  }

  /**
   * Old custom provider loader — removed. Models now come exclusively from
   * ~/.pi/agent/models.json via the pi SDK ModelRegistry. The bundled
   * providers.custom.json was a fallback that masked user-edited model
   * definitions; removing it ensures there's a single source of truth.
   */
}
