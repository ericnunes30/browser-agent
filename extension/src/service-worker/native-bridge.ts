/* ------------------------------------------------------------------ */
/*  NativeBridge — Chrome ↔ Native Messaging Host Bridge               */
/* ------------------------------------------------------------------ */
/**
 * Bridge between the extension Service Worker and the Native Messaging
 * Host (Node.js). Uses chrome.runtime.connectNative('com.pi.browseragent')
 * to establish a connection, then exchanges JSON messages over the port.
 *
 * Wire protocol (JSONL):
 *   SW → Host:  { type: "prompt"|"setModel"|"setThinking"|"abort"|"newSession"|"listModels"|"setSystemPrompt"|"toolResult" }
 *   Host → SW:  { type: "delta"|"reasoning"|"toolStart"|"toolExec"|"toolEnd"|"turnEnd"|"done"|"error"|"modelList"|"sessionInfo" }
 */

export type NativeBridgeCallbacks = {
  onDelta: (text: string) => void;
  onReasoning: (text: string) => void;
  onToolExec: (toolCallId: string, name: string, args: Record<string, unknown>) => Promise<{content: string; error?: string; images?: string[]}>;
  onToolEnd: (name: string, result: string, error?: boolean) => void;
  onTurnEnd: (text: string, reasoning?: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
  onModelList: (providers: any[]) => void;
  onSessionInfo: (sessionId: string, messageCount: number) => void;
};

/** Maximum number of automatic reconnect attempts before giving up. */
const MAX_RECONNECT_ATTEMPTS = 10;

/** Base delay (ms) for exponential backoff. */
const RECONNECT_BASE_MS = 1_000;

/** Maximum delay (ms) between reconnect attempts. */
const RECONNECT_MAX_MS = 30_000;

export class NativeBridge {
  private port: chrome.runtime.Port | null = null;
  private callbacks: NativeBridgeCallbacks;
  private connected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalDisconnect = false;
  /** Flag set when the native messaging host is not installed (permanent failure). */
  private permanentFailure = false;

  /**
   * Map of pending tool executions keyed by toolCallId.
   * Reserved for future use when tool responses need to be correlated
   * with outbound requests.
   */
  private pendingToolExecs = new Map<
    string,
    { resolve: (value: any) => void; reject: (err: Error) => void }
  >();

  /**
   * Pending prompt tracked for promptAndWait().
   * Stores resolve/reject and accumulates delta/reasoning text.
   */
  private pendingPrompt: {
    resolve: (result: { content: string; reasoning?: string }) => void;
    reject: (err: Error) => void;
    buffer: string;
    reasoningBuffer: string;
  } | null = null;

  constructor(callbacks: NativeBridgeCallbacks) {
    this.callbacks = callbacks;
  }

  /** Temporarily override the callbacks (used by streaming to attach stream-specific handlers). */
  setCallbacks(callbacks: NativeBridgeCallbacks): void {
    this.callbacks = callbacks;
  }

  /** Get current callbacks (so streaming can save and restore them). */
  getCallbacks(): NativeBridgeCallbacks {
    return this.callbacks;
  }

  /* ──── Public API ─────────────────────────────────────────────── */

  /** Open (or re-open) the native messaging port. */
  connect(): void {
    // SE JÁ SABEMOS QUE É FALHA PERMANENTE, NEM TENTA
    if (this.permanentFailure) {
      return;
    }

    if (this.port) {
      // Already connected or connecting
      return;
    }

    // Clear any pending reconnection timer
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.intentionalDisconnect = false;
    this.reconnectAttempts = 0; // Reset counter before attempting

    try {
      this.port = chrome.runtime.connectNative('com.pi.browseragent');

      this.port.onMessage.addListener((msg: any) => {
        this.handleMessage(msg);
      });

      this.port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError?.message;
        console.log('[NativeBridge] Disconnected', error ? `(${error})` : '');
        this.port = null;
        this.connected = false;

        // DETECTAR FALHA PERMANENTE — host não instalado
        if (error && error.includes('Specified native messaging host not found')) {
          this.permanentFailure = true;
          this.callbacks.onError('Native messaging host not available. Install the host or use fallback.');
          return; // NÃO tenta reconectar
        }

        // Reject any pending prompt (host disconnected unexpectedly)
        if (this.pendingPrompt) {
          const pp = this.pendingPrompt;
          this.pendingPrompt = null;
          pp.reject(new Error(error || 'Disconnected from native messaging host'));
        }

        if (!this.intentionalDisconnect) {
          this.scheduleReconnect();
        }
      });

      this.connected = true;
      console.log('[NativeBridge] Connected');
    } catch (e) {
      console.error('[NativeBridge] Failed to connect:', e);
      this.port = null;
      this.connected = false;
      this.callbacks.onError('Failed to connect to native messaging host');

      if (!this.intentionalDisconnect) {
        this.scheduleReconnect();
      }
    }
  }

  /** Close the native messaging port and stop reconnection. */
  disconnect(): void {
    this.intentionalDisconnect = true;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.port) {
      try {
        this.port.disconnect();
      } catch {
        // Ignore errors during disconnect
      }
      this.port = null;
    }
    this.connected = false;
    this.reconnectAttempts = 0;
    console.log('[NativeBridge] Disconnected by request');
  }

  /** Send a user prompt (with optional base64-encoded images). */
  prompt(message: string, images?: string[]): void {
    this.send({ type: 'prompt', message, images });
  }

  /**
   * Send a prompt and wait for the complete response.
   * Buffers delta/reasoning events until `done` is received,
   * then resolves the returned Promise with the accumulated content.
   */
  promptAndWait(
    message: string,
    images?: string[],
  ): Promise<{ content: string; reasoning?: string }> {
    // If not connected, try to connect now
    if (!this.port || !this.connected) {
      this.connect();
    }

    return new Promise((resolve, reject) => {
      this.pendingPrompt = {
        resolve,
        reject,
        buffer: '',
        reasoningBuffer: '',
      };
      this.prompt(message, images);
    });
  }

  /** Switch the active model on the host side. */
  setModel(provider: string, model: string): void {
    this.send({ type: 'setModel', provider, model });
  }

  /** Set the thinking/effort level on the host side. */
  setThinking(level: 'off' | 'low' | 'medium' | 'high'): void {
    this.send({ type: 'setThinking', level });
  }

  /** Abort the current generation. */
  abort(): void {
    this.send({ type: 'abort' });
  }

  /** Start a new conversation/session on the host. */
  newSession(): void {
    this.send({ type: 'newSession' });
  }

  /** Request the host to list available models/providers. */
  listModels(): void {
    this.send({ type: 'listModels' });
  }

  /** Override the system prompt on the host. */
  setSystemPrompt(prompt: string): void {
    this.send({ type: 'setSystemPrompt', prompt });
  }

  /** Ask the host to resume a previously persisted session, or create a new one. */
  resumeSession(sessionId?: string): void {
    this.send({ type: 'resumeSession', sessionId });
  }

  /** Send a tool execution result back to the host. */
  sendToolResult(toolCallId: string, content: string, error?: string, images?: string[]): void {
    this.send({ type: 'toolResult', toolCallId, content, error, images });
  }

  /** Retry connecting to native host (resets permanent failure flag). */
  retry(): void {
    this.permanentFailure = false;
    this.reconnectAttempts = 0;
    this.connect();
  }

  /** Check if the native messaging host is currently connected. */
  get isAvailable(): boolean {
    return this.connected;
  }

  /** Check if the host is permanently unavailable (not installed). */
  get isHostAvailable(): boolean {
    return !this.permanentFailure;
  }

  /**
   * Load models from config JSON files (fallback when host not available).
   * Merges custom overrides on top of defaults.
   */
  static async loadModelsFallback(): Promise<Array<{id: string; name: string; models: Array<{id: string; name: string}>}>> {
    try {
      const defaultUrl = chrome.runtime.getURL('config/models.default.json');
      const customUrl = chrome.runtime.getURL('config/models.custom.json');

      const [defaultResp, customResp] = await Promise.allSettled([
        fetch(defaultUrl).then(r => r.json()),
        fetch(customUrl).then(r => r.json()),
      ]);

      function providersObjectToArray(obj: Record<string, any>): Array<{id: string; name: string; models: Array<{id: string; name: string}>}> {
        return Object.entries(obj || {}).map(([id, p]: [string, any]) => ({
          id,
          name: p.name || id,
          models: (p.models || []).map((m: any) => ({
            id: m.id || m,
            name: m.name || m.id || String(m),
          })),
        }));
      }

      const defaultModels = defaultResp.status === 'fulfilled' ? defaultResp.value : null;
      let providers: Array<{id: string; name: string; models: Array<{id: string; name: string}>}> = [];

      if (defaultModels?.providers) {
        providers = providersObjectToArray(defaultModels.providers);
      }

      // Merge custom overrides
      if (customResp.status === 'fulfilled' && customResp.value?.providers) {
        const customProviders = providersObjectToArray(customResp.value.providers);
        for (const cp of customProviders) {
          const idx = providers.findIndex(p => p.id === cp.id);
          if (idx >= 0) {
            providers[idx] = cp; // override
          } else {
            providers.push(cp); // add new
          }
        }
      }

      return providers;
    } catch (e) {
      console.error('[NativeBridge] Failed to load models fallback:', e);
      return [];
    }
  }

  /* ──── Internal ───────────────────────────────────────────────── */

  /**
   * Send a JSON-serialisable message through the native port.
   * If the port is not available, attempts an automatic reconnect.
   */
  private send(msg: any): void {
    if (!this.port || !this.connected) {
      console.warn('[NativeBridge] Not connected, attempting reconnect...');
      this.connect();
      if (!this.port) {
        this.callbacks.onError('Native messaging host not available');
        return;
      }
    }
    try {
      this.port!.postMessage(msg);
    } catch (e) {
      console.error('[NativeBridge] Failed to send message:', e);
      this.callbacks.onError('Failed to send message to host');
    }
  }

  /**
   * Handle an incoming message from the native host.
   * Routes each message type to the appropriate callback.
   */
  private handleMessage(msg: any): void {
    switch (msg.type) {
      case 'delta':
        this.callbacks.onDelta(msg.text);
        // Buffer for pending prompt
        if (this.pendingPrompt) {
          this.pendingPrompt.buffer += msg.text;
        }
        break;

      case 'reasoning':
        this.callbacks.onReasoning(msg.text);
        // Buffer for pending prompt
        if (this.pendingPrompt) {
          this.pendingPrompt.reasoningBuffer += msg.text;
        }
        break;

      case 'toolStart':
        // Notify UI that a tool started — no dedicated callback yet
        break;

      case 'compaction':
        // Conversation compaction event from Pi SDK — informational, no action needed
        break;

      case 'toolExec':
        // The host wants to execute a browser tool.
        // Delegate to the registered callback and send the result back.
        this.callbacks
          .onToolExec(msg.toolCallId, msg.name, msg.args)
          .then((result) => {
            this.sendToolResult(msg.toolCallId, result.content, result.error, result.images);
          })
          .catch((err) => {
            this.sendToolResult(msg.toolCallId, '', err.message);
          });
        break;

      case 'toolEnd':
        this.callbacks.onToolEnd(msg.name, msg.result, msg.error);
        break;

      case 'turnEnd':
        this.callbacks.onTurnEnd(msg.text, msg.reasoning);
        break;

      case 'done':
        this.callbacks.onDone();
        // Resolve pending prompt
        if (this.pendingPrompt) {
          const pp = this.pendingPrompt;
          this.pendingPrompt = null;
          pp.resolve({
            content: pp.buffer,
            reasoning: pp.reasoningBuffer || undefined,
          });
        }
        break;

      case 'error':
        this.callbacks.onError(msg.message);
        // Reject pending prompt
        if (this.pendingPrompt) {
          const pp = this.pendingPrompt;
          this.pendingPrompt = null;
          pp.reject(new Error(msg.message));
        }
        break;

      case 'modelList':
        this.callbacks.onModelList(msg.providers);
        break;

      case 'sessionInfo':
        this.callbacks.onSessionInfo(msg.sessionId, msg.messageCount);
        break;

      default:
        console.warn('[NativeBridge] Unknown message type:', msg.type);
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   * Doubles the delay after each attempt, capped at RECONNECT_MAX_MS.
   */
  private scheduleReconnect(): void {
    if (this.intentionalDisconnect) {
      return;
    }

    this.reconnectAttempts++;

    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.error('[NativeBridge] Max reconnect attempts reached, giving up');
      this.callbacks.onError(
        `Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`,
      );
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, … capped at 30s
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts - 1),
      RECONNECT_MAX_MS,
    );

    console.log(
      `[NativeBridge] Scheduling reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
