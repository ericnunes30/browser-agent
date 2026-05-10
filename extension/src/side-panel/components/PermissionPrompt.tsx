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
    position: 'fixed', inset: 0, zIndex: 2147483647,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  const card: React.CSSProperties = {
    background: 'var(--color-bg-000, #2e2e2c)',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '400px',
    width: '90%',
    border: '0.5px solid var(--color-border-100, rgba(209,205,195,0.15))',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  };

  const btnBase: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'inherit',
  };

  return (
    <div style={overlay} onClick={onDismiss}>
      <div style={card} onClick={e => e.stopPropagation()}>
        {state === 'requesting' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 20 }}>🔒</span>
              <h3 style={{ margin: 0, fontSize: 15, color: 'var(--color-text-000, #f7f6f3)' }}>Permission required</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-text-200, #cccbc4)', marginBottom: 16, lineHeight: 1.5 }}>
              The agent wants to <strong>{request.action}</strong> on <strong>{request.domain}</strong>
              {request.toolName ? <> using <strong>{request.toolName}</strong></> : null}
            </p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--color-text-400, #9c9b91)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={forAllChats}
                  onChange={e => setForAllChats(e.target.checked)}
                />
                Allow for all chats
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={{ ...btnBase, background: 'var(--color-bg-200, #1f1f1d)', color: 'var(--color-text-000, #f7f6f3)' }} onClick={handleDeny}>Deny</button>
              <button style={{ ...btnBase, background: 'var(--color-bg-200, #1f1f1d)', color: 'var(--color-text-000, #f7f6f3)' }} onClick={handleAllowOnce}>Allow once</button>
              <button style={{ ...btnBase, background: 'var(--color-brand, #d97757)', color: 'white' }} onClick={handleAllow}>Allow</button>
            </div>
          </>
        )}
        {state === 'approved' && (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--color-success, #6b9f6b)' }}>
            ✓ Allowed
          </div>
        )}
        {state === 'denied' && (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--color-error, #c95a5a)' }}>
            ✗ Denied
          </div>
        )}
      </div>
    </div>
  );
}

export type { PermissionRequest };
