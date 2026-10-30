/* ------------------------------------------------------------------ */
/*  MCP Bridge — cliente WebSocket (mcp-host/SPEC.md §4)               */
/*                                                                     */
/*  Contrato: a extensão NUNCA escuta porta nem expõe HTTP. Ela só      */
/*  disca `ws://127.0.0.1:<porta>/ws` para o daemon Go, roteia cada     */
/*  {tool_request} para `executeTool()` de tools.ts e devolve           */
/*  {tool_response|tool_error}. Permission gate, CDP helpers e batch     */
/*  continuam em tools.ts — aqui só há framing, pareamento e reconnect. */
/* ------------------------------------------------------------------ */
import { executeTool } from './tools';
import { startKeepAlive, stopKeepAlive } from './keep-alive';
import type { ToolResult } from './providers/types';

/* ──── Constantes (SPEC §3–§5) ─────────────────────────────────────── */

export const MCP_BRIDGE_DEFAULT_PORT = 18765;
const TOKEN_KEY = 'ba-mcp-token';
const PORT_KEY = 'ba-mcp-port';

/** Teto ponta-a-ponta por call. `timeoutMs` menor é honrado; maior é podado. */
const MAX_TIMEOUT_MS = 60000;
/** Limite por mensagem WS (base64 conta como ASCII ≈ 1 char = 1 byte). */
const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
/** Reconnect: só a extensão disca — 500 ms × 60 tentativas (30 s). */
const RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_ATTEMPTS = 60;
/** Abuso: 10 frames ruins em 10 s → fecha com 4400. */
const PROTOCOL_WINDOW_MS = 10000;
const PROTOCOL_MAX_ERRORS = 10;
const WS_CLOSE_ABUSE = 4400;
/** Respostas concluídas guardadas para retry idempotente com mesmo `id`. */
const REPLAY_CACHE_SIZE = 200;

/* ──── Tipos do framing (SPEC §4) ──────────────────────────────────── */

export type McpBridgeTool = 'snapshot' | 'screenshot' | 'navigate' | 'get_text' | 'tabs';

export type BridgeErrorCode =
  | 'TIMEOUT'
  | 'DENIED'
  | 'TAB_GONE'
  | 'PROTOCOL'
  | 'OVERSIZE'
  | 'INTERNAL';

export type BridgeConnStatus = 'disconnected' | 'connecting' | 'connected';

export interface BridgeToolRequest {
  id: string;
  type: 'tool_request';
  tool: string;
  args: Record<string, unknown>;
  timeoutMs?: number;
}

export interface BridgeToolResponse {
  id: string;
  type: 'tool_response';
  ok: true;
  result: { content: string; images?: string[] };
}

export interface BridgeToolError {
  id: string;
  type: 'tool_error';
  ok: false;
  error: { code: BridgeErrorCode; message: string };
}

export type BridgeOutgoing = BridgeToolResponse | BridgeToolError;

export interface BridgeState {
  status: BridgeConnStatus;
  port: number;
  /** Última falha (nunca contém token nem conteúdo de página). */
  lastError: string | null;
  reconnectAttempts: number;
}

export interface DaemonStatus {
  ok: boolean;
  version: string;
  primary: boolean;
  port: number;
  tabs: number;
  uptime_s: number;
  /** Pode carregar o pairing code de 6 dígitos na 1ª boot. */
  pairingCode?: string;
  lastError: string | null;
}

/* ──── Estado interno ──────────────────────────────────────────────── */

let socket: WebSocket | null = null;
let connStatus: BridgeConnStatus = 'disconnected';
let lastError: string | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let manualClose = false;
let currentPort = MCP_BRIDGE_DEFAULT_PORT;

/** Timestamps de frames inválidos (janela deslizante p/ abuso). */
let protocolErrorAt: number[] = [];
/** Respostas finais por `id` — retry do daemon com mesmo `id` não reexecuta. */
const completedById = new Map<string, BridgeOutgoing>();
/** Execuções em curso por `id` — retry com mesmo `id` aguarda a mesma. */
const inFlight = new Map<string, Promise<ToolResult>>();

/* ──── Storage (token nunca vai para log) ──────────────────────────── */

async function loadToken(): Promise<string | null> {
  const r = await chrome.storage.local.get(TOKEN_KEY);
  const t = r[TOKEN_KEY];
  return typeof t === 'string' && t.length > 0 ? t : null;
}

