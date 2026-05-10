/* ------------------------------------------------------------------ */
/*  Agent Visual Indicator — phantom cursor, glow, stop button,        */
/*  static indicator. Orange theme (#D97757) matching Claude.          */
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

  const ORANGE = '#D97757';
  const BG_CREAM = '#FAF9F5';
  const TEXT_DARK = '#141413';
  const BORDER_LIGHT = 'rgba(31, 30, 29, 0.30)';

  // ── Phantom Cursor ──────────────────────────────────────────────

  function createPhantomCursor(
    x: number,
    y: number,
  ): { container: HTMLDivElement; styled: SVGElement } {
    const container = document.createElement('div');
    container.id = 'claude-phantom-cursor';
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

    const plain = makeSvg('claude-phantom-cursor-plain', 'white', '#111', '');
    const styled = makeSvg(
      'claude-phantom-cursor-styled',
      ORANGE,
      BG_CREAM,
      `filter: drop-shadow(0 0 4px rgba(217,119,87,0.9)) drop-shadow(0 0 10px rgba(217,119,87,0.45));`,
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
    ripple.id = 'claude-click-ripple';
    ripple.style.cssText = `
      position: fixed;
      left: ${x - 12}px;
      top: ${y - 12}px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(217, 119, 87, 0.4);
      box-shadow: 0 0 10px 2px rgba(217, 119, 87, 0.3);
      pointer-events: none;
      z-index: 2147483647;
      animation: claude-ripple 400ms ease-out forwards;
    `;
    document.body.appendChild(ripple);

    // Auto-remove after animation completes
    ripple.addEventListener('animationend', () => {
      ripple.remove();
    }, { once: true });
  }

  // ── Glow Border ────────────────────────────────────────────────

  function showGlow() {
    if (!document.getElementById('claude-agent-animation-styles')) {
      const style = document.createElement('style');
      style.id = 'claude-agent-animation-styles';
      style.textContent = `
        @keyframes claude-pulse {
          0% {
            box-shadow:
              inset 0 0 10px rgba(217, 119, 87, 0.5),
              inset 0 0 20px rgba(217, 119, 87, 0.3),
              inset 0 0 30px rgba(217, 119, 87, 0.1);
          }
          50% {
            box-shadow:
              inset 0 0 15px rgba(217, 119, 87, 0.7),
              inset 0 0 25px rgba(217, 119, 87, 0.5),
              inset 0 0 35px rgba(217, 119, 87, 0.2);
          }
          100% {
            box-shadow:
              inset 0 0 10px rgba(217, 119, 87, 0.5),
              inset 0 0 20px rgba(217, 119, 87, 0.3),
              inset 0 0 30px rgba(217, 119, 87, 0.1);
          }
        }
        @keyframes claude-ripple {
          0% { transform: scale(0); opacity: 1; }
          50% { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes claude-fade-in {
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
      glowBorder.id = 'claude-agent-glow-border';
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
        animation: claude-pulse 2s ease-in-out infinite;
        box-shadow:
          inset 0 0 10px rgba(217, 119, 87, 0.5),
          inset 0 0 20px rgba(217, 119, 87, 0.3),
          inset 0 0 30px rgba(217, 119, 87, 0.1);
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
      stopContainer.id = 'claude-agent-stop-container';
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
      stopButton.id = 'claude-agent-stop-button';
      stopButton.textContent = 'Stop';
      stopButton.style.cssText = `
        position: relative;
        transform: translateY(100px);
        padding: 10px 20px;
        background: #D97757;
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
        box-shadow: 0 2px 8px rgba(217, 119, 87, 0.4);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        opacity: 0;
        user-select: none;
        pointer-events: auto;
        white-space: nowrap;
      `;

      const btn = stopButton;
      btn.addEventListener('mouseenter', () => {
        if (active) {
          btn.style.background = '#C05E3A';
        }
      });
      btn.addEventListener('mouseleave', () => {
        if (active) {
          btn.style.background = '#D97757';
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
    actionLabelEl.id = 'claude-action-label';
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
      animation: claude-fade-in 150ms ease-out forwards;
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
      background: #D97757;
      box-shadow: 0 0 4px rgba(217, 119, 87, 0.5);
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
    svg.setAttribute('id', 'claude-drag-path');
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
    line.setAttribute('stroke', '#E74C3C');
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
      staticIndicator.id = 'claude-static-indicator-container';
      staticIndicator.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; flex-shrink: 0; margin-right: 8px;">
          <path d="M3.13946 10.6399L6.28757 8.87462L6.37405 8.73821L6.28757 8.6339H6.13189L5.60432 8.6018L3.80541 8.55366L2.24865 8.48947L0.735135 8.40923H0.492973L0.354595 8.32899L0.181622 8.1685L0.0345946 8.01605L0 7.85557L0.0345946 7.62287L0.138378 7.44634L0.224865 7.40622H0.354595L0.812973 7.44634L1.82486 7.51856L3.34703 7.62287L4.44541 7.68706L6.08 7.85557H6.33946L6.37405 7.75125L6.28757 7.68706L6.21838 7.62287L4.64432 6.55567L2.94054 5.4323L2.04973 4.78235L1.57405 4.45336L1.33189 4.14845L1.22811 3.92377L1.17622 3.69107L1.22811 3.47442L1.33189 3.28185L1.46162 3.13741L1.66054 2.99298H1.87676L2.24865 3.0331L2.39568 3.07322L2.99243 3.53059L4.26378 4.51755L5.92432 5.73721L6.16649 5.93781H6.27892V5.82548L6.16649 5.64092L5.26703 4.01204L4.30703 2.35105L3.87459 1.66098L3.76216 1.25176C3.7391 1.16082 3.69297 0.977332 3.69297 0.970913V0.762287L3.77946 0.505517L3.93513 0.240722L4.18595 0.0882648L4.4627 0H4.67892L4.83459 0.0240722L5.12865 0.0882648L5.4054 0.328987L5.82054 1.27583L6.48649 2.76028L7.52432 4.78235L7.82703 5.38415L7.99135 5.93781L8.05189 6.10632H8.15567V6.01003L8.24216 4.87061L8.39784 3.47442L8.55351 1.67703L8.6054 1.17151L8.85622 0.561685L8.9773 0.417252L9.21946 0.232698H9.35784L9.74703 0.417252L9.97189 0.665998L10.067 0.874624L10.0238 1.17151L9.83351 2.40722L9.46162 4.34102L9.21946 5.64092H9.35784L9.52216 5.47242L10.1795 4.60582L11.2778 3.22568L11.7622 2.68004L12.333 2.07823L12.6962 1.78937L13.0162 1.67703L13.3881 1.78937L13.7168 2.06219L13.8897 2.54363V2.76028L13.6649 3.32197L12.9557 4.22066L12.3676 4.98295L12.0043 5.56871L11.0011 7.02106V7.08526H11.1741L13.0768 6.67603L14.1059 6.49147L15.3341 6.28285L15.5762 6.34704L15.8876 6.53962L15.9481 6.80441L15.8876 7.12538L15.7319 7.34203L14.4173 7.66299L12.8778 7.97593L10.5854 8.51559C10.5705 8.51909 10.56 8.53236 10.56 8.54764C10.56 8.56468 10.573 8.57891 10.59 8.58044L11.6238 8.67402L12.0649 8.69809H13.1459L15.1611 8.85055L15.6886 9.19559L15.9481 9.39619L16 9.62086L15.9481 9.94985L15.8443 10.1023L15.4119 10.3029L15.1351 10.3591L14.0454 10.1023L11.4941 9.49248L10.6205 9.27583H10.4995V9.34804L11.2259 10.0622L12.5665 11.2658L14.2357 12.8225L14.3222 13.0953V13.2076L14.1059 13.5125L13.9243 13.5206L13.8811 13.4804L12.4108 12.3731L12.2984 12.325L11.84 11.8756L10.56 10.7924H10.4735V10.9047L10.7676 11.338L12.333 13.6891L12.4108 14.4112L12.2984 14.6439L11.8919 14.7884L11.667 14.7563L11.4508 14.7081L11.2605 14.5396L10.5254 13.4162L9.5827 11.9719L8.82162 10.672H8.79342C8.76039 10.672 8.73278 10.6972 8.7297 10.73L8.27676 15.5667L8.06919 15.8154L7.6454 16H7.58486L7.17838 15.6951L6.96216 15.1976L7.17838 14.2106L7.43784 12.9268L7.6454 11.9077L7.83567 10.6399L7.95187 10.2164C7.9548 10.2057 7.95069 10.1944 7.94161 10.1881C7.91157 10.1672 7.87034 10.1741 7.84878 10.2037L6.89297 11.5145L5.44 13.4804L4.28973 14.7081L4.01297 14.8205H3.80541L3.5373 14.5717V14.4514L3.58054 14.1304L3.84865 13.7372L5.44 11.7151L6.4 10.4554L7.01872 9.73222C7.04511 9.70139 7.04245 9.65523 7.0127 9.62763C7.00333 9.61894 6.98925 9.61773 6.97854 9.62471L2.75027 12.3811L1.99784 12.4774L1.66919 12.1725L1.71243 11.675L1.86811 11.5145L3.13946 10.6399Z" fill="${ORANGE}"/>
        </svg>
        <span style="vertical-align: middle; color: ${TEXT_DARK}; font-size: 14px; display: inline-block;">Claude is active in this tab group</span>
        <div style="display: inline-block; width: 0.5px; height: 32px; background: rgba(31, 30, 29, 0.15); margin: 0 8px; vertical-align: middle;"></div>
        <button id="claude-static-chat-button" style="position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 6px; background: transparent; border: none; cursor: pointer; pointer-events: auto; vertical-align: middle; width: 32px; height: 32px; border-radius: 8px; transition: background 0.2s;">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="${TEXT_DARK}" xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; display: block;">
            <path d="M10 2.5C14.1421 2.5 17.5 5.85786 17.5 10C17.5 14.1421 14.1421 17.5 10 17.5H3C2.79779 17.5 2.61549 17.3782 2.53809 17.1914C2.4607 17.0046 2.50349 16.7895 2.64648 16.6465L4.35547 14.9365C3.20124 13.6175 2.5 11.8906 2.5 10C2.5 5.85786 5.85786 2.5 10 2.5ZM10 3.5C6.41015 3.5 3.5 6.41015 3.5 10C3.5 11.7952 4.22659 13.4199 5.40332 14.5967L5.46582 14.6729C5.52017 14.7544 5.5498 14.8508 5.5498 14.9502C5.5498 15.0828 5.49709 15.2099 5.40332 15.3037L4.20703 16.5H10C13.5899 16.5 16.5 13.5899 16.5 10C16.5 6.41015 13.5899 3.5 10 3.5ZM13.29 9.30371C13.3986 9.05001 13.6925 8.93174 13.9463 9.04004C14.2 9.14863 14.3183 9.44253 14.21 9.69629C13.8506 10.536 13.1645 11.25 12.25 11.25C11.6372 11.25 11.128 10.9289 10.75 10.4648C10.372 10.9289 9.86276 11.25 9.25 11.25C8.63724 11.25 8.12801 10.9289 7.75 10.4648C7.37198 10.9289 6.86276 11.25 6.25 11.25C5.97386 11.25 5.75 11.0261 5.75 10.75C5.75 10.4739 5.97386 10.25 6.25 10.25C6.58764 10.25 7.00448 9.97056 7.29004 9.30371L7.32422 9.2373C7.41431 9.09121 7.5749 9 7.75 9C7.9501 9 8.13123 9.11975 8.20996 9.30371L8.32227 9.53516C8.59804 10.0359 8.95442 10.25 9.25 10.25C9.58764 10.25 10.0045 9.97056 10.29 9.30371L10.3242 9.2373C10.4143 9.09121 10.5749 9 10.75 9C10.9501 9 11.1312 9.11975 11.21 9.30371L11.3223 9.53516C11.598 10.0359 11.9544 10.25 12.25 10.25C12.5876 10.25 13.0045 9.97056 13.29 9.30371Z" />
          </svg>
          <span id="claude-static-chat-tooltip" style="position: absolute; bottom: calc(100% + 12px); left: 50%; transform: translateX(-50%); padding: 6px 12px; background: #30302E; color: ${BG_CREAM}; border-radius: 6px; font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.2s; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">Open chat</span>
        </button>
        <button id="claude-static-close-button" style="position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 6px; background: transparent; border: none; cursor: pointer; pointer-events: auto; vertical-align: middle; width: 32px; height: 32px; margin-left: 4px; border-radius: 8px; transition: background 0.2s;">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; display: block;">
            <path d="M15.1464 4.14642C15.3417 3.95121 15.6582 3.95118 15.8534 4.14642C16.0486 4.34168 16.0486 4.65822 15.8534 4.85346L10.7069 9.99997L15.8534 15.1465C16.0486 15.3417 16.0486 15.6583 15.8534 15.8535C15.6826 16.0244 15.4186 16.0461 15.2245 15.918L15.1464 15.8535L9.99989 10.707L4.85338 15.8535C4.65813 16.0486 4.34155 16.0486 4.14634 15.8535C3.95115 15.6583 3.95129 15.3418 4.14634 15.1465L9.29286 9.99997L4.14634 4.85346C3.95129 4.65818 3.95115 4.34162 4.14634 4.14642C4.34154 3.95128 4.65812 3.95138 4.85338 4.14642L9.99989 9.29294L15.1464 4.14642Z" fill="${TEXT_DARK}"/>
          </svg>
          <span id="claude-static-close-tooltip" style="position: absolute; bottom: calc(100% + 12px); left: 50%; transform: translateX(-50%); padding: 6px 12px; background: #30302E; color: ${BG_CREAM}; border-radius: 6px; font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.2s; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">Dismiss</span>
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
      const chatBtn = staticIndicator.querySelector('#claude-static-chat-button') as HTMLElement | null;
      if (chatBtn) {
        const tooltip = staticIndicator.querySelector('#claude-static-chat-tooltip') as HTMLElement | null;
        chatBtn.addEventListener('mouseenter', () => {
          chatBtn.style.background = '#F0EEE6';
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
      const closeBtn = staticIndicator.querySelector('#claude-static-close-button') as HTMLElement | null;
      if (closeBtn) {
        const tooltip = staticIndicator.querySelector('#claude-static-close-tooltip') as HTMLElement | null;
        closeBtn.addEventListener('mouseenter', () => {
          closeBtn.style.background = '#F0EEE6';
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
    const color = isDark ? '#D97757' : '#BF5A3A';
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
      ${restricted ? 'filter: drop-shadow(0 0 4px rgba(217, 119, 87, 0.5));' : ''}
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
