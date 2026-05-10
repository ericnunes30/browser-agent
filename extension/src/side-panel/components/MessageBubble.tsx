import React, { useState } from 'react';
import type { DisplayMessage } from '../ChatContext';
import { t } from '../../utils/i18n';

const TOOL_ICONS: Record<string, string> = {
  computer: 'M0 1.5A1.5 1.5 0 011.5 0h13A1.5 1.5 0 0116 1.5v8a1.5 1.5 0 01-1.5 1.5H8.5v1.5h2.25a.75.75 0 010 1.5H5.25a.75.75 0 010-1.5H7.5V11H1.5A1.5 1.5 0 010 9.5v-8zM1.5 1a.5.5 0 00-.5.5v8a.5.5 0 00.5.5h13a.5.5 0 00.5-.5v-8a.5.5 0 00-.5-.5h-13z',
  navigate: 'M8 0a8 8 0 100 16A8 8 0 008 0zM4.5 7.5a.5.5 0 000 1h5.793L8.146 10.646a.5.5 0 00.708.708l3-3a.5.5 0 000-.708l-3-3a.5.5 0 00-.708.708L10.293 7.5H4.5z',
  browser_batch: 'M2 2.5a.5.5 0 01.5-.5h11a.5.5 0 010 1h-11a.5.5 0 01-.5-.5zm0 3a.5.5 0 01.5-.5h11a.5.5 0 010 1h-11a.5.5 0 01-.5-.5zm0 3a.5.5 0 01.5-.5h11a.5.5 0 010 1h-11a.5.5 0 01-.5-.5zm0 3a.5.5 0 01.5-.5h11a.5.5 0 010 1h-11a.5.5 0 01-.5-.5z',
  read_page: 'M2 2a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V2zm2-1a1 1 0 00-1 1v4h10V2a1 1 0 00-1-1H4zm9 6H3v7h8V7zm-7 2h4v1H4V9zm0 2h4v1H4v-1z',
  javascript_tool: 'M10.5 8a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM2.5 11.5A2.5 2.5 0 015 14h6a2.5 2.5 0 012.5-2.5V8a4.5 4.5 0 00-9 0v3.5z',
  form_input: 'M3 3.5a.5.5 0 01.5-.5h9a.5.5 0 010 1h-9a.5.5 0 01-.5-.5zM3 6a.5.5 0 01.5-.5h9a.5.5 0 010 1h-9A.5.5 0 013 6zm0 2.5a.5.5 0 01.5-.5h5a.5.5 0 010 1h-5a.5.5 0 01-.5-.5z',
  screenshot: 'M10.5 8.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM2 4a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1.5l-.5-1.5a1 1 0 00-.95-.67H6.95a1 1 0 00-.95.67L5.5 4H2zm5.5 2.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z',
};

function getToolIcon(toolName: string): string {
  if (toolName === 'computer') return TOOL_ICONS.computer;
  if (toolName === 'navigate') return TOOL_ICONS.navigate;
  if (toolName === 'browser_batch') return TOOL_ICONS.browser_batch;
  if (toolName === 'read_page' || toolName === 'get_page_text') return TOOL_ICONS.read_page;
  if (toolName === 'javascript_tool') return TOOL_ICONS.javascript_tool;
  if (toolName === 'form_input') return TOOL_ICONS.form_input;
  if (toolName === 'computer') return TOOL_ICONS.screenshot;
  return TOOL_ICONS.computer;
}

function getToolAction(toolCall: { name: string; arguments: Record<string, unknown> }): string {
  const args = toolCall.arguments;
  if (toolCall.name === 'computer' && args.action) {
    return String(args.action).replace(/_/g, ' ');
  }
  if (toolCall.name === 'navigate' && args.url) {
    return 'navigate to ' + String(args.url).slice(0, 30);
  }
  if (toolCall.name === 'browser_batch') {
    const steps = args.steps as Array<{ name: string }> | undefined;
    return steps ? `${steps.length} steps` : 'batch';
  }
  if (args.query || args.selector || args.url) {
    return String(args.query || args.selector || args.url || '').slice(0, 30);
  }
  return '';
}