async function loadPort(): Promise<number> {
  const r = await chrome.storage.local.get(PORT_KEY);
  const p = r[PORT_KEY];
  return typeof p === 'number' && Number.isInteger(p) && p > 0 && p < 65536
    ? p
    : MCP_BRIDGE_DEFAULT_PORT;
}

/* ──── Status / pareamento (tela de pareamento usa via `bridge:*`) ─── */

export function getBridgeState(): BridgeState {
  return { status: connStatus, port: currentPort, lastError, reconnectAttempts };
}

/** Healthcheck sem auth (SPEC §3). A UI mostra "Connected" a partir daqui. */
export async function fetchDaemonStatus(port?: number): Promise<DaemonStatus> {
  const p = port ?? (await loadPort());
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${p}/status`);
  } catch {
    throw new Error(`Daemon inalcançável em 127.0.0.1:${p}. Suba o daemon primeiro.`);
  }
  if (!res.ok) throw new Error(`/status retornou HTTP ${res.status}`);
  const body = (await res.json()) as DaemonStatus;
  if (body == null || body.ok !== true) throw new Error('Resposta de /status inválida');
  return body;
}

function isPairingCode(v: string): boolean {
  return /^[0-9]{6}$/.test(v);
}

function isFullToken(v: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(v);
}

/**
 * Pareamento em 1 clique: pede o token ao daemon via POST /pair (só
 * loopback, só enquanto ninguém pareou). Guarda em `chrome.storage.local`
 * e conecta. Zero digitação.
 */
export async function autoPairBridge(
  port?: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = port ?? (await loadPort());
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${p}/pair`, { method: 'POST' });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (res.status === 403) {
    return { ok: false, error: 'Daemon já pareado em outro lugar (use --reset-token nele).' };
  }
  if (!res.ok) return { ok: false, error: `POST /pair retornou HTTP ${res.status}` };
  const body = (await res.json()) as { ok?: boolean; token?: unknown };
  if (body?.ok !== true || typeof body.token !== 'string' || !isFullToken(body.token)) {
    return { ok: false, error: 'Resposta de /pair inválida' };
  }
  currentPort = p;
  await chrome.storage.local.set({ [TOKEN_KEY]: body.token, [PORT_KEY]: p });
  manualClose = false;
  connectBridge(p, body.token);
  return { ok: true };
}

export async function pairBridge(
  code: string,
  port?: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const secret = code.trim();
  if (!isPairingCode(secret) && !isFullToken(secret)) {
    return { ok: false, error: 'Código inválido: esperado 6 dígitos do daemon.' };
  }
  const p = port ?? (await loadPort());
  currentPort = p;
  await chrome.storage.local.set({ [TOKEN_KEY]: secret, [PORT_KEY]: p });
  manualClose = false;
  connectBridge(p, secret);
  return { ok: true };
}

/** Fecha o socket e para o reconnect (mantém o token pareado). */
export function disconnectBridge(): void {
  manualClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    try {
      socket.close(1000, 'manual disconnect');
    } catch {
      /* já fechado */
    }
    socket = null;
  }
  connStatus = 'disconnected';
  stopKeepAlive();
}

/** Desfaz o pareamento: fecha e apaga token + porta do storage. */
export async function unpairBridge(): Promise<void> {
  disconnectBridge();
  await chrome.storage.local.remove([TOKEN_KEY, PORT_KEY]);
  currentPort = MCP_BRIDGE_DEFAULT_PORT;
  lastError = null;
  reconnectAttempts = 0;
}

/* ──── Conexão (só a extensão disca) ───────────────────────────────── */

export function connectBridge(port?: number, token?: string): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  manualClose = false;
  void (async () => {
    const p = port ?? (await loadPort());
    const t = token ?? (await loadToken());
    currentPort = p;
    if (!t) {
      connStatus = 'disconnected';
      lastError = 'Sem pareamento: informe o código de 6 dígitos do daemon.';
      return;
    }
    openSocket(p, t);
  })();
}

