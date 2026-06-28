import React from 'react';
import { useChat } from '../ChatContext';

/**
 * Bottom-sheet prompt shown when the tool loop exceeds the iteration limit.
 * Asks the user whether to continue (reset counter) or stop.
 */
export function ContinuePrompt() {
  const { showContinuePrompt, respondContinue } = useChat();

  if (!showContinuePrompt) return null;

  return (
    <div style={overlayStyle}>
      <div style={sheetStyle}>
        <div style={titleStyle}>Tool loop reached 30 iterations</div>
        <div style={descStyle}>
          The agent is still making tool calls. Do you want to continue or stop?
        </div>
        <div style={buttonsStyle}>
          <button
            style={continueBtnStyle}
            onClick={() => respondContinue(true)}
          >
            Continue
          </button>
          <button
            style={stopBtnStyle}
            onClick={() => respondContinue(false)}
          >
            Stop
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  zIndex: 1000,
};

const sheetStyle: React.CSSProperties = {
  background: '#1a1a2e',
  borderRadius: '16px 16px 0 0',
  padding: '24px',
  width: '100%',
  maxWidth: '400px',
  boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
};

const titleStyle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: '#e0e0e0',
  marginBottom: '8px',
};

const descStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#999',
  marginBottom: '20px',
  lineHeight: 1.4,
};

const buttonsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
};

const continueBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 16px',
  borderRadius: '8px',
  border: 'none',
  background: '#4a9eff',
  color: '#fff',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
};

const stopBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 16px',
  borderRadius: '8px',
  border: '1px solid #555',
  background: 'transparent',
  color: '#ccc',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
};
