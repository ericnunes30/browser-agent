import React, { useState, useEffect } from 'react';

interface PermissionRequest {
  domain: string;
  toolName: string;
  action: string;
  tabId: number;
}

interface PermissionPromptProps {
  request: PermissionRequest | null;
  onResponse: (domain: string, action: 'allow' | 'allow_once' | 'deny', forAllChats: boolean) => void;
  onDismiss: () => void;
}

type PromptState = 'hidden' | 'requesting' | 'approved' | 'denied';

export function PermissionPrompt({ request, onResponse, onDismiss }: PermissionPromptProps) {
  const [state, setState] = useState<PromptState>('hidden');
  const [forAllChats, setForAllChats] = useState(false);

  useEffect(() => {
    if (request) {
      setState('requesting');
      setForAllChats(false);
    } else {
      setState('hidden');
    }
  }, [request]);

  const handleAllow = () => {
    if (!request) return;
    setState('approved');
    onResponse(request.domain, 'allow', forAllChats);
    setTimeout(() => setState('hidden'), 1500);
  };

  const handleAllowOnce = () => {
    if (!request) return;
    if (forAllChats) {
      handleAllow();
      return;
    }
    setState('approved');
    onResponse(request.domain, 'allow_once', false);
    setTimeout(() => setState('hidden'), 1500);
  };

  const handleDeny = () => {
    if (!request) return;
    setState('denied');
    onResponse(request.domain, 'deny', false);
    setTimeout(() => setState('hidden'), 1500);
  };

  if (state === 'hidden' || !request) return null;

  const overlay: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 2147483647,
    background: 'rgba(18, 21, 23, 0.32)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  };

  const card: React.CSSProperties = {
    background: '#F3F0E7',
    borderRadius: 8,
    padding: '20px 20px 16px',
    maxWidth: 400,
    width: '100%',
    border: '1px solid #DCD9CF',
    borderLeft: '2px solid #1E46E8',
    boxShadow: '0 18px 40px rgba(18, 21, 23, 0.14)',
  };

  const labelMono: React.CSSProperties = {
    fontFamily: '"IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace',
    fontSize: 11,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#5B6165',
    marginBottom: 8,
  };

  const title: React.CSSProperties = {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: '#121517',
    fontFamily: '"Archivo", "Segoe UI", system-ui, -apple-system, sans-serif',
  };

  const body: React.CSSProperties = {
    fontSize: 13,
    color: '#5B6165',
    margin: '8px 0 12px',
    lineHeight: 1.5,
    fontFamily: '"Archivo", "Segoe UI", system-ui, -apple-system, sans-serif',
  };

  const btnBase: React.CSSProperties = {
    padding: '8px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: '"Archivo", "Segoe UI", system-ui, -apple-system, sans-serif',
  };

  const btnAllowOnce: React.CSSProperties = {
    ...btnBase,
    background: '#1E46E8',
    color: '#FBFAF5',
    border: '1px solid #1E46E8',
  };

  const btnGhost: React.CSSProperties = {
    ...btnBase,
    background: 'transparent',
    color: '#121517',
    border: '1px solid #DCD9CF',
  };

  const btnDeny: React.CSSProperties = {
    ...btnBase,
    background: '#D6472F',
    color: '#FBFAF5',
    border: '1px solid #D6472F',
  };

  return (
    <div style={overlay} onClick={onDismiss} role="dialog" aria-modal="true" aria-label="Checkpoint">
      <div style={card} onClick={(e) => e.stopPropagation()} className="ba-checkpoint">
        {state === 'requesting' && (
          <>
            <div style={labelMono} className="ba-mono">
              Checkpoint
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M8 1.5 9.8 4.6 13.2 5.1 10.7 7.5 11.3 10.9 8 9.2 4.7 10.9 5.3 7.5 2.8 5.1 6.2 4.6 8 1.5Z"
                  stroke="#1E46E8"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
              <h3 style={title}>Pausado aguardando sua confirmação</h3>
            </div>
            <p style={body}>
              O agente quer <strong style={{ color: '#121517' }}>{request.action}</strong> em{' '}
              <strong style={{ color: '#121517' }}>{request.domain}</strong>
              {request.toolName ? (
                <>
                  {' '}usando <strong style={{ color: '#121517' }}>{request.toolName}</strong>
                </>
              ) : null}
            </p>
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  fontSize: 12,
                  color: '#5B6165',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  fontFamily: '"Archivo", "Segoe UI", system-ui, -apple-system, sans-serif',
                }}
              >
                <input
                  type="checkbox"
                  checked={forAllChats}
                  onChange={(e) => setForAllChats(e.target.checked)}
                  style={{ accentColor: '#1E46E8' }}
                />
                Sempre permitir
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" style={btnDeny} onClick={handleDeny} className="ba-btn-deny">
                Negar
              </button>
              <button type="button" style={btnGhost} onClick={onDismiss} className="ba-btn-ghost">
                Agora não
              </button>
              <button type="button" style={btnAllowOnce} onClick={handleAllowOnce} className="ba-btn-primary">
                Permitir uma vez
              </button>
            </div>
          </>
        )}
        {state === 'approved' && (
          <div style={{ textAlign: 'center', padding: 16, color: '#2E6B4F', fontWeight: 600 }}>
            Permitido
          </div>
        )}
        {state === 'denied' && (
          <div style={{ textAlign: 'center', padding: 16, color: '#D6472F', fontWeight: 600 }}>
            Negado
          </div>
        )}
      </div>
    </div>
  );
}

export type { PermissionRequest };
