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
  extension_connected?: boolean;
}

async function send(type: string, extra?: Record<string, unknown>): Promise<any> {
  return chrome.runtime.sendMessage({ type, ...extra });
}

/**
 * Faixa MCP: só status, zero ação. A conexão é direta e automática —
 * a extensão disca o daemon sozinha (trust-on-first-use) e reconecta
 * sozinha quando ele aparece. Nada para clicar ou digitar.
 */
export function BridgePanel() {
  const [bridge, setBridge] = useState<BridgeState>({ status: 'disconnected', port: 18765, lastError: null });
  const [daemon, setDaemon] = useState<DaemonStatus | null>(null);
  const lastUptime = useRef<number>(-1);

  const refresh = useCallback(async () => {
    try {
      const b = await send('bridge:getState');
      if (b?.ok) setBridge(b.bridge);
    } catch { /* SW ocupado, tenta no próximo ciclo */ }
    // Caminho 1: via SW. Caminho 2: direto do painel (SW dormindo).
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

  // Garante a discagem quando o daemon aparece (ex.: agente acabou de spawnar).
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

  const dot = bridge.status === 'connected' ? '#1E9E9A' : bridge.status === 'connecting' ? '#E19A2E' : '#B9B4A8';
  const label =
    bridge.status === 'connected'
      ? t('bridge_connected')
      : bridge.status === 'connecting'
        ? t('bridge_connecting')
        : t('bridge_off');

  return (
    <div
      data-testid="ba-bridge-panel"
      title={bridge.lastError ?? ''}
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
      <span>{label}</span>
    </div>
  );
}
