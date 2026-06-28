/* ------------------------------------------------------------------ */
/*  ChatStream — Port-based streaming for Side Panel                   */
/* ------------------------------------------------------------------ */
/**
 * Gerencia uma conexão de streaming para uma única mensagem.
 * Abre uma porta `chrome.runtime.connect({ name: 'chat-stream' })`,
 * envia o prompt, e roteia os eventos delta/reasoning/tool/done/error
 * para os callbacks fornecidos.
 */

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onReasoning: (text: string) => void;
  onToolStart: (name: string) => void;
  onToolEnd: (name: string) => void;
  onDone: (content: string, reasoning?: string) => void;
  onError: (error: string) => void;
  onContinuePrompt?: () => void;
}

export class ChatStream {
  private port: chrome.runtime.Port | null = null;
  private _callbacks: StreamCallbacks | null = null;

  start(
    provider: string,
    model: string,
    messages: any[],
    tabId: number | null,
    callbacks: StreamCallbacks,
  ): void {
    console.log('[ChatStream] start() called, connecting...');
    this._callbacks = callbacks;
    try {
      this.port = chrome.runtime.connect({ name: 'chat-stream' });
      console.log('[ChatStream] port connected:', !!this.port);
    } catch (e) {
      console.error('[ChatStream] FAILED to connect port:', e);
      callbacks.onError(`Connection failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    let accumulatedText = '';
    let accumulatedReasoning = '';

    // Detect disconnection before any message is received (SW shutdown/restart)
    this.port.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) {
        console.error('[ChatStream] Port disconnected with error:', chrome.runtime.lastError.message);
      } else {
        console.log('[ChatStream] Port disconnected (normal cleanup)');
      }
    });

    this.port.onMessage.addListener((msg: any) => {
      switch (msg.type) {
        case 'chat:delta':
          accumulatedText += msg.text;
          callbacks.onDelta(msg.text);
          break;

        case 'chat:reasoning':
          accumulatedReasoning += msg.text;
          callbacks.onReasoning(msg.text);
          break;

        case 'chat:toolStart':
          callbacks.onToolStart(msg.name);
          break;

        case 'chat:toolEnd':
          callbacks.onToolEnd(msg.name);
          break;

        case 'chat:continuePrompt':
          callbacks.onContinuePrompt?.();
          break;

        case 'chat:result':
          callbacks.onDone(accumulatedText, accumulatedReasoning || undefined);
          this.cleanup();
          break;

        case 'chat:error':
          callbacks.onError(msg.error);
          this.cleanup();
          break;
      }
    });

    // Send the initial request
    this.port.postMessage({
      type: 'chat:send',
      provider,
      model,
      messages,
      tabId,
    });
  }

  /** Respond to a continue prompt from the service worker. */
  respondContinue(shouldContinue: boolean): void {
    if (this.port) {
      this.port.postMessage({ type: 'chat:continueResponse', continue: shouldContinue });
    }
  }

  stop(): void {
    if (this.port) {
      this.port.postMessage({ type: 'chat:stop' });
      this.cleanup();
    }
  }

  private cleanup(): void {
    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }
    this._callbacks = null;
  }
}
