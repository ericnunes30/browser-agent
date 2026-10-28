import React, { useState } from 'react';
import type { DisplayMessage, ToolExecution } from '../ChatContext';
import MarkdownRenderer from './MarkdownRenderer';
import { t } from '../../utils/i18n';

function getToolAction(execution: ToolExecution): string {
  const args = execution.args || {};
  if (execution.name === 'computer') return '';
  if (execution.name === 'navigate' && args.url) {
    return '→ ' + String(args.url).slice(0, 40);
  }
  if (execution.name === 'tabs_context') {
    return 'listing tabs';
  }
  if (execution.name === 'web_search' || execution.name === 'search') {
    return args.query ? `${String(args.query).slice(0, 30)}` : 'searching';
  }
  if (execution.name === 'screenshot') {
    return 'capturing screen';
  }
  if (execution.name === 'click' && args.selector) {
    return `clicking ${String(args.selector).slice(0, 30)}`;
  }
  if (execution.name === 'type' && args.text) {
    return `typing ${String(args.text).slice(0, 25)}`;
  }
  if (args.query || args.selector || args.url) {
    return String(args.query || args.selector || args.url || '').slice(0, 35);
  }
  return '';
}

/* ─── Computer action display ─────────────────────────────────── */
/* The `computer` tool covers 7 browser actions. Show each one with its own
   verb + useful detail instead of repeating the raw tool name. */

function getComputerDisplay(args: Record<string, unknown>): { title: string; detail: string } {
  const action = String(args.action || '');
  switch (action) {
    case 'click':
      return { title: 'Clicar', detail: '' };
    case 'fill':
      return { title: 'Preencher', detail: args.text ? String(args.text).slice(0, 25) : '' };
    case 'type':
      return { title: 'Digitar', detail: args.text ? String(args.text).slice(0, 25) : '' };
    case 'keypress': {
      const keys = Array.isArray(args.keys) ? args.keys.map(String).join('+') : '';
      return { title: 'Tecla', detail: keys };
    }
    case 'scroll': {
      const d = Array.isArray(args.scroll_distance) ? args.scroll_distance.map(Number) : [0, 0];
      const dx = d[0] || 0;
      const dy = d[1] || 0;
      let detail = '';
      if (Math.abs(dy) >= Math.abs(dx) && dy !== 0) {
        detail = `${dy > 0 ? '↓' : '↑'} ${Math.abs(dy)}px`;
      } else if (dx !== 0) {
        detail = `${dx > 0 ? '→' : '←'} ${Math.abs(dx)}px`;
      }
      return { title: 'Rolar', detail };
    }
    case 'wait': {
      const ms = Number(args.duration) || 0;
      return { title: 'Aguardar', detail: ms >= 1000 ? `${ms / 1000}s` : `${ms}ms` };
    }
    case 'screenshot':
      return { title: 'Capturar tela', detail: '' };
    default:
      return {
        title: action
          ? action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' ')
          : 'Computador',
        detail: '',
      };
  }
}

type BaStepState = 'done' | 'now' | 'next' | 'error' | 'auto';

function stepStateFor(exec: ToolExecution): BaStepState {
  if (exec.status === 'error') return 'error';
  if (exec.status === 'running') return 'now';
  return 'done';
}

function stepLabelPT(state: BaStepState): string {
  switch (state) {
    case 'done':
      return 'Concluído';
    case 'now':
      return 'Agora';
    case 'next':
      return 'Próximo';
    case 'auto':
      return 'Auto';
    case 'error':
      return 'Erro';
  }
}

function RouteNode({ state }: { state: BaStepState }) {
  const size = 12;
  if (state === 'done') {
    return (
      <span
        className="ba-route-node ba-route-node--done"
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: '#2E6B4F',
          border: '2px solid #2E6B4F',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width="7" height="7" viewBox="0 0 8 8" fill="none" aria-hidden="true">
          <path d="M1.5 4.2 3.3 6 6.5 2.2" stroke="#FBFAF5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (state === 'now') {
    return (
      <span
        className="ba-route-node ba-route-node--now"
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: '#1E46E8',
          border: '2px solid #1E46E8',
          boxShadow: '0 0 0 4px #DCE4FF',
          display: 'inline-flex',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <span className="ba-node-ring" aria-hidden="true" />
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span
        className="ba-route-node ba-route-node--error"
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: '#D6472F',
          border: '2px solid #D6472F',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: '#FBFAF5',
          fontSize: 8,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        !
      </span>
    );
  }
  if (state === 'auto') {
    return (
      <span
        className="ba-route-node ba-route-node--auto"
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: '#C98A1E',
          border: '2px solid #C98A1E',
          display: 'inline-flex',
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <span
      className="ba-route-node ba-route-node--next"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'transparent',
        border: '2px solid #DCD9CF',
        display: 'inline-flex',
        flexShrink: 0,
      }}
    />
  );
}

