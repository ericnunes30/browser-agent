/* ------------------------------------------------------------------ */
/*  DebuggerSessionManager — wraps chrome.debugger CDP API             */
/*                                                                     */
/*  Replaces chrome.scripting.executeScript + new Function() with      */
/*  Chrome DevTools Protocol commands that BYPASS page CSP entirely.   */
/*                                                                     */
/*  All methods auto-attach to the tab on first use.                   */
/* ------------------------------------------------------------------ */

/**
 * Manages chrome.debugger sessions per tab, providing high-level
 * CDP commands for browser automation (click, type, screenshot, etc.)
 */
export class DebuggerSessionManager {
  private sessions = new Map<number, boolean>();
  private detachedHandlers = new Map<number, () => void>();

  /**
   * Attach debugger to a tab. Safe to call multiple times for the same tab.
   */
  async attach(tabId: number): Promise<void> {
    if (this.sessions.has(tabId)) return;

    return new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId }, "1.3", () => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || "";
          // Already attached is fine
          if (errMsg.includes("already attached")) {
            this.sessions.set(tabId, true);
            resolve();
            return;
          }
          reject(new Error(errMsg));
        } else {
          this.sessions.set(tabId, true);

          // Auto-cleanup when tab is closed or debugger detaches
          const onDetach = (source: chrome.debugger.Debuggee) => {
            if (source.tabId === tabId) {
              this.sessions.delete(tabId);
              const cleanup = this.detachedHandlers.get(tabId);
              if (cleanup) {
                chrome.debugger.onDetach.removeListener(cleanup as any);
                this.detachedHandlers.delete(tabId);
              }
            }
          };
          chrome.debugger.onDetach.addListener(onDetach);
          this.detachedHandlers.set(tabId, () => {
            chrome.debugger.onDetach.removeListener(onDetach);
          });

          resolve();
        }
      });
    });
  }

  /**
   * Detach debugger from a tab.
   */
  async detach(tabId: number): Promise<void> {
    if (!this.sessions.has(tabId)) return;

    this.detachedHandlers.get(tabId)?.();
    this.detachedHandlers.delete(tabId);

    return new Promise((resolve) => {
      chrome.debugger.detach({ tabId }, () => {
        this.sessions.delete(tabId);
        resolve();
      });
    });
  }

  /**
   * Send a CDP command to a tab. Auto-attaches if not yet attached.
   */
  async sendCommand(tabId: number, method: string, params?: object): Promise<any> {
    await this.attach(tabId);

    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Evaluate JavaScript in the page's main world via CDP.
   * Bypasses CSP and Trusted Types!
   */
  async evaluate(tabId: number, expression: string): Promise<any> {
    const result = await this.sendCommand(tabId, "Runtime.evaluate", {
      expression,
      replMode: false,
      awaitPromise: true,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      const text =
        result.exceptionDetails.text ||
        result.exceptionDetails.exception?.description ||
        "CDP evaluation error";
      throw new Error(text);
    }

    return result.result?.value;
  }

  /**
   * Capture a screenshot of the tab via CDP.
   * Works on ANY tab — not just the active tab!
   */
  async captureScreenshot(tabId: number): Promise<string> {
    const result = await this.sendCommand(tabId, "Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    return result.data; // base64-encoded PNG
  }

  /**
   * Click at (x, y) coordinates.
   */
  async click(
    tabId: number,
    x: number,
    y: number,
    button: "left" | "right" | "middle" = "left",
    clickCount: number = 1,
  ): Promise<void> {
    const btnType = button;

    for (let i = 0; i < clickCount; i++) {
      await this.sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        x,
        y,
        button: btnType,
        clickCount: i + 1,
      });
      await this.sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button: btnType,
        clickCount: i + 1,
      });
    }
  }

  /**
   * Hover/move mouse to (x, y).
   */
  async hover(tabId: number, x: number, y: number): Promise<void> {
    await this.sendCommand(tabId, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
    });
  }

  /**
   * Type text at the currently focused element.
   */
  async type(tabId: number, text: string): Promise<void> {
    await this.sendCommand(tabId, "Input.insertText", {
      text,
    });
  }

  /**
   * Press keyboard keys.
   * Maps common key names to proper CDP key codes for compatibility.
   */
  async pressKey(tabId: number, keys: string[]): Promise<void> {
    // Map common special keys to their Windows VK codes and DOM code strings
    const SPECIAL_KEY_MAP: Record<string, { vk: number; code: string }> = {
      'Enter': { vk: 13, code: 'Enter' },
      'Tab': { vk: 9, code: 'Tab' },
      'Escape': { vk: 27, code: 'Escape' },
      'Backspace': { vk: 8, code: 'Backspace' },
      'Delete': { vk: 46, code: 'Delete' },
      'ArrowUp': { vk: 38, code: 'ArrowUp' },
      'ArrowDown': { vk: 40, code: 'ArrowDown' },
      'ArrowLeft': { vk: 37, code: 'ArrowLeft' },
      'ArrowRight': { vk: 39, code: 'ArrowRight' },
      'Home': { vk: 36, code: 'Home' },
      'End': { vk: 35, code: 'End' },
      'PageUp': { vk: 33, code: 'PageUp' },
      'PageDown': { vk: 34, code: 'PageDown' },
      'Shift': { vk: 16, code: 'ShiftLeft' },
      'Control': { vk: 17, code: 'ControlLeft' },
      'Alt': { vk: 18, code: 'AltLeft' },
      'Meta': { vk: 91, code: 'MetaLeft' },
      'Space': { vk: 32, code: 'Space' },
    };

    for (const key of keys) {
      const special = SPECIAL_KEY_MAP[key];
      const windowsVirtualKeyCode = special ? special.vk : (key.length === 1 ? key.charCodeAt(0) : 0);
      const code = special ? special.code : undefined;

      // Use keyDown (not rawKeyDown) to generate both keydown AND keypress events.
      // Important for web apps (chat, forms) that listen for keypress to detect Enter.
      await this.sendCommand(tabId, "Input.dispatchKeyEvent", {
        type: "keyDown",
        key,
        code,
        windowsVirtualKeyCode,
        ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}),
      });
      await this.sendCommand(tabId, "Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
        code,
        windowsVirtualKeyCode,
      });
    }
  }

  /**
   * Scroll the page by delta (dx, dy).
   */
  async scroll(tabId: number, dx: number, dy: number): Promise<void> {
    await this.sendCommand(tabId, "Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: 0,
      y: 0,
      deltaX: dx,
      deltaY: dy,
    });
  }

  /**
   * Drag from (startX, startY) to (endX, endY).
   */
  async drag(
    tabId: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): Promise<void> {
    await this.sendCommand(tabId, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: startX,
      y: startY,
      button: "left",
      clickCount: 1,
    });
    await this.sendCommand(tabId, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: endX,
      y: endY,
    });
    await this.sendCommand(tabId, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: endX,
      y: endY,
      button: "left",
      clickCount: 1,
    });
  }

  /**
   * Detach from ALL tabs.
   */
  async detachAll(): Promise<void> {
    const tabIds = Array.from(this.sessions.keys());
    for (const tabId of tabIds) {
      await this.detach(tabId).catch(() => {});
    }
  }
}

/** Singleton instance */
export const debuggerManager = new DebuggerSessionManager();