function openSocket(port: number, token: string): void {
  connStatus = 'connecting';
  // MV3 ServiceWorker: WebSocket não permite header customizado, então o
  // Bearer vai em `?token=` — o SPEC admite `?token=` no handshake inicial,
  // e cada (re)connect é um handshake novo. Nunca vai para log.
  const url = `ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(token)}`;
  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch (err) {
    onSocketDown(port, err instanceof Error ? err.message : String(err));
    return;
  }
  socket = ws;
  startKeepAlive(); // SW efêmero: alarme existente (ba-keep-alive) cobre a sessão

  ws.onopen = () => {
    if (socket !== ws) return;
    connStatus = 'connected';
    lastError = null;
    reconnectAttempts = 0;
  };

  ws.onmessage = (ev) => {
    if (socket !== ws) return;
    void handleDaemonFrame(String(ev.data ?? ''));
  };

  ws.onerror = () => {
    // Detalhe real chega em onclose; aqui só marca.
    lastError = 'WebSocket error';
  };

  ws.onclose = (ev) => {
    if (socket !== ws) return;
    socket = null;
    // 4400 = nós fechamos por abuso; 1000 manual = disconnectBridge().
    if (manualClose || ev.code === 1000) {
      connStatus = 'disconnected';
      stopKeepAlive();
      return;
    }
    onSocketDown(port, ev.reason || `WS fechado (code ${ev.code})`);
  };
}

function onSocketDown(port: number, message: string): void {
  socket = null;
  lastError = message;
  if (manualClose) {
    connStatus = 'disconnected';
    stopKeepAlive();
    return;
  }
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    // Após 60 falhas marca Disconnected e para (sem exit — SW não é processo).
    connStatus = 'disconnected';
    stopKeepAlive();
    return;
  }
  connStatus = 'connecting';
  reconnectAttempts += 1;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void (async () => {
      const t = await loadToken();
      if (!t || manualClose) {
        connStatus = 'disconnected';
        stopKeepAlive();
        return;
      }
      openSocket(port, t);
    })();
  }, RECONNECT_DELAY_MS);
}

/* ──── Recebimento: validação + abuso (SPEC §4) ─────────────────────── */

function noteProtocolError(): boolean {
  const now = Date.now();
  protocolErrorAt = protocolErrorAt.filter((t) => now - t < PROTOCOL_WINDOW_MS);
  protocolErrorAt.push(now);
  return protocolErrorAt.length >= PROTOCOL_MAX_ERRORS;
}

function closeOnAbuse(): void {
  try {
    socket?.close(WS_CLOSE_ABUSE, 'too many protocol errors');
  } catch {
    /* ignore */
  }
}

function sendErrorNoId(message: string): void {
  // Frame sem `id` nunca recebe resposta endereçada; só contabiliza abuso.
  if (noteProtocolError()) closeOnAbuse();
  lastError = message;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function handleDaemonFrame(raw: string): Promise<void> {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    sendErrorNoId('JSON inválido do daemon');
    return;
  }
  if (!isRecord(msg) || typeof msg.id !== 'string' || msg.id.length === 0 || msg.type !== 'tool_request') {
    sendErrorNoId('Frame sem id/type tool_request');
    return;
  }
  const req: BridgeToolRequest = {
    id: msg.id,
    type: 'tool_request',
    tool: typeof msg.tool === 'string' ? msg.tool : '',
    args: isRecord(msg.args) ? (msg.args as Record<string, unknown>) : {},
    timeoutMs: typeof msg.timeoutMs === 'number' ? msg.timeoutMs : undefined,
  };

  // Idempotência por `id`: retry do daemon não reexecuta.
  const cached = completedById.get(req.id);
  if (cached) {
    sendOutgoing(cached);
    return;
  }
  const ongoing = inFlight.get(req.id);
  if (ongoing) {
    try {
      const result = await withTimeout(ongoing, clampTimeout(req.timeoutMs));
      sendOutgoing(toResponse(req, result));
    } catch (err) {
      sendOutgoing(toErrorResponse(req.id, err as { code: BridgeErrorCode; message: string }));
    }
    return;
  }

  const exec = runToolRequest(req);
  inFlight.set(req.id, exec);
  // Evita unhandled rejection se o timeout vencer antes da execução.
  exec.then(
    (result) => {
      inFlight.delete(req.id);
      const out = toResponse(req, result);
      remember(req.id, out);
      sendOutgoing(out);
    },
    (err: unknown) => {
      inFlight.delete(req.id);
      const out = toErrorResponse(
        req.id,
        err as { code: BridgeErrorCode; message: string },
      );
      remember(req.id, out);
      sendOutgoing(out);
    },
  );

  try {
    const result = await withTimeout(exec, clampTimeout(req.timeoutMs));
    void result; // resposta já enviada pelo .then acima
  } catch (err) {
    // Timeout venceu: responde TIMEOUT agora; a conclusão tardia fica no
    // cache para o retry do daemon com o mesmo `id`.
    exec.then(
      (late) => remember(req.id, toResponse(req, late)),
      () => {},
    );
    const out = toErrorResponse(req.id, err as { code: BridgeErrorCode; message: string });
    remember(req.id, out);
    sendOutgoing(out);
  }
}