function StatusChip({ state }: { state: BaStepState }) {
  const palette: Record<BaStepState, { bg: string; color: string; border: string }> = {
    done: { bg: '#F3F0E7', color: '#2E6B4F', border: '#DCD9CF' },
    now: { bg: '#DCE4FF', color: '#1E46E8', border: '#1E46E8' },
    next: { bg: 'transparent', color: '#5B6165', border: '#DCD9CF' },
    error: { bg: '#F3F0E7', color: '#D6472F', border: '#D6472F' },
    auto: { bg: '#F3F0E7', color: '#C98A1E', border: '#C98A1E' },
  };
  const p = palette[state];
  return (
    <span
      style={{
        fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
        fontSize: 10,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        background: p.bg,
        color: p.color,
        border: `1px solid ${p.border}`,
        borderRadius: 4,
        padding: '1px 6px',
        whiteSpace: 'nowrap',
        transition: 'background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease',
      }}
    >
      {stepLabelPT(state)}
    </span>
  );
}

/* ─── Tool Execution Row — wayfinding route step ─────────────── */
function ToolExecutionRow({ exec, isLast }: { exec: ToolExecution; isLast: boolean }) {
  const state = stepStateFor(exec);
  const isComputer = exec.name === 'computer';
  const computer = isComputer ? getComputerDisplay((exec.args || {}) as Record<string, unknown>) : null;
  const title = computer ? computer.title : exec.name;
  const action = computer ? computer.detail : getToolAction(exec);
  const isError = state === 'error';
  const isNow = state === 'now';

  return (
    <div className="ba-step-in" style={{ display: 'flex', gap: 10, position: 'relative' }} title={isComputer ? `computer · ${String((exec.args as Record<string, unknown> | undefined)?.action || '')}` : exec.name}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
        <RouteNode state={state} />
        {!isLast && (
          <span
            className="ba-route-line"
            aria-hidden="true"
            style={{ width: 2, flex: 1, minHeight: 14, background: '#DCD9CF', marginTop: 4, marginBottom: -2 }}
          />
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
          background: isError ? '#F3F0E7' : isNow ? '#FBFAF5' : '#FBFAF5',
          border: `1px solid ${isError ? '#D6472F' : isNow ? '#1E46E8' : '#DCD9CF'}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontWeight: 600, color: isError ? '#D6472F' : '#121517' }}>{title}</span>
        {action && (
          <span
            style={{
              opacity: 0.85,
              maxWidth: 220,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: '#5B6165',
            }}
          >
            {action}
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <StatusChip state={state} />
        </span>
      </div>
    </div>
  );
}

/* ─── Tool Message Bubble — Fluxo N ações ───────────────────── */
function ToolMessageBubble({ message }: { message: DisplayMessage }) {
  const execs = message.toolExecutions || [];
  const isRunning = message.streaming;
  const hasError = execs.some((e) => e.status === 'error');
  const total = execs.length;
  const headerState: BaStepState = hasError ? 'error' : isRunning ? 'now' : 'done';

  // Rolling window: show only the 3 most recent steps, older ones collapse
  // behind a quiet expander instead of duplicating route blocks.
  const VISIBLE_STEPS = 3;
  const visibleExecs = execs.length > VISIBLE_STEPS ? execs.slice(-VISIBLE_STEPS) : execs;
  const lastExecId = execs.length > 0 ? execs[execs.length - 1].id : undefined;

  return (
    <div
      className="ba-route"
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        maxWidth: '100%',
        padding: '4px 0',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          background: '#DCE4FF',
          color: '#1E46E8',
          border: '1px solid #DCD9CF',
        }}
        aria-hidden="true"
      >
        <svg width="14" height="14" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M10.5 5 L10.5 21.2 L14.55 17.6 L17.25 24.35 L20.4 23.1 L17.7 16.7 L22.8 16.7 Z" fill="#1E46E8" />
        </svg>
      </div>

      <div style={{ maxWidth: '88%', minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
            fontSize: 11,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#5B6165',
            marginBottom: 6,
            paddingLeft: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span>{total > 0 ? (total === 1 ? t('route_steps_one') : t('route_steps_other', String(total))) : t('route_title')}</span>
          <StatusChip state={headerState} />
        </div>

        <div
          style={{
            borderRadius: 8,
            background: '#FBFAF5',
            border: '1px solid #DCD9CF',
            padding: 10,
          }}
        >
          {visibleExecs.map((exec) => {
            const isLast = exec.id === lastExecId && !isRunning;
            return (
              <div key={exec.id}>
                <ToolExecutionRow exec={exec} isLast={isLast} />
              </div>
            );
          })}
          {total === 0 && !isRunning && (
            <div style={{ fontSize: 12, color: '#5B6165' }}>{t('route_empty')}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Assistant Message Bubble ───────────────────────────────── */
function AssistantMessageBubble({ message }: { message: DisplayMessage }) {
  const [showReasoning, setShowReasoning] = useState(false);
  const isStreaming = message.streaming;
  const hasContent = message.content && message.content.trim().length > 0;
  const hasReasoning = message.reasoning && message.reasoning.trim().length > 0;
  const isThinking = isStreaming && !hasContent && !hasReasoning;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        maxWidth: '100%',
        padding: '4px 0',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          background: '#1E46E8',
          color: '#FBFAF5',
        }}
        aria-hidden="true"
      >
        <svg width="14" height="14" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M10.5 5 L10.5 21.2 L14.55 17.6 L17.25 24.35 L20.4 23.1 L17.7 16.7 L22.8 16.7 Z" fill="#F3F0E7" />
        </svg>
      </div>

      <div style={{ maxWidth: '88%', minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#5B6165',
            marginBottom: 4,
            paddingLeft: 4,
          }}
        >
          {t('agent_label')}
        </div>

        <div
          style={{
            borderRadius: 14,
            background: '#F3F0E7',
            border: '1px solid #DCD9CF',
            overflow: 'hidden',
          }}
        >
          {isThinking ? (
            <div
              style={{
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#5B6165',
                fontSize: 13,
              }}
            >
              <span
                className="ba-thinking-spinner"
                style={{
                  width: 14,
                  height: 14,
                  border: '2px solid #DCD9CF',
                  borderTopColor: '#1E46E8',
                  borderRadius: '50%',
                  flexShrink: 0,
                }}
              />
              {t('thinking')}
            </div>
          ) : (
            <>
              {hasReasoning && (
                <div
                  style={{
                    borderBottom: hasContent ? '1px solid #DCD9CF' : 'none',
                    background: '#FBFAF5',
                  }}
                >
                  <button
                    onClick={() => setShowReasoning(!showReasoning)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                      padding: '8px 14px',
                      fontSize: 11,
                      fontWeight: 500,
                      color: '#5B6165',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <svg
                      width={12}
                      height={12}
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      style={{
                        transform: showReasoning ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                        flexShrink: 0,
                      }}
                    >
                      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    </svg>
                    {showReasoning ? t('reasoning_hide') : t('reasoning_label')}
                  </button>
                  {showReasoning && (
                    <div
                      style={{
                        padding: '0 14px 10px',
                        fontSize: 12,
                        color: '#5B6165',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        maxHeight: 400,
                        overflowY: 'auto',
                      }}
                    >
                      {message.reasoning}
                    </div>
                  )}
                </div>
              )}

              <div style={{ padding: hasContent ? '10px 14px 12px' : '0' }}>
                {hasContent ? (
                  <MarkdownRenderer content={message.content} />
                ) : isStreaming ? (
                  <span className="ba-streaming-cursor" style={{ display: 'inline-block' }} />
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── User Message Bubble ────────────────────────────────────── */
function UserMessageBubble({ message }: { message: DisplayMessage }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row-reverse',
        alignItems: 'flex-start',
        gap: 10,
        maxWidth: '100%',
        padding: '4px 0',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 12,
          fontWeight: 700,
          background: '#DCE4FF',
          color: '#121517',
        }}
        aria-hidden="true"
      >
        V
      </div>

      <div style={{ maxWidth: '88%', minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#5B6165',
            marginBottom: 4,
            paddingRight: 4,
            textAlign: 'right',
          }}
        >
          {t('user_label')}
        </div>

        <div
          style={{
            padding: '8px 12px',
            borderRadius: 14,
            background: '#FBFAF5',
            border: '1px solid #DCD9CF',
            color: '#121517',
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {message.content}
        </div>

        {message.attachments && message.attachments.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {message.attachments.map((att) => (
              <img
                key={att.id}
                src={att.dataUrl}
                alt={att.name}
                style={{
                  maxWidth: 200,
                  maxHeight: 150,
                  borderRadius: 8,
                  objectFit: 'cover',
                  border: '1px solid #DCD9CF',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Message Bubble ──────────────────────────────────── */
export default function MessageBubble({ message }: { message: DisplayMessage }) {
  if (message.role === 'tool') {
    return <ToolMessageBubble message={message} />;
  }
  if (message.role === 'user') {
    return <UserMessageBubble message={message} />;
  }
  return <AssistantMessageBubble message={message} />;
}
