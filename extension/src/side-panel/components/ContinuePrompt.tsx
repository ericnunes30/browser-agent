import React from 'react';
import { useChat } from '../ChatContext';

/**
 * Route checkpoint pause — wayfinding S3.
 * Shown when the tool loop reaches the iteration limit and waits
 * for the user to continue the route or stop.
 */
export function ContinuePrompt() {
  const { showContinuePrompt, respondContinue, routePausedStep } = useChat();

  if (!showContinuePrompt) return null;

  const step = typeof routePausedStep === 'number' && routePausedStep > 0 ? routePausedStep : null;
  const title = step !== null ? `Rota pausada no passo ${step}.` : 'Rota pausada.';

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Checkpoint de rota">
      <div style={sheetStyle} className="ba-checkpoint ba-sheet-in">
        <div style={labelStyle} className="ba-mono">
          Checkpoint
        </div>
        <div style={titleStyle}>{title}</div>
        <div style={descStyle}>Pausado aguardando sua confirmação</div>
        <div style={buttonsStyle}>
          <button type="button" style={continueBtnStyle} className="ba-btn-primary" onClick={() => respondContinue(true)}>
            Continuar rota
          </button>
          <button type="button" style={stopBtnStyle} className="ba-btn-ghost" onClick={() => respondContinue(false)}>
            Parar
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(18, 21, 23, 0.32)',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 12,
};

const sheetStyle: React.CSSProperties = {
  background: '#F3F0E7',
  border: '1px solid #DCD9CF',
  borderLeft: '2px solid #1E46E8',
  borderRadius: 8,
  padding: '16px 20px',
  width: '100%',
  maxWidth: 400,
  boxShadow: '0 18px 40px rgba(18, 21, 23, 0.14)',
};

const labelStyle: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace',
  fontSize: 11,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#5B6165',
  marginBottom: 6,
};

const titleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#121517',
  marginBottom: 4,
  fontFamily: '"Archivo", "Segoe UI", system-ui, -apple-system, sans-serif',
};

const descStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#5B6165',
  marginBottom: 16,
  lineHeight: 1.5,
  fontFamily: '"Archivo", "Segoe UI", system-ui, -apple-system, sans-serif',
};

const buttonsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
};

const continueBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 6,
  border: '1px solid #1E46E8',
  background: '#1E46E8',
  color: '#FBFAF5',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: '"Archivo", "Segoe UI", system-ui, -apple-system, sans-serif',
};

const stopBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 6,
  border: '1px solid #DCD9CF',
  background: 'transparent',
  color: '#121517',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: '"Archivo", "Segoe UI", system-ui, -apple-system, sans-serif',
};
