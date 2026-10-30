import React, { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../../utils/i18n';

type ConnStatus = 'disconnected' | 'connecting' | 'connected';

interface BridgeState {
  status: ConnStatus;
  port: number;
  lastError: string | null;
}

interface DaemonStatus {
  ok: boolean;
  version: string;
  uptime_s: number;
  pairingCode?: string;
  extension_connected?: boolean;
}

async function send(type: string, extra?: Record<string, unknown>): Promise<any> {
  return chrome.runtime.sendMessage({ type, ...extra });
}

/**
 * Faixa MCP: 1 linha, zero console. Mostra estado, pareia com 6 dígitos
 * na 1ª vez e reconecta sozinha quando o daemon aparece.
 */
export function BridgePanel() {
  const [bridge, setBridge] = useState<BridgeState>({ status: 'disconnected', port: 18765, lastError: null });
  const [daemon, setDaemon] = useState<DaemonStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lastUptime = useRef<number>(-1);

  const refresh = useCallback(async () => {
    try {
      const b = await send('bridge:getState');
      if (b?.ok) setBridge(b.bridge);
    } catch { /* SW ocupado, tenta no próximo ciclo */ }
    // Caminho 1: via SW (vale para qualquer porta salva). Caminho 2: direto
    // do painel (cobre SW dormindo ou router ainda não registrado).
    try {
      const d = await send('bridge:getDaemonStatus');
      if (d?.ok) {
        setDaemon(d.daemon);
        return;
      }
    } catch { /* cai para o direto */ }
    try {
      const res = await fetch('http://127.0.0.1:18765/status');
      if (res.ok) {
        const body = await res.json();
        if (body?.ok) setDaemon(body);
      }
    } catch { /* daemon desligado */ }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  // Auto-conecta quando o daemon aparece (ex.: agente acabou de spawnar).
  useEffect(() => {
    if (!daemon?.ok) return;
    if (bridge.status === 'connected') {
      lastUptime.current = daemon.uptime_s;
      return;
    }
    if (daemon.uptime_s !== lastUptime.current) {
      lastUptime.current = daemon.uptime_s;
      send('bridge:connect').catch(() => {}).finally(() => refresh());
    }
  }, [daemon, bridge.status, refresh]);

  const connect = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await send('bridge:autopair');
      if (r?.ok) {
        refresh();
      } else {
        setErr(typeof r?.error === 'string' ? r.error : t('bridge_connect_failed'));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const dot = bridge.status === 'connected' ? '#1E9E6A' : daemon?.ok ? '#E19A2E' : '#B9B4A8';
  const needsPairing = daemon?.ok && bridge.status !== 'connected';

  return (
    <div
      data-testid="ba-bridge-panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 12px',
        fontSize: 11,
        color: '#5B6165',
        borderBottom: '1px solid #EDE9DD',
        background: '#FBFAF5',
      }}
    >
      <span
        aria-label={bridge.status}
        style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }}
      />
      <span style={{ fontWeight: 600, color: '#121517', whiteSpace: 'nowrap' }}>MCP</span>
      {bridge.status === 'connected' ? (
        <span>{t('bridge_connected')}</span>
      ) : needsPairing ? (
        <>
          <button
            onClick={connect}
            disabled={busy}
            style={{
              padding: '2px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: '#fff',
              background: '#1E46E8',
              border: 'none',
              borderRadius: 4,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            {t('bridge_connect_button')}
          </button>
          {err && (
            <span style={{ color: '#D6472F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={err}>
              {err}
            </span>
          )}
        </>
      ) : (
        <span>{t('bridge_off')}</span>
      )}
    </div>
  );
}
