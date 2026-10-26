/* ------------------------------------------------------------------ */
/*  Agent Visual Indicator — phantom cursor, glow, stop button,        */
/*  static indicator. Wayfinding light theme (cobalt #1E46E8).         */
/* ------------------------------------------------------------------ */

(function () {
  // ── State ──────────────────────────────────────────────────────
  let phantomCursor: HTMLDivElement | null = null;
  let plainCursorSvg: SVGElement | null = null;
  let styledCursorSvg: SVGElement | null = null;
  let glowBorder: HTMLDivElement | null = null;
  let stopContainer: HTMLDivElement | null = null;
  let stopButton: HTMLButtonElement | null = null;
  let staticIndicator: HTMLDivElement | null = null;
  let cursorX = 0;
  let cursorY = 0;
  let active = false;
  let staticActive = false;
  let audioCtx: AudioContext | null = null;
  let staticHeartbeat: ReturnType<typeof setInterval> | null = null;
  let hiddenForTool = false;
  let wasActiveBeforeHide = false;
  let isMcpMode = false;
  let shieldElement: HTMLDivElement | null = null;
  let cursorInactivityTimer: ReturnType<typeof setTimeout> | null = null;
  let actionLabelEl: HTMLDivElement | null = null;
  let dragPathEl: SVGSVGElement | null = null;

  const COBALT = '#1E46E8';
  const BG_CREAM = '#FBFAF5';
  const TEXT_DARK = '#121517';
  const BORDER_LIGHT = 'rgba(18, 21, 23, 0.30)';

  // ── Phantom Cursor ──────────────────────────────────────────────

  function createPhantomCursor(
    x: number,
    y: number,
  ): { container: HTMLDivElement; styled: SVGElement } {
    const container = document.createElement('div');
    container.id = 'ba-phantom-cursor';
    container.setAttribute('aria-hidden', 'true');
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 2147483646;
      transform: translate3d(${x}px, ${y}px, 0);
      transition: transform 180ms cubic-bezier(0.2, 0, 0, 1), opacity 500ms ease;
      will-change: transform;
      opacity: 1;
    `;

    // SVG cursor path
    const cursorPath =
      'M0 0 L0 18 L4.5 14 L7.5 21.5 L11 20 L8 13 L14 13 Z';

    function makeSvg(
      id: string,
      stroke: string,
      fill: string,
      extraStyle = '',
    ): SVGElement {
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('id', id);
      svg.setAttribute('width', '20');
      svg.setAttribute('height', '26');
      svg.setAttribute('viewBox', '0 0 20 26');
      svg.style.cssText = `position:absolute; top:0; left:0; overflow:visible; ${extraStyle}`;

      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', cursorPath);
      path.setAttribute('stroke', stroke);
      path.setAttribute('stroke-width', '3');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('fill', stroke);

      const inner = document.createElementNS(svgNS, 'path');
      inner.setAttribute('d', cursorPath);
      inner.setAttribute('fill', fill);

      svg.appendChild(path);
      svg.appendChild(inner);
      return svg;
    }

    const plain = makeSvg('ba-phantom-cursor-plain', 'white', '#111', '');
    const styled = makeSvg(
      'ba-phantom-cursor-styled',
      COBALT,
      BG_CREAM,
      `filter: drop-shadow(0 0 4px rgba(30,70,232,0.9)) drop-shadow(0 0 10px rgba(30,70,232,0.45));`,
    );

    container.appendChild(plain);
    container.appendChild(styled);
    document.body.appendChild(container);

    return { container, styled };
  }

  function moveCursor(
    x: number,
    y: number,
  ): Promise<void> {
    if (!active) return Promise.resolve();

    const sameTarget = cursorX === x && cursorY === y;
    cursorX = x;
    cursorY = y;

    if (!phantomCursor) {
      const result = createPhantomCursor(x, y);
      phantomCursor = result.container;
      styledCursorSvg = result.styled;
      return Promise.resolve();
    }

    phantomCursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    // Reset inactivity timer — restore cursor visibility on movement
    if (phantomCursor) {
      phantomCursor.style.opacity = '1';
    }
    if (cursorInactivityTimer) {
      clearTimeout(cursorInactivityTimer);
    }
    cursorInactivityTimer = setTimeout(() => {
      if (phantomCursor && active) {
        phantomCursor.style.opacity = '0';
      }
    }, 2000);

    if (document.hidden) return Promise.resolve();

    return new Promise<void>((resolve) => {
      let done = false;
      const onEnd = () => {
        if (!done) {
          done = true;
          phantomCursor?.removeEventListener('transitionend', onEnd);
          resolve();
        }
      };
      phantomCursor?.addEventListener('transitionend', onEnd, { once: true });
      setTimeout(onEnd, 220);
    });
  }

  function removeCursor() {
    if (phantomCursor?.parentNode) {
      phantomCursor.parentNode.removeChild(phantomCursor);
    }
    phantomCursor = null;
    styledCursorSvg = null;
    if (cursorInactivityTimer) {
      clearTimeout(cursorInactivityTimer);
      cursorInactivityTimer = null;
    }
  }

  // ── Click Ripple ────────────────────────────────────────────────

  function showClickRipple(x: number, y: number) {
    const ripple = document.createElement('div');
    ripple.id = 'ba-click-ripple';
    ripple.style.cssText = `
      position: fixed;
      left: ${x - 12}px;
      top: ${y - 12}px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(30, 70, 232, 0.4);
      box-shadow: 0 0 10px 2px rgba(30, 70, 232, 0.3);
      pointer-events: none;
      z-index: 2147483647;
      animation: ba-ripple 400ms ease-out forwards;
    `;
    document.body.appendChild(ripple);

    // Auto-remove after animation completes
    ripple.addEventListener('animationend', () => {
      ripple.remove();
    }, { once: true });
  }

  // ── Glow Border ────────────────────────────────────────────────

  function showGlow() {
    if (!document.getElementById('ba-agent-animation-styles')) {
      const style = document.createElement('style');
      style.id = 'ba-agent-animation-styles';
      style.textContent = `
        @keyframes ba-glow {
          0% {
            box-shadow:
              inset 0 0 10px rgba(30, 70, 232, 0.5),
              inset 0 0 20px rgba(30, 70, 232, 0.3),
              inset 0 0 30px rgba(30, 70, 232, 0.1);
          }
          50% {
            box-shadow:
              inset 0 0 15px rgba(30, 70, 232, 0.7),
              inset 0 0 25px rgba(30, 70, 232, 0.5),
              inset 0 0 35px rgba(30, 70, 232, 0.2);
          }
          100% {
            box-shadow:
              inset 0 0 10px rgba(30, 70, 232, 0.5),
              inset 0 0 20px rgba(30, 70, 232, 0.3),
              inset 0 0 30px rgba(30, 70, 232, 0.1);
          }
        }
        @keyframes ba-ripple {
          0% { transform: scale(0); opacity: 1; }
          50% { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes ba-fade-in {
          0% { opacity: 0; transform: translateX(-50%) translateY(-4px); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }

    if (glowBorder) {
      glowBorder.style.display = '';
    } else {
      glowBorder = document.createElement('div');
      glowBorder.id = 'ba-agent-glow-border';
      glowBorder.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        z-index: 2147483646;
        opacity: 0;
        transition: opacity 0.3s ease-in-out;
        animation: ba-glow 2s ease-in-out infinite;
        box-shadow:
          inset 0 0 10px rgba(30, 70, 232, 0.5),
          inset 0 0 20px rgba(30, 70, 232, 0.3),
          inset 0 0 30px rgba(30, 70, 232, 0.1);
      `;
      document.body.appendChild(glowBorder);
    }
  }

  // ── Stop Button ────────────────────────────────────────────────

  function showStopButton() {
    if (stopContainer) {
      stopContainer.style.display = '';
    } else {
      stopContainer = document.createElement('div');
      stopContainer.id = 'ba-agent-stop-container';
      stopContainer.style.cssText = `
        position: fixed;
        bottom: 16px;
        left: 16px;
        display: flex;
        justify-content: center;
        align-items: center;
        pointer-events: none;
        z-index: 2147483647;
      `;

      stopButton = document.createElement('button');
      stopButton.id = 'ba-agent-stop-button';
      stopButton.textContent = 'Stop';
      stopButton.style.cssText = `
        position: relative;
        transform: translateY(100px);
        padding: 10px 20px;
        background: #1E46E8;
        color: #fff;
        border: none;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(30, 70, 232, 0.4);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        opacity: 0;
        user-select: none;
        pointer-events: auto;
        white-space: nowrap;
      `;

      const btn = stopButton;
      btn.addEventListener('mouseenter', () => {
        if (active) {
          btn.style.background = '#16349E';
        }
      });
      btn.addEventListener('mouseleave', () => {
        if (active) {
          btn.style.background = '#1E46E8';
        }
      });
      stopButton.addEventListener('click', async () => {
        try {
          await chrome.runtime.sendMessage({ type: 'indicator:stop' });
        } catch {
          // extension context invalidated
        }
      });

      stopContainer.appendChild(stopButton);
      document.body.appendChild(stopContainer);
    }
  }

  // ── Action Label ─────────────────────────────────────────────

  function showActionLabel(text: string) {
    hideActionLabel();

    actionLabelEl = document.createElement('div');
    actionLabelEl.id = 'ba-action-label';
    actionLabelEl.textContent = text;
    actionLabelEl.style.cssText = `
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.75);
      color: #fff;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      padding: 6px 14px;
      border-radius: 8px;
      backdrop-filter: blur(4px);
      pointer-events: none;
      z-index: 2147483647;
      white-space: nowrap;
      animation: ba-fade-in 150ms ease-out forwards;
    `;
    document.body.appendChild(actionLabelEl);
  }

  function hideActionLabel() {
    if (actionLabelEl) {
      actionLabelEl.remove();
      actionLabelEl = null;
    }
  }

  // ── Simple Static Dot ─────────────────────────────────────────

  function showStaticDot() {
    if (document.getElementById('ba-static-dot')) return;

    const dot = document.createElement('div');
    dot.id = 'ba-static-dot';
    dot.title = 'BrowserAgent is active';
    dot.style.cssText = `
      position: fixed;
      top: 8px;
      right: 8px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #1E46E8;
      box-shadow: 0 0 4px rgba(30, 70, 232, 0.5);
      z-index: 2147483647;
      pointer-events: none;
      animation: ba-pulse 2s ease-in-out infinite;
    `;
    document.body.appendChild(dot);
  }

  function hideStaticDot() {
    const dot = document.getElementById('ba-static-dot');
    if (dot) dot.remove();
  }

  function injectAnimations() {
    if (document.getElementById('ba-animations')) return;
    const style = document.createElement('style');
    style.id = 'ba-animations';
    style.textContent = `
      @keyframes ba-pulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Drag Path ─────────────────────────────────────────────────

  function showDragPath(startX: number, startY: number, endX: number, endY: number) {
    // Remove existing drag path if any
    if (dragPathEl) {
      dragPathEl.remove();
      dragPathEl = null;
    }

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('id', 'ba-drag-path');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2147483647;
    `;

    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', String(startX));
    line.setAttribute('y1', String(startY));
    line.setAttribute('x2', String(endX));
    line.setAttribute('y2', String(endY));
    line.setAttribute('stroke', '#D6472F');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '6,4');
    line.setAttribute('stroke-linecap', 'round');

    svg.appendChild(line);
    document.body.appendChild(svg);
    dragPathEl = svg;

    // Auto-remove after 1000ms
    setTimeout(() => {
      if (dragPathEl) {
        dragPathEl.remove();
        dragPathEl = null;
      }
    }, 1000);
  }

  // ── Audio context (keep alive) ─────────────────────────────────

  function initAudioContext() {
    if (audioCtx) return;
    try {
      audioCtx = new AudioContext();
      const gain = audioCtx.createGain();
      (gain as unknown as { value: number }).value = 0;
      gain.connect(audioCtx.destination);
      const source = audioCtx.createConstantSource();
      source.connect(gain);
      source.start();
      document.addEventListener(
        'pointerdown',
        () => {
          if (active) audioCtx?.resume().catch(() => {});
        },
        { capture: true },
      );
    } catch {
      // audio not available
    }
  }

  function resumeAudio() {
    try {
      audioCtx?.resume().catch(() => {});
    } catch {
      // ignore
    }
  }

  // ── Show all indicators ───────────────────────────────────────

  function showAll() {
    active = true;
    showGlow();
    showStopButton();

    // Animate in
    if (glowBorder) glowBorder.style.opacity = '1';
    if (stopButton) {
      (stopButton as HTMLElement).style.transform = 'translateY(0)';
      (stopButton as HTMLElement).style.opacity = '1';
    }

    // Ensure cursor exists at center of page
    const cx = cursorX || Math.round(window.innerWidth / 2);
    const cy = cursorY || Math.round(window.innerHeight / 2);
    if (!phantomCursor) {
      const result = createPhantomCursor(cx, cy);
      phantomCursor = result.container;
      styledCursorSvg = result.styled;
      cursorX = cx;
      cursorY = cy;
    }

    initAudioContext();
    resumeAudio();
  }

  // ── Hide all indicators ───────────────────────────────────────

  function hideAll() {
    if (!active) return;
    active = false;

    if (glowBorder) glowBorder.style.opacity = '0';
    if (stopButton) {
      (stopButton as HTMLElement).style.transform = 'translateY(100px)';
      (stopButton as HTMLElement).style.opacity = '0';
    }

    hideActionLabel();
    if (dragPathEl) {
      dragPathEl.remove();
      dragPathEl = null;
    }

    setTimeout(() => {
      if (!active) {
        if (glowBorder?.parentNode) glowBorder.parentNode.removeChild(glowBorder);
        glowBorder = null;
        if (stopContainer?.parentNode) stopContainer.parentNode.removeChild(stopContainer);
        stopContainer = null;
        stopButton = null;
        removeCursor();
      }
    }, 300);

    audioCtx?.suspend().catch(() => {});
  }

  // ── Static Indicator ──────────────────────────────────────────

  function showStatic() {
    staticActive = true;

    if (staticIndicator) {
      staticIndicator.style.display = '';
    } else {
      staticIndicator = document.createElement('div');
      staticIndicator.id = 'ba-static-indicator-container';
      staticIndicator.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; flex-shrink: 0; margin-right: 8px;"><rect width="32" height="32" rx="8" fill="#1E46E8"/><path d="M10.5 5 L10.5 21.2 L14.55 17.6 L17.25 24.35 L20.4 23.1 L17.7 16.7 L22.8 16.7 Z" fill="#F3F0E7"/></svg>
        <span style="vertical-align: middle; color: ${TEXT_DARK}; font-size: 14px; display: inline-block;">BrowserAgent is on this tab.</span>
        <div style="display: inline-block; width: 0.5px; height: 32px; background: rgba(31, 30, 29, 0.15); margin: 0 8px; vertical-align: middle;"></div>
        <button id="ba-static-chat-button" style="position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 6px; background: transparent; border: none; cursor: pointer; pointer-events: auto; vertical-align: middle; width: 32px; height: 32px; border-radius: 8px; transition: background 0.2s;">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="${TEXT_DARK}" xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; display: block;">
            <path d="M10 2.5C14.1421 2.5 17.5 5.85786 17.5 10C17.5 14.1421 14.1421 17.5 10 17.5H3C2.79779 17.5 2.61549 17.3782 2.53809 17.1914C2.4607 17.0046 2.50349 16.7895 2.64648 16.6465L4.35547 14.9365C3.20124 13.6175 2.5 11.8906 2.5 10C2.5 5.85786 5.85786 2.5 10 2.5ZM10 3.5C6.41015 3.5 3.5 6.41015 3.5 10C3.5 11.7952 4.22659 13.4199 5.40332 14.5967L5.46582 14.6729C5.52017 14.7544 5.5498 14.8508 5.5498 14.9502C5.5498 15.0828 5.49709 15.2099 5.40332 15.3037L4.20703 16.5H10C13.5899 16.5 16.5 13.5899 16.5 10C16.5 6.41015 13.5899 3.5 10 3.5ZM13.29 9.30371C13.3986 9.05001 13.6925 8.93174 13.9463 9.04004C14.2 9.14863 14.3183 9.44253 14.21 9.69629C13.8506 10.536 13.1645 11.25 12.25 11.25C11.6372 11.25 11.128 10.9289 10.75 10.4648C10.372 10.9289 9.86276 11.25 9.25 11.25C8.63724 11.25 8.12801 10.9289 7.75 10.4648C7.37198 10.9289 6.86276 11.25 6.25 11.25C5.97386 11.25 5.75 11.0261 5.75 10.75C5.75 10.4739 5.97386 10.25 6.25 10.25C6.58764 10.25 7.00448 9.97056 7.29004 9.30371L7.32422 9.2373C7.41431 9.09121 7.5749 9 7.75 9C7.9501 9 8.13123 9.11975 8.20996 9.30371L8.32227 9.53516C8.59804 10.0359 8.95442 10.25 9.25 10.25C9.58764 10.25 10.0045 9.97056 10.29 9.30371L10.3242 9.2373C10.4143 9.09121 10.5749 9 10.75 9C10.9501 9 11.1312 9.11975 11.21 9.30371L11.3223 9.53516C11.598 10.0359 11.9544 10.25 12.25 10.25C12.5876 10.25 13.0045 9.97056 13.29 9.30371Z" />
          </svg>
          <span id="ba-static-chat-tooltip" style="position: absolute; bottom: calc(100% + 12px); left: 50%; transform: translateX(-50%); padding: 6px 12px; background: #121517; color: ${BG_CREAM}; border-radius: 6px; font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.2s; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">Open chat</span>
        </button>
        <button id="ba-static-close-button" style="position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 6px; background: transparent; border: none; cursor: pointer; pointer-events: auto; vertical-align: middle; width: 32px; height: 32px; margin-left: 4px; border-radius: 8px; transition: background 0.2s;">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; display: block;">
            <path d="M15.1464 4.14642C15.3417 3.95121 15.6582 3.95118 15.8534 4.14642C16.0486 4.34168 16.0486 4.65822 15.8534 4.85346L10.7069 9.99997L15.8534 15.1465C16.0486 15.3417 16.0486 15.6583 15.8534 15.8535C15.6826 16.0244 15.4186 16.0461 15.2245 15.918L15.1464 15.8535L9.99989 10.707L4.85338 15.8535C4.65813 16.0486 4.34155 16.0486 4.14634 15.8535C3.95115 15.6583 3.95129 15.3418 4.14634 15.1465L9.29286 9.99997L4.14634 4.85346C3.95129 4.65818 3.95115 4.34162 4.14634 4.14642C4.34154 3.95128 4.65812 3.95138 4.85338 4.14642L9.99989 9.29294L15.1464 4.14642Z" fill="${TEXT_DARK}"/>
          </svg>
          <span id="ba-static-close-tooltip" style="position: absolute; bottom: calc(100% + 12px); left: 50%; transform: translateX(-50%); padding: 6px 12px; background: #121517; color: ${BG_CREAM}; border-radius: 6px; font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.2s; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">Dismiss</span>
        </button>
      `;
      staticIndicator.style.cssText = `
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 6px 6px 16px;
        background: ${BG_CREAM};
        border: 0.5px solid ${BORDER_LIGHT};
        border-radius: 14px;
        box-shadow: 0 40px 80px 0 rgba(0, 0, 0, 0.15);
        z-index: 2147483647;
        pointer-events: none;
        white-space: nowrap;
        user-select: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      `;

      // Chat button events
      const chatBtn = staticIndicator.querySelector('#ba-static-chat-button') as HTMLElement | null;
      if (chatBtn) {
        const tooltip = staticIndicator.querySelector('#ba-static-chat-tooltip') as HTMLElement | null;
        chatBtn.addEventListener('mouseenter', () => {
          chatBtn.style.background = '#F3F0E7';
          if (tooltip) tooltip.style.opacity = '1';
        });
        chatBtn.addEventListener('mouseleave', () => {
          chatBtn.style.background = 'transparent';
          if (tooltip) tooltip.style.opacity = '0';
        });
        chatBtn.addEventListener('click', async () => {
          try {
            await chrome.runtime.sendMessage({ type: 'SWITCH_TO_MAIN_TAB' });
          } catch { /* ignore */ }
        });
      }

      // Close button events
      const closeBtn = staticIndicator.querySelector('#ba-static-close-button') as HTMLElement | null;
      if (closeBtn) {
        const tooltip = staticIndicator.querySelector('#ba-static-close-tooltip') as HTMLElement | null;
        closeBtn.addEventListener('mouseenter', () => {
          closeBtn.style.background = '#F3F0E7';
          if (tooltip) tooltip.style.opacity = '1';
        });
        closeBtn.addEventListener('mouseleave', () => {
          closeBtn.style.background = 'transparent';
          if (tooltip) tooltip.style.opacity = '0';
        });
        closeBtn.addEventListener('click', async () => {
          try {
            await chrome.runtime.sendMessage({ type: 'DISMISS_STATIC_INDICATOR_FOR_GROUP' });
          } catch { /* ignore */ }
        });
      }

      document.body.appendChild(staticIndicator);
    }

    // Start heartbeat
    if (staticHeartbeat) clearInterval(staticHeartbeat);
    staticHeartbeat = setInterval(async () => {
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'STATIC_INDICATOR_HEARTBEAT' });
        if (!resp?.success) hideStatic();
      } catch {
        hideStatic();
      }
    }, 5000);
  }

  function hideStatic() {
    staticActive = false;
    if (staticHeartbeat) {
      clearInterval(staticHeartbeat);
      staticHeartbeat = null;
    }
    if (staticIndicator?.parentNode) {
      staticIndicator.parentNode.removeChild(staticIndicator);
      staticIndicator = null;
    }
  }

  // ── Hide/show for tool use ────────────────────────────────────

  function hideForToolUse() {
    hiddenForTool = true;
    wasActiveBeforeHide = active;
    if (glowBorder) glowBorder.style.display = 'none';
    if (stopContainer) stopContainer.style.display = 'none';
    if (styledCursorSvg) styledCursorSvg.style.display = 'none';
    if (staticIndicator) staticIndicator.style.display = 'none';
    hideActionLabel();
    if (dragPathEl) {
      dragPathEl.style.display = 'none';
    }
  }

  function showAfterToolUse() {
    hiddenForTool = false;
    if (wasActiveBeforeHide) {
      if (glowBorder) glowBorder.style.display = '';
      if (stopContainer) stopContainer.style.display = '';
      if (styledCursorSvg) styledCursorSvg.style.display = '';
    }
    if (staticActive && staticIndicator) {
      staticIndicator.style.display = '';
    }
    if (dragPathEl) {
      dragPathEl.style.display = '';
    }
  }

  // ── Shield Indicator ──────────────────────────────────────────

  function createShieldSVG(isDark: boolean): string {
    const color = isDark ? '#1E46E8' : '#16349E';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256">
    <path fill="${color}" d="M208 40H48a8 8 0 0 0-8 8v58.77c0 88.62 49.33 109.58 73.68 118.44a52.67 52.67 0 0 0 12.32 2.79h.13a51.15 51.15 0 0 0 12.86-2.79C166.67 216.35 216 195.39 216 106.77V48a8 8 0 0 0-8-8Zm-64 152h-32v-56h32Z"/>
  </svg>`;
  }

  function showShield(restricted: boolean) {
    if (!shieldElement) {
      shieldElement = document.createElement('div');
      shieldElement.id = 'ba-shield-indicator';
      document.body.appendChild(shieldElement);
    }

    const isDark = !document.body.classList.contains('light') &&
      getComputedStyle(document.body).backgroundColor?.startsWith('rgb(255') === false;

    shieldElement.innerHTML = createShieldSVG(isDark);
    shieldElement.style.cssText = `
      position: fixed;
      top: 8px;
      right: 8px;
      z-index: 2147483646;
      cursor: default;
      pointer-events: none;
      opacity: ${restricted ? 1 : 0.5};
      transition: opacity 0.2s;
      ${restricted ? 'filter: drop-shadow(0 0 4px rgba(30, 70, 232, 0.5));' : ''}
    `;
  }

  function hideShield() {
    if (shieldElement) {
      shieldElement.remove();
      shieldElement = null;
    }
  }

  // ── Message handler ───────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
    switch (msg.type) {
      case 'SHOW_AGENT_INDICATORS':
        isMcpMode = !!msg.isMcp;
        showAll();
        sendResponse({ success: true });
        break;

      case 'HIDE_AGENT_INDICATORS':
        hideAll();
        hideStaticDot();
        sendResponse({ success: true });
        break;

      case 'UPDATE_PHANTOM_CURSOR':
        moveCursor(msg.x, msg.y).then(() => sendResponse({ success: true }));
        return true; // async

      case 'HIDE_FOR_TOOL_USE':
        hideForToolUse();
        sendResponse({ success: true });
        break;

      case 'SHOW_AFTER_TOOL_USE':
        showAfterToolUse();
        sendResponse({ success: true });
        break;

      case 'SHOW_STATIC_INDICATOR':
        injectAnimations();  // ensure pulse keyframe exists
        showStaticDot();     // show the simple orange dot at top-right
        showStatic();
        sendResponse({ success: true });
        break;

      case 'HIDE_STATIC_INDICATOR':
        hideStatic();
        sendResponse({ success: true });
        break;

      case 'indicator:action':
        if (msg.text) {
          showActionLabel(msg.text);
        } else {
          hideActionLabel();
        }
        sendResponse({ success: true });
        break;

      case 'indicator:show':
        showStaticDot();
        injectAnimations();
        sendResponse({ success: true });
        break;

      case 'indicator:hide_action':
        hideActionLabel();
        sendResponse({ success: true });
        break;

      case 'indicator:click_ripple':
        if (
          msg.coordinate &&
          Array.isArray(msg.coordinate) &&
          msg.coordinate.length >= 2
        ) {
          showClickRipple(msg.coordinate[0], msg.coordinate[1]);
        }
        sendResponse({ success: true });
        break;

      case 'indicator:drag_path':
        if (
          msg.start_coordinate &&
          msg.coordinate &&
          Array.isArray(msg.start_coordinate) &&
          Array.isArray(msg.coordinate) &&
          msg.start_coordinate.length >= 2 &&
          msg.coordinate.length >= 2
        ) {
          showDragPath(
            msg.start_coordinate[0],
            msg.start_coordinate[1],
            msg.coordinate[0],
            msg.coordinate[1],
          );
        }
        sendResponse({ success: true });
        break;

      case 'indicator:shield':
        if (msg.show) {
          showShield(msg.restricted ?? true);
        } else {
          hideShield();
        }
        sendResponse({ success: true });
        break;
    }
  });

  // ── Cleanup on unload ────────────────────────────────────────

  window.addEventListener('beforeunload', () => {
    hideAll();
    hideStatic();
    removeCursor();
    hideActionLabel();
    if (dragPathEl) {
      dragPathEl.remove();
      dragPathEl = null;
    }
    audioCtx?.close().catch(() => {});
    audioCtx = null;
  });
})();
