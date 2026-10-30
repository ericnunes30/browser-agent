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
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lastUptime = useRef<number>(-1);

  const refresh = useCallback(async () => {
    try {
      const b = await send('bridge:getState');
      if (b?.ok) setBridge(b.bridge);
    } catch { /* SW ocupado, tenta no próximo ciclo */ }
    try {
      const d = await send('bridge:getDaemonStatus');
      if (d?.ok) setDaemon(d.daemon);
      else setDaemon(null);
    } catch {
      setDaemon(null);
    }
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

  const pair = useCallback(async () => {
    const digits = code.replace(/\D/g, '').slice(0, 6);
    if (digits.length !== 6) {
      setErr(t('bridge_code_invalid'));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await send('bridge:pair', { code: digits });
      if (r?.ok) {
        setCode('');
        refresh();
      } else {
        setErr(typeof r?.error === 'string' ? r.error : t('bridge_pair_failed'));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [code, refresh]);

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
          <span style={{ whiteSpace: 'nowrap' }}>{t('bridge_pair_title')}</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => { if (e.key === 'Enter') pair(); }}
            placeholder={t('bridge_code_placeholder')}
            inputMode="numeric"
            maxLength={6}
            aria-label={t('bridge_code_placeholder')}
            style={{
              width: 72,
              padding: '2px 6px',
              fontSize: 11,
              fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
              letterSpacing: 2,
              border: '1px solid #DCD9CF',
              borderRadius: 4,
              background: '#fff',
            }}
          />
          <button
            onClick={pair}
            disabled={busy || code.length !== 6}
            style={{
              padding: '2px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: '#fff',
              background: code.length === 6 ? '#1E46E8' : '#B9B4A8',
              border: 'none',
              borderRadius: 4,
              cursor: code.length === 6 ? 'pointer' : 'default',
            }}
          >
            {t('bridge_pair_button')}
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