function remember(id: string, out: BridgeOutgoing): void {
  // Guarda a PRIMEIRA resposta final; retry posterior recebe o original.
  if (!completedById.has(id)) completedById.set(id, out);
  while (completedById.size > REPLAY_CACHE_SIZE) {
    const oldest = completedById.keys().next();
    if (oldest.done) break;
    completedById.delete(oldest.value);
  }
}

/* ──── Execução: piloto → executeTool (sem duplicar lógica) ────────── */

function clampTimeout(timeoutMs: number | undefined): number {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return MAX_TIMEOUT_MS;
  }
  return Math.min(Math.floor(timeoutMs), MAX_TIMEOUT_MS);
}

function withTimeout(promise: Promise<ToolResult>, ms: number): Promise<ToolResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<ToolResult>((_, reject) => {
    timer = setTimeout(() => {
      timer = null;
      reject({ code: 'TIMEOUT' as BridgeErrorCode, message: `Tool excedeu ${ms} ms` });
    }, ms);
  });
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    timeout,
  ]);
}

/** Aba ativa quando `args.tabId` ausente — nunca `0` (SPEC §4/§7). */
async function resolveActiveTabId(): Promise<number | null> {
  try {
    const preferred = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (preferred[0]?.id != null) return preferred[0].id;
  } catch {
    /* tenta fallback */
  }
  try {
    const anyActive = await chrome.tabs.query({ active: true });
    const active = anyActive.find((t) => t.id != null);
    return active?.id ?? null;
  } catch {
    return null;
  }
}

interface ExecCall {
  name: string;
  input: Record<string, unknown>;
}

/**
 * Mapeia o subset piloto MCP → nomes/inputs de `executeTool` (SPEC §7).
 * Nome fora do piloto → PROTOCOL sem encaminhar.
 */
function mapPilotTool(tool: string, args: Record<string, unknown>, tabId: number): ExecCall | null {
  switch (tool as McpBridgeTool) {
    case 'snapshot':
      return { name: 'take_snapshot', input: { ...args, tabId } };
    case 'screenshot':
      // COMPUTER restrito a action="screenshot" nesta fase.
      return { name: 'computer', input: { ...args, action: 'screenshot', tabId } };
    case 'navigate':
      return { name: 'navigate', input: { ...args, tabId } };
    case 'get_text':
      return { name: 'get_page_text', input: { ...args, tabId } };
    case 'tabs':
      if (typeof args.url === 'string' && args.url.length > 0) {
        return { name: 'tabs_create', input: { url: args.url } };
      }
      return { name: 'tabs_context', input: {} };
    default:
      return null;
  }
}

function classifyResult(result: ToolResult): BridgeErrorCode | null {
  if (!result.error) return null;
  const hay = `${result.error}\n${result.content}`.toLowerCase();
  if (hay.includes('blocked site') || hay.includes('permission denied')) return 'DENIED';
  if (/no tab|tab.*(closed|removed|not found)|tab gone/.test(hay)) return 'TAB_GONE';
  return 'INTERNAL';
}

