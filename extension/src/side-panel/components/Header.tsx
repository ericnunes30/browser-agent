import React from 'react';
import { useChat } from '../ChatContext';
import { t } from '../../utils/i18n';

export function BaBrandMark({ size = 24 }: { size?: 16 | 24 | 40 | 56 | number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1E46E8" />
      <path
        d="M10.5 5 L10.5 21.2 L14.55 17.6 L17.25 24.35 L20.4 23.1 L17.7 16.7 L22.8 16.7 Z"
        fill="#F3F0E7"
      />
    </svg>
  );
}

/* ─── Friendly model display names ──────────────────────────────── */
/* "opencode-go/muse-spark-1.3-contributor" -> "Muse Spark 1.3 Contributor".
   Raw ids stay untouched in `activeModel` (API calls) and tooltips. */

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'muse-spark-1.3-contributor': 'Muse Spark 1.3 Contributor',
  'muse-spark-1.2-contributor': 'Muse Spark 1.2 Contributor',
  'deepseek-v4.1-flash': 'DeepSeek V4.1 Flash',
  'deepseek-v4.1-flash-free': 'DeepSeek V4.1 Flash (Free)',
  'big-pickle': 'Big Pickle',
  'gpt-4o': 'GPT-4o',
  'o3': 'o3',
  'claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'claude-opus-4-1': 'Claude Opus 4.1',
  'claude-haiku-3-5': 'Claude Haiku 3.5',
};

const MODEL_ACRONYMS: Record<string, string> = {
  gpt: 'GPT',
  api: 'API',
  llm: 'LLM',
};

function prettifyModelId(id: string): string {
  return id
    .split(/[-_]+/)
    .map((tok) => {
      if (/^\d/.test(tok)) return tok;
      const low = tok.toLowerCase();
      if (MODEL_ACRONYMS[low]) return MODEL_ACRONYMS[low];
      return tok.charAt(0).toUpperCase() + tok.slice(1);
    })
    .join(' ');
}

function displayModelName(model: string, providerId: string): string {
  const short = model.startsWith(`${providerId}/`)
    ? model.slice(providerId.length + 1)
    : model;
  return MODEL_DISPLAY_NAMES[short] ?? MODEL_DISPLAY_NAMES[model] ?? prettifyModelId(short);
}