export default function MessageBubble({ message }: { message: DisplayMessage }) {
  const [showReasoning, setShowReasoning] = useState(false);
  const isUser = message.role === 'user';
  const isStreaming = message.streaming;
  const isThinking = isStreaming && !message.content && !message.reasoning && !message.tool_calls?.length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
        gap: 8,
        maxWidth: '100%',
      }}
    >
      {/* Avatar */}
      <div
        className={isUser ? 'ba-avatar ba-avatar-user' : 'ba-avatar ba-avatar-agent'}
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 12,
          fontWeight: 600,
          background: isUser ? 'var(--color-surface-light)' : 'var(--color-brand)',
          color: isUser ? 'var(--color-text-000)' : 'white',
        }}
      >
        {isUser ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 8a3 3 0 100-6 3 3 0 000 6zm-5 6a5 5 0 0110 0H3z" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.14 10.64l3.15-1.77.09-.13-.09-.11h-.15l-.53-.03-1.8-.05-1.55-.06-1.52-.08h-.24l-.14-.08-.17-.16-.15-.15L0 7.86l.03-.23.1-.18.09-.04h.13l.46.04 1.01.07 1.52.1 1.1.07 1.63.17h.26l.04-.1-.09-.07-.07-.06-1.57-1.07-1.7-1.12-.9-.65-.47-.33-.24-.3-.1-.23-.05-.23.05-.22.1-.18.13-.14.2-.15h.22l.37.04.15.04.6.46 1.27.99 1.66 1.22.24.2h.11v-.11l-.11-.19-.9-1.63-.96-1.66-.43-.69-.12-.41c-.02-.09-.07-.27-.07-.28v-.2l.09-.26.15-.27.25-.15.28-.09h.22l.15.02.3.06.27.25.42.94.66 1.49 1.04 2.02.3.6.16.55.06.17h.1v-.1l.09-1.14.16-1.4.15-1.8.05-.5.25-.61.12-.15.24-.18h.14l.4.18.22.25.1.21-.05.3-.19 1.23-.37 1.94-.24 1.3h.14l.16-.17.66-.87 1.1-1.38.48-.54.57-.6.36-.29.32-.11.37.11.33.27.17.48v.22l-.22.56-.71.9-.59.76-.36.59-1 1.45v.06h.17l1.9-.4 1.03-.19 1.23-.2.24.06.31.2.06.26-.06.32-.16.22-1.31.32-1.54.31-2.3.54c-.01 0-.02.01-.02.03 0 .02.01.03.03.03l1.03.1.44.02h1.08l2.02.15.53.35.26.2.05.22-.05.33-.1.15-.44.2-.27.06-1.09-.26-2.55-.61-.87-.22h-.12v.07l.73.72 1.34 1.2 1.67 1.56.09.27v.11l-.22.3-.18.01-.04-.04-1.47-1.1-.12-.05-.46-.45-1.28-1.08h-.09v.11l.3.43 1.56 2.35.08.72-.11.23-.41.15-.22-.03-.22-.05-.19-.17-.73-1.12-.95-1.45-.76-1.3h-.03c-.03 0-.06.03-.06.06l-.45 4.84-.2.25-.43.18h-.06l-.4-.3-.22-.5.22-1 .26-1.28.2-1.02.19-1.27.12-.42c0-.01-.01-.02-.02-.02-.03-.02-.07 0-.09.01l-1.95 1.31-1.45 1.97-1.15 1.23-.28.11h-.2l-.27-.25v-.12l.04-.32.27-.4 1.59-2.02.96-1.26.62-.72c.03-.03.02-.08-.01-.1-.01-.01-.02-.01-.03 0l-4.23 2.76-.75.1-.33-.3.04-.5.16-.16 1.27-.88z" />
          </svg>
        )}
      </div>

      {/* Bubble */}
      <div
        style={{
          maxWidth: '85%',
          minWidth: 0,
        }}
      >
        {/* Label */}
        <div
          className="ba-message-label"
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-400)',
            marginBottom: 2,
            textAlign: isUser ? 'right' : 'left',
          }}
        >
          {isUser ? t('user_label') : t('agent_label')}
        </div>

        {/* Content */}
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 12,
            background: isUser ? 'var(--color-bg-000)' : 'var(--color-bg-200)',
            border: '0.5px solid var(--color-border-100)',
            color: 'var(--color-text-000)',
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {isThinking ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg className="ba-thinking-spinner" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 14A6 6 0 118 2a6 6 0 010 12z" opacity=".3" />
                <path d="M8 0a8 8 0 018 8h-2A6 6 0 008 2V0z" />
              </svg>
              {t('thinking')}
            </span>
          ) : (
            <>{message.content || '...'}</>
          )}
          {isStreaming && !isThinking && (
            <span className="ba-streaming-cursor" />
          )}

          {/* Tool calls display */}
          {message.tool_calls && message.tool_calls.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {message.tool_calls.map((tc) => {
                const action = getToolAction(tc);
                return (
                  <div
                    key={tc.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      background: 'var(--color-bg-100)',
                      borderRadius: 8,
                      border: '0.5px solid var(--color-border-200)',
                      fontSize: 12,
                      color: 'var(--color-text-200)',
                      maxWidth: 'fit-content',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, opacity: 0.7 }}>
                      <path d={getToolIcon(tc.name)} />
                    </svg>
                    <span style={{ fontWeight: 600 }}>{tc.name}</span>
                    {action && (
                      <>
                        <span style={{ opacity: 0.3 }}>·</span>
                        <span style={{ opacity: 0.8, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {action}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reasoning section */}
        {message.reasoning && (
          <div className="ba-reasoning-section" style={{ marginTop: 4 }}>
            <button
              className="ba-reasoning-toggle"
              onClick={() => setShowReasoning(!showReasoning)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                color: 'var(--color-text-400)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: 4,
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="currentColor"
                style={{
                  transform: showReasoning ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s',
                }}
              >
                <path d="M6 4l4 4-4 4" />
              </svg>
              {showReasoning ? t('reasoning_hide') : t('reasoning_label')}
            </button>
            {showReasoning && (
              <div
                className="ba-reasoning-content"
                style={{
                  marginTop: 6,
                  padding: '8px 10px',
                  background: 'var(--color-bg-300)',
                  borderRadius: 6,
                  fontSize: 12,
                  color: 'var(--color-text-300)',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 200,
                  overflowY: 'auto',
                }}
              >
                {message.reasoning}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
