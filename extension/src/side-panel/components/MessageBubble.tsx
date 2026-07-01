import React, { useState } from 'react';
import type { DisplayMessage, ToolExecution } from '../ChatContext';
import MarkdownRenderer from './MarkdownRenderer';
import { t } from '../../utils/i18n';

/* ─── Tool Icons ─────────────────────────────────────────────── */
const TOOL_ICONS: Record<string, string> = {
  computer: '🖥️',
  navigate: '🧭',
  browser_batch: '⚡',
  read_page: '📄',
  get_page_text: '📄',
  javascript_tool: '⚙️',
  form_input: '📝',
  screenshot: '📸',
  tabs_context: '📑',
  web_search: '🔍',
  search: '🔍',
  click: '👆',
  type: '⌨️',
  keypress: '🔑',
  scroll: '📜',
  wait: '⏳',
};

function getToolIcon(name: string): string {
  return TOOL_ICONS[name] || TOOL_ICONS[name.split('_')[0]] || '🔧';
}

function getToolAction(execution: ToolExecution): string {
  const args = execution.args || {};
  if (execution.name === 'computer' && args.action) {
    return String(args.action).replace(/_/g, ' ');
  }
  if (execution.name === 'navigate' && args.url) {
    return '→ ' + String(args.url).slice(0, 40);
  }
  if (execution.name === 'tabs_context') {
    return 'listing tabs';
  }
  if (execution.name === 'web_search' || execution.name === 'search') {
    return args.query ? `「${String(args.query).slice(0, 30)}」` : 'searching';
  }
  if (execution.name === 'screenshot') {
    return 'capturing screen';
  }
  if (execution.name === 'click' && args.selector) {
    return `clicking ${String(args.selector).slice(0, 30)}`;
  }
  if (execution.name === 'type' && args.text) {
    return `typing 「${String(args.text).slice(0, 25)}」`;
  }
  if (args.query || args.selector || args.url) {
    return String(args.query || args.selector || args.url || '').slice(0, 35);
  }
  return '';
}

/* ─── Tool Execution Row ─────────────────────────────────────── */
function ToolExecutionRow({ exec }: { exec: ToolExecution }) {
  const isRunning = exec.status === 'running';
  const isError = exec.status === 'error';
  const icon = getToolIcon(exec.name);
  const action = getToolAction(exec);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 500,
        background: isError
          ? 'rgba(239, 68, 68, 0.1)'
          : isRunning
            ? 'var(--color-bg-300)'
            : 'rgba(34, 197, 94, 0.08)',
        border: `1px solid ${isError
          ? 'rgba(239, 68, 68, 0.3)'
          : isRunning
            ? 'var(--color-border-200)'
            : 'rgba(34, 197, 94, 0.2)'}`,
        color: isError ? '#ef4444' : 'var(--color-text-200)',
        transition: 'all 0.3s ease',
        maxWidth: '100%',
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontWeight: 600 }}>{exec.name}</span>
      {action && (
        <>
          <span style={{ opacity: 0.3, margin: '0 2px' }}>·</span>
          <span style={{
            opacity: 0.85,
            maxWidth: 200,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {action}
          </span>
        </>
      )}
      {isRunning && (
        <span
          className="ba-tool-spinner"
          style={{
            width: 12,
            height: 12,
            border: '1.5px solid var(--color-border-200)',
            borderTopColor: 'var(--color-brand)',
            borderRadius: '50%',
            animation: 'ba-spin 0.8s linear infinite',
            marginLeft: 'auto',
            flexShrink: 0,
          }}
        />
      )}
      {isError && (
        <span style={{ marginLeft: 'auto', fontSize: 11 }}>⚠️</span>
      )}
      {!isRunning && !isError && (
        <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.6 }}>✓</span>
      )}
    </div>
  );
}

/* ─── Tool Message Bubble ────────────────────────────────────── */
function ToolMessageBubble({ message }: { message: DisplayMessage }) {
  const execs = message.toolExecutions || [];
  const isRunning = message.streaming;

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
      {/* Tool icon avatar */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 14,
          background: 'var(--color-bg-300)',
          color: 'var(--color-text-300)',
          border: '1px solid var(--color-border-200)',
        }}
      >
        🔧
      </div>

      <div style={{ maxWidth: '88%', minWidth: 0, flex: 1 }}>
        {/* Label */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-text-400)',
            marginBottom: 4,
            paddingLeft: 4,
          }}
        >
          Tool
          {isRunning && (
            <span style={{ marginLeft: 6, opacity: 0.5, fontSize: 9 }}>●</span>
          )}
        </div>

        <div
          style={{
            borderRadius: 10,
            background: 'var(--color-bg-200)',
            border: '0.5px solid var(--color-border-100)',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {execs.map((exec) => (
            <ToolExecutionRow key={exec.id} exec={exec} />
          ))}
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
      {/* Avatar */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 14,
          background: 'var(--color-brand)',
          color: 'white',
        }}
      >
        🤖
      </div>

      <div style={{ maxWidth: '88%', minWidth: 0, flex: 1 }}>
        {/* Label */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-text-400)',
            marginBottom: 4,
            paddingLeft: 4,
          }}
        >
          {t('agent_label')}
          {isStreaming && !isThinking && (
            <span style={{ marginLeft: 6, opacity: 0.5, fontSize: 9 }}>●</span>
          )}
        </div>

        <div
          style={{
            borderRadius: 14,
            background: 'var(--color-bg-200)',
            border: '0.5px solid var(--color-border-100)',
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
                color: 'var(--color-text-300)',
                fontSize: 13,
              }}
            >
              <span
                className="ba-thinking-spinner"
                style={{
                  width: 14,
                  height: 14,
                  border: '2px solid var(--color-border-200)',
                  borderTopColor: 'var(--color-brand)',
                  borderRadius: '50%',
                  animation: 'ba-spin 1s linear infinite',
                  flexShrink: 0,
                }}
              />
              {t('thinking')}
            </div>
          ) : (
            <>
              {/* Reasoning Section (collapsible, at top) */}
              {hasReasoning && (
                <div
                  style={{
                    borderBottom: hasContent ? '1px solid var(--color-border-100)' : 'none',
                    background: 'rgba(0,0,0,0.02)',
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
                      color: 'var(--color-text-400)',
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
                      <path d="M6 4l4 4-4 4" />
                    </svg>
                    {showReasoning ? t('reasoning_hide') : t('reasoning_label')}
                    <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>
                      {message.reasoning!.length > 200
                        ? `${message.reasoning!.slice(0, 200).trim()}...`
                        : message.reasoning}
                    </span>
                  </button>
                  {showReasoning && (
                    <div
                      style={{
                        padding: '0 14px 10px',
                        fontSize: 12,
                        color: 'var(--color-text-300)',
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

              {/* Content with Markdown */}
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
          fontSize: 14,
          background: 'var(--color-surface-light)',
          color: 'var(--color-text-000)',
        }}
      >
        👤
      </div>

      <div style={{ maxWidth: '88%', minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-text-400)',
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
            background: 'var(--color-bg-000)',
            border: '0.5px solid var(--color-border-100)',
            color: 'var(--color-text-000)',
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {message.content}
        </div>

        {/* Image attachments */}
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
                  border: '1px solid var(--color-border-200)',
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