export default function Header({
  onSettingsClick,
  onTasksClick,
  hasNewModels,
  onReloadModels,
}: {
  onSettingsClick: () => void;
  onTasksClick?: () => void;
  hasNewModels?: boolean;
  onReloadModels?: () => void;
}) {
  const { clearConversation, isStreaming, stopGeneration, activeProvider, activeModel, providers, setProvider } = useChat();
  const [modelMenuOpen, setModelMenuOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const menuRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const filteredProviders = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = !q
      ? providers
      : providers
          .map((p) => ({ ...p, models: p.models.filter((m) =>
            m.toLowerCase().includes(q) ||
            displayModelName(m, p.id).toLowerCase().includes(q),
          ) }))
          .filter((p) => p.models.length > 0);
    return filtered;
  }, [providers, searchQuery]);

  React.useEffect(() => {
    if (modelMenuOpen) {
      searchInputRef.current?.focus();
    } else {
      setSearchQuery('');
    }
  }, [modelMenuOpen]);

  // Close menu on click outside
  React.useEffect(() => {
    if (!modelMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelMenuOpen]);

  const currentProvider = providers.find(p => p.id === activeProvider);

  const modelTitle = currentProvider
    ? `${currentProvider.name} · ${activeModel}`
    : activeModel;

  const hasModel = activeModel.trim().length > 0;
  const modelLabel = hasModel
    ? displayModelName(activeModel, activeProvider)
    : t('models_select');

  return (
    <div
      className="ba-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #DCD9CF',
        background: '#FBFAF5',
        flexShrink: 0,
        minHeight: 44,
      }}
    >
      {/* Left: Brand + Model Selector + Tab chip */}
      <div ref={menuRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <span style={{ flexShrink: 0, display: 'inline-flex' }}>
          <BaBrandMark size={24} />
        </span>
        <button
          onClick={() => setModelMenuOpen(!modelMenuOpen)}
          className="ba-model-btn"
          title={modelTitle}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            borderRadius: 6,
            background: 'transparent',
            border: 'none',
            color: '#121517',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            minWidth: 0,
            flexShrink: 1,
            overflow: 'hidden',
          }}
        >
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
            color: hasModel ? '#121517' : '#5B6165',
          }}>
            {modelLabel}
          </span>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ color: '#5B6165', flexShrink: 0 }}>
            <path d={modelMenuOpen ? 'M12 10l-4-4-4 4' : 'M4 6l4 4 4-4'} />
          </svg>
        </button>

        <span className="ba-tab-chip" title={t('tab_active')} style={{ flexShrink: 0 }}>
          <span className="ba-tab-chip-dot" aria-hidden="true" />
          <span>{t('tab_chip')}</span>
        </span>

        {/* New badge for model updates */}
        {hasNewModels && onReloadModels && (
          <button
            onClick={onReloadModels}
            title={t('models_reload')}
            style={{
              position: 'relative',
              marginLeft: 2,
              padding: '2px 8px',
              background: '#1E46E8',
              color: '#FBFAF5',
              border: 'none',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              lineHeight: '18px',
            }}
          >
            {t('models_new_badge')}
          </button>
        )}

        {modelMenuOpen && (
          <div
            className="ba-menu"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              background: '#FBFAF5',
              border: '1px solid #DCD9CF',
              borderRadius: 6,
              padding: 4,
              minWidth: 220,
              maxWidth: 'calc(100vw - 24px)',
              maxHeight: 'calc(100vh - 120px)',
              boxShadow: '0 18px 40px rgba(18, 21, 23, 0.14)',
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {providers.length > 0 ? (
              <>
                <div style={{ padding: '4px 8px 8px', flexShrink: 0 }}>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('models_search')}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '6px 8px',
                      borderRadius: 6,
                      border: '1px solid #DCD9CF',
                      background: '#FBFAF5',
                      color: '#121517',
                      fontSize: 12,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div
                  style={{
                    overflowY: 'auto',
                    minHeight: 0,
                  }}
                >
                  {filteredProviders.length > 0 ? (
                    filteredProviders.map((p) => (
                      <div key={p.id}>
                        <div style={{
                          padding: '4px 10px',
                          fontSize: 11,
                          color: '#5B6165',
                          fontWeight: 600,
                          marginTop: 4,
                        }}>
                          {p.name}
                        </div>
                        {p.models.map((model) => {
                          const isActive = activeProvider === p.id && activeModel === model;
                          const label = displayModelName(model, p.id);
                          const showRawId = label !== model;
                          return (
                            <div
                              key={`${p.id}-${model}`}
                              onClick={() => {
                                setProvider(p.id, model);
                                setModelMenuOpen(false);
                                setSearchQuery('');
                              }}
                              title={model}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '6px 10px',
                                paddingLeft: 20,
                                borderRadius: 6,
                                fontSize: 12,
                                color: isActive
                                  ? '#1E46E8'
                                  : '#121517',
                                cursor: 'pointer',
                                background: isActive
                                  ? '#DCE4FF'
                                  : 'transparent',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#DCE4FF';
                              }}
                              onMouseLeave={(e) => {
                                if (!isActive) {
                                  e.currentTarget.style.background = 'transparent';
                                }
                              }}
                            >
                              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                                {showRawId && (
                                  <span style={{
                                    display: 'block',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                                    fontSize: 10,
                                    color: '#5B6165',
                                    marginTop: 1,
                                  }}>
                                    {model}
                                  </span>
                                )}
                              </span>
                              {isActive && (
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M13.5 3.5L6 11l-3.5-3.5" stroke="currentColor" strokeWidth="2" fill="none" />
                                </svg>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '10px', fontSize: 12, color: '#5B6165', textAlign: 'center' }}>
                      {t('models_no_match')}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ padding: '10px', fontSize: 12, color: '#5B6165', textAlign: 'center' }}>
                <div>{t('models_no_providers')}</div>
                <button
                  onClick={() => chrome.runtime.openOptionsPage?.()}
                  style={{
                    marginTop: 8,
                    padding: '4px 10px',
                    background: '#1E46E8',
                    color: '#FBFAF5',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {t('header_options')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {/* Stop button (visible during streaming) */}
        {isStreaming && (
          <button
            onClick={stopGeneration}
            className="ba-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              background: '#FBFAF5',
              border: '1px solid #DCD9CF',
              borderRadius: 6,
              color: '#121517',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="2" y="2" width="8" height="8" rx="1" />
            </svg>
            {t('chat_abort')}
          </button>
        )}

        {/* Tasks (scheduled) */}
        <button
          onClick={onTasksClick}
          title={t('tasks_title')}
          className="ba-icon-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            background: 'none',
            border: 'none',
            borderRadius: 6,
            color: '#5B6165',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 3.5a.5.5 0 01.5.5v3.5H11a.5.5 0 010 1H8a.5.5 0 01-.5-.5V4a.5.5 0 01.5-.5z"/>
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1.5A5.5 5.5 0 1113.5 8 5.5 5.5 0 018 2.5z"/>
          </svg>
        </button>

        {/* History (coming soon) */}
        <button
          onClick={() => {}}
          title={t('header_history')}
          className="ba-icon-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            background: 'none',
            border: 'none',
            borderRadius: 6,
            color: '#5B6165',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1.5A5.5 5.5 0 1113.5 8 5.5 5.5 0 018 2.5zM8 4a.5.5 0 01.5.5V8a.5.5 0 01-.5.5H5.5a.5.5 0 010-1H7V4.5A.5.5 0 018 4z" />
          </svg>
        </button>

        {/* Clear */}
        <button
          onClick={clearConversation}
          title={t('header_clear')}
          className="ba-icon-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            background: 'none',
            border: 'none',
            borderRadius: 6,
            color: '#5B6165',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5 2a1 1 0 011-1h4a1 1 0 011 1v1h2.5a.5.5 0 010 1H13v8a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a.5.5 0 010-1H5V2zm1 1h4V2H6v1zM4 4v8a1 1 0 001 1h6a1 1 0 001-1V4H4zm2 2.5a.5.5 0 01.5.5v4a.5.5 0 01-1 0V7a.5.5 0 01.5-.5zm4 0a.5.5 0 01.5.5v4a.5.5 0 01-1 0V7a.5.5 0 01.5-.5z" />
          </svg>
        </button>

        {/* Settings */}
        <button
          onClick={onSettingsClick}
          title={t('header_settings')}
          className="ba-icon-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            background: 'none',
            border: 'none',
            borderRadius: 6,
            color: '#5B6165',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.5.5 0 01.5.5v.586l.707.707a.5.5 0 01-.707.707L8 3.793l-.5.5V2.5A.5.5 0 018 2zM4.5 4.5a.5.5 0 010 .707l-.707.707a.5.5 0 01-.707-.707l.707-.707a.5.5 0 01.707 0zm7 0a.5.5 0 01.707 0l.707.707a.5.5 0 01-.707.707l-.707-.707a.5.5 0 010-.707zM8 5.5A2.5 2.5 0 1010.5 8 2.5 2.5 0 008 5.5zm0 1A1.5 1.5 0 119.5 8 1.5 1.5 0 018 6.5zM2.5 7.5a.5.5 0 010 1H2a.5.5 0 010-1h.5zm11 0a.5.5 0 010 1H13a.5.5 0 010-1h.5zM4.5 11.5a.5.5 0 010 .707l-.707.707a.5.5 0 01-.707-.707l.707-.707a.5.5 0 01.707 0zm7 0a.5.5 0 01.707 0l.707.707a.5.5 0 01-.707.707l-.707-.707a.5.5 0 010-.707zM8 13.5a.5.5 0 01.5.5v.5a.5.5 0 01-1 0v-.5a.5.5 0 01.5-.5z" />
          </svg>
        </button>

        {/* Options */}
        <button
          onClick={() => chrome.runtime.openOptionsPage?.()}
          title={t('providers_manage')}
          className="ba-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px 8px',
            background: 'none',
            border: '1px solid #DCD9CF',
            borderRadius: 6,
            color: '#5B6165',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {t('header_options')}
        </button>
      </div>
    </div>
  );
}