async function runToolRequest(req: BridgeToolRequest): Promise<ToolResult> {
  const rawTabId = req.args.tabId;
  let tabId: number | null =
    typeof rawTabId === 'number' && Number.isInteger(rawTabId) ? rawTabId : null;
  if (tabId == null) tabId = await resolveActiveTabId();
  if (tabId == null) {
    throw { code: 'TAB_GONE' as BridgeErrorCode, message: 'Sem aba ativa para executar a tool' };
  }

  const call = mapPilotTool(req.tool, req.args, tabId);
  if (!call) {
    throw {
      code: 'PROTOCOL' as BridgeErrorCode,
      message: `Tool desconhecida fora do piloto: ${req.tool || '(vazia)'}`,
    };
  }

  // `browser_batch` não está no piloto: nunca chega aqui (PROTOCOL acima).
  // Permission gate, CDP e batch vivem em executeTool — não duplicar.
  try {
    return await executeTool(call.name, call.input, tabId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (/no tab|tab.*(closed|removed|not found)|tab gone/i.test(message)) {
      throw { code: 'TAB_GONE' as BridgeErrorCode, message };
    }
    throw { code: 'INTERNAL' as BridgeErrorCode, message };
  }
}

/* ──── Resposta: ToolResult → framing + OVERSIZE (SPEC §4) ─────────── */

/** base64 puro: remove prefixo `data:` que `captureScreenshot` retorna. */
function stripDataUri(b64: string): string {
  const idx = b64.indexOf(',');
  if (b64.startsWith('data:') && idx >= 0) return b64.slice(idx + 1);
  return b64;
}

function collectImages(result: ToolResult): string[] | undefined {
  const out: string[] = [];
  for (const img of result.images ?? []) {
    if (typeof img === 'string' && img.length > 0) out.push(stripDataUri(img));
  }
  for (const shot of result.screenshots ?? []) {
    if (shot && typeof shot.data === 'string' && shot.data.length > 0) {
      out.push(stripDataUri(shot.data));
    }
  }
  return out.length > 0 ? out : undefined;
}

function toResponse(req: BridgeToolRequest, result: ToolResult): BridgeOutgoing {
  const code = classifyResult(result);
  if (code) {
    // `result.error` vira tool_error com message=content — nunca stack cru.
    return { id: req.id, type: 'tool_error', ok: false, error: { code, message: result.content } };
  }
  const images = collectImages(result);
  const out: BridgeOutgoing = {
    id: req.id,
    type: 'tool_response',
    ok: true,
    result: images ? { content: result.content, images } : { content: result.content },
  };
  if (JSON.stringify(out).length > MAX_MESSAGE_BYTES) {
    return {
      id: req.id,
      type: 'tool_error',
      ok: false,
      error: { code: 'OVERSIZE', message: 'Resposta excedeu 8 MB e foi descartada' },
    };
  }
  return out;
}

function toErrorResponse(
  id: string,
  err: { code?: BridgeErrorCode; message?: string },
): BridgeToolError {
  const code: BridgeErrorCode =
    err.code === 'TIMEOUT' ||
    err.code === 'DENIED' ||
    err.code === 'TAB_GONE' ||
    err.code === 'PROTOCOL' ||
    err.code === 'OVERSIZE'
      ? err.code
      : 'INTERNAL';
  return { id, type: 'tool_error', ok: false, error: { code, message: err.message ?? 'Erro interno' } };
}

function sendOutgoing(out: BridgeOutgoing): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    lastError = 'Socket fechado antes do envio da resposta';
    return;
  }
  const raw = JSON.stringify(out);
  if (raw.length > MAX_MESSAGE_BYTES) {
    // Defesa final: nunca estourar o limite no fio.
    const slim: BridgeToolError = {
      id: out.id,
      type: 'tool_error',
      ok: false,
      error: { code: 'OVERSIZE', message: 'Resposta excedeu 8 MB e foi descartada' },
    };
    socket.send(JSON.stringify(slim));
    remember(out.id, slim);
    return;
  }
  socket.send(raw);
}

/* ──── Router p/ telas (pareamento/estado) ──────────────────────────── */

export function registerMcpBridgeRouter(): void {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg?.type) {
      case 'bridge:getState':
        sendResponse({ ok: true, bridge: getBridgeState() });
        return false;

      case 'bridge:getDaemonStatus':
        fetchDaemonStatus(msg.port)
          .then((daemon) => sendResponse({ ok: true, daemon }))
          .catch((err: unknown) =>
            sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
          );
        return true;

      case 'bridge:pair':
        pairBridge(String(msg.code ?? ''), msg.port)
          .then((r) => sendResponse(r))
          .catch((err: unknown) =>
            sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
          );
        return true;

      case 'bridge:autopair':
        autoPairBridge(msg.port)
          .then((r) => sendResponse(r))
          .catch((err: unknown) =>
            sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
          );
        return true;

      case 'bridge:connect':
        connectBridge(msg.port);
        sendResponse({ ok: true, bridge: getBridgeState() });
        return false;

      case 'bridge:disconnect':
        disconnectBridge();
        sendResponse({ ok: true, bridge: getBridgeState() });
        return false;

      case 'bridge:unpair':
        unpairBridge()
          .then(() => sendResponse({ ok: true, bridge: getBridgeState() }))
          .catch((err: unknown) =>
            sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
          );
        return true;

      default:
        return false;
    }
  });
}

/**
 * Fiação opcional no SW: registra o router `bridge:*` e retoma a conexão
 * se já houver token pareado. Chamar uma vez em `index.ts`.
 */
export function initMcpBridge(): void {
  registerMcpBridgeRouter();
  void (async () => {
    const token = await loadToken();
    if (token) connectBridge(await loadPort(), token);
  })();
}
