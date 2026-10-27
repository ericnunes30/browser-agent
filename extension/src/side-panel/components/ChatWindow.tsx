import React, { useRef, useEffect } from 'react';
import { useChat } from '../ChatContext';
import MessageBubble from './MessageBubble';
import { t } from '../../utils/i18n';
import { BaBrandMark } from './Header';

const MONO = '"IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace';
const SANS = '"Archivo", "Segoe UI", system-ui, -apple-system, sans-serif';

function PreviewRow({ label, isLast }: { label: string; isLast: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
        <span
          aria-hidden="true"
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: 'transparent',
            border: '2px solid #DCD9CF',
            display: 'inline-flex',
            flexShrink: 0,
          }}
        />
        {!isLast && (
          <span aria-hidden="true" style={{ width: 2, flex: 1, minHeight: 12, background: '#DCD9CF', marginTop: 4, marginBottom: -2 }} />
        )}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: '6px 10px',
          marginBottom: isLast ? 0 : 8,
          borderRadius: 6,
          fontSize: 12,
          background: '#FBFAF5',
          border: '1px solid #DCD9CF',
          color: '#121517',
        }}
      >
        {label}
      </div>
    </div>
  );
}

function EmptyState() {
  const { sendMessage } = useChat();
  const suggestions = [t('empty_suggest_prices'), t('empty_suggest_form')];
  const previewSteps = [t('empty_step_plan'), t('empty_step_show'), t('checkpoint_label')];

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#FBFAF5',
        textAlign: 'center',
        gap: 14,
        overflowY: 'auto',
      }}
    >
      <BaBrandMark size={40} />

      <div
        style={{
          fontFamily: MONO,
          fontSize: 11,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: '#5B6165',
        }}
      >
        {t('route_new')}
      </div>

      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#121517', fontFamily: SANS, lineHeight: 1.25 }}>
        {t('route_where')}
      </h1>

      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: '#5B6165', maxWidth: 320, fontFamily: SANS }}>
        {t('empty_lede')}
      </p>

      <div
        style={{
          width: '100%',
          maxWidth: 320,
          background: '#F3F0E7',
          border: '1px solid #DCD9CF',
          borderRadius: 8,
          padding: '12px 14px',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#5B6165',
            marginBottom: 8,
          }}
        >
          {t('empty_preview')}
        </div>
        {previewSteps.map((s, i) => (
          <PreviewRow key={s} label={s} isLast={i === previewSteps.length - 1} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => sendMessage(s)}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              background: 'transparent',
              color: '#121517',
              border: '1px solid #DCD9CF',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: SANS,
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: '#5B6165', fontFamily: SANS }}>
        {t('route_start_tab')}
      </div>
    </div>
  );
}

function RouteBanner() {
  const { messages, sendMessage, isStreaming, routeStatus, routePausedStep, respondContinue, stopGeneration } = useChat();

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const isError =
    !!lastMsg && lastMsg.role === 'assistant' && lastMsg.content.startsWith('Error:') && !isStreaming;
  const isStopped =
    !isStreaming && routeStatus !== 'paused' && !isError && messages.some((m) => m.content.includes('(stopped)'));
  const isPaused = routeStatus === 'paused';

  const handleRetry = () => {
    if (!lastUser || isStreaming) return;
    sendMessage(lastUser.content, lastUser.attachments);
  };

  if (!isPaused && !isError && !isStopped) return null;

  const cardStyle: React.CSSProperties = {
    margin: '8px 8px 0',
    background: '#F3F0E7',
    border: '1px solid #DCD9CF',
    borderLeft: isError ? '2px solid #D6472F' : '2px solid #1E46E8',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 12,
    flexShrink: 0,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#5B6165',
    marginBottom: 4,
  };

  const primaryBtn: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: 6,
    background: '#1E46E8',
    color: '#FBFAF5',
    border: '1px solid #1E46E8',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: SANS,
  };

  const ghostBtn: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: 6,
    background: 'transparent',
    color: '#121517',
    border: '1px solid #DCD9CF',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: SANS,
  };

  if (isPaused) {
    const step = typeof routePausedStep === 'number' && routePausedStep > 0 ? String(routePausedStep) : '0';
    return (
      <div style={cardStyle} className="ba-sheet-in" role="status">
        <div style={labelStyle}>{t('checkpoint_label')}</div>
        <div style={{ color: '#121517', fontWeight: 600, marginBottom: 4, fontFamily: SANS }}>
          {t('route_paused_step', step)}
          <span className="ba-blink-cursor" aria-hidden="true" />
        </div>
        <div style={{ color: '#5B6165', marginBottom: 8, fontFamily: SANS }}>{t('route_paused_confirm')}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={ghostBtn} onClick={() => respondContinue(false)}>
            {t('chat_abort')}
          </button>
          <button type="button" style={primaryBtn} onClick={() => respondContinue(true)}>
            {t('route_continue')}
          </button>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={cardStyle} className="ba-sheet-in" role="alert">
        <div style={labelStyle}>{t('banner_error')}</div>
        <div style={{ color: '#121517', marginBottom: 8, fontFamily: SANS, wordBreak: 'break-word' }}>
          {lastMsg ? lastMsg.content : t('banner_error')}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={primaryBtn} onClick={handleRetry} disabled={!lastUser}>
            {t('banner_retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle} className="ba-sheet-in" role="status">
      <div style={{ color: '#121517', fontWeight: 600, marginBottom: 8, fontFamily: SANS }}>
        {t('route_stopped')}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" style={ghostBtn} onClick={stopGeneration} disabled={!lastUser}>
          {t('chat_abort')}
        </button>
        <button type="button" style={primaryBtn} onClick={handleRetry} disabled={!lastUser}>
          {t('banner_retry')}
        </button>
      </div>
    </div>
  );
}

export default function ChatWindow() {
  const { messages } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Empty state — first-run wayfinding
  if (messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 0 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        background: '#FBFAF5',
      }}
    >
      <RouteBanner />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '12px 8px 0',
        }}
      >
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
