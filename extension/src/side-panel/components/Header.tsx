import React from 'react';
import { useChat } from '../ChatContext';
import { t } from '../../utils/i18n';

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
  const menuRef = React.useRef<HTMLDivElement>(null);

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

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '0.5px solid var(--color-border-100)',
        background: 'var(--color-bg-200)',
        flexShrink: 0,
        minHeight: 44,
      }}
    >
      {/* Left: Logo + Model Selector */}
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setModelMenuOpen(!modelMenuOpen)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text-000)',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {/* Logo + model name as title */}
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M3.13946 10.6399L6.28757 8.87462L6.37405 8.73821L6.28757 8.6339H6.13189L5.60432 8.6018L3.80541 8.55366L2.24865 8.48947L0.735135 8.40923H0.492973L0.354595 8.32899L0.181622 8.1685L0.0345946 8.01605L0 7.85557L0.0345946 7.62287L0.138378 7.44634L0.224865 7.40622H0.354595L0.812973 7.44634L1.82486 7.51856L3.34703 7.62287L4.44541 7.68706L6.08 7.85557H6.33946L6.37405 7.75125L6.28757 7.68706L6.21838 7.62287L4.64432 6.55567L2.94054 5.4323L2.04973 4.78235L1.57405 4.45336L1.33189 4.14845L1.22811 3.92377L1.17622 3.69107L1.22811 3.47442L1.33189 3.28185L1.46162 3.13741L1.66054 2.99298H1.87676L2.24865 3.0331L2.39568 3.07322L2.99243 3.53059L4.26378 4.51755L5.92432 5.73721L6.16649 5.93781H6.27892V5.82548L6.16649 5.64092L5.26703 4.01204L4.30703 2.35105L3.87459 1.66098L3.76216 1.25176C3.7391 1.16082 3.69297 0.977332 3.69297 0.970913V0.762287L3.77946 0.505517L3.93513 0.240722L4.18595 0.0882648L4.4627 0H4.67892L4.83459 0.0240722L5.12865 0.0882648L5.4054 0.328987L5.82054 1.27583L6.48649 2.76028L7.52432 4.78235L7.82703 5.38415L7.99135 5.93781L8.05189 6.10632H8.15567V6.01003L8.24216 4.87061L8.39784 3.47442L8.55351 1.67703L8.6054 1.17151L8.85622 0.561685L8.9773 0.417252L9.21946 0.232698H9.35784L9.74703 0.417252L9.97189 0.665998L10.067 0.874624L10.0238 1.17151L9.83351 2.40722L9.46162 4.34102L9.21946 5.64092H9.35784L9.52216 5.47242L10.1795 4.60582L11.2778 3.22568L11.7622 2.68004L12.333 2.07823L12.6962 1.78937L13.0162 1.67703L13.3881 1.78937L13.7168 2.06219L13.8897 2.54363V2.76028L13.6649 3.32197L12.9557 4.22066L12.3676 4.98295L12.0043 5.56871L11.0011 7.02106V7.08526H11.1741L13.0768 6.67603L14.1059 6.49147L15.3341 6.28285L15.5762 6.34704L15.8876 6.53962L15.9481 6.80441L15.8876 7.12538L15.7319 7.34203L14.4173 7.66299L12.8778 7.97593L10.5854 8.51559C10.5705 8.51909 10.56 8.53236 10.56 8.54764C10.56 8.56468 10.573 8.57891 10.59 8.58044L11.6238 8.67402L12.0649 8.69809H13.1459L15.1611 8.85055L15.6886 9.19559L15.9481 9.39619L16 9.62086L15.9481 9.94985L15.8443 10.1023L15.4119 10.3029L15.1351 10.3591L14.0454 10.1023L11.4941 9.49248L10.6205 9.27583H10.4995V9.34804L11.2259 10.0622L12.5665 11.2658L14.2357 12.8225L14.3222 13.0953V13.2076L14.1059 13.5125L13.9243 13.5206L13.8811 13.4804L12.4108 12.3731L12.2984 12.325L11.84 11.8756L10.56 10.7924H10.4735V10.9047L10.7676 11.338L12.333 13.6891L12.4108 14.4112L12.2984 14.6439L11.8919 14.7884L11.667 14.7563L11.4508 14.7081L11.2605 14.5396L10.5254 13.4162L9.5827 11.9719L8.82162 10.672H8.79342C8.76039 10.672 8.73278 10.6972 8.7297 10.73L8.27676 15.5667L8.06919 15.8154L7.6454 16H7.58486L7.17838 15.6951L6.96216 15.1976L7.17838 14.2106L7.43784 12.9268L7.6454 11.9077L7.83567 10.6399L7.95187 10.2164C7.9548 10.2057 7.95069 10.1944 7.94161 10.1881C7.91157 10.1672 7.87034 10.1741 7.84878 10.2037L6.89297 11.5145L5.44 13.4804L4.28973 14.7081L4.01297 14.8205H3.80541L3.5373 14.5717V14.4514L3.58054 14.1304L3.84865 13.7372L5.44 11.7151L6.4 10.4554L7.01872 9.73222C7.04511 9.70139 7.04245 9.65523 7.0127 9.62763C7.00333 9.61894 6.98925 9.61773 6.97854 9.62471L2.75027 12.3811L1.99784 12.4774L1.66919 12.1725L1.71243 11.675L1.86811 11.5145L3.13946 10.6399Z" fill="var(--color-brand)" />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{activeModel}</span>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ color: 'var(--color-text-400)' }}>
            <path d={modelMenuOpen ? 'M12 10l-4-4-4 4' : 'M4 6l4 4 4-4'} />
          </svg>
        </button>

        {/* "New" badge for model updates */}
        {hasNewModels && onReloadModels && (
          <button
            onClick={onReloadModels}
            title="New models available — click to reload"
            style={{
              position: 'relative',
              marginLeft: 6,
              padding: '2px 8px',
              background: 'var(--color-brand, #D97757)',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              lineHeight: '18px',
            }}
          >
            New
          </button>
        )}

        {/* Mock dropdown */}
        {modelMenuOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              background: 'var(--color-bg-000)',
              border: '0.5px solid var(--color-border-200)',
              borderRadius: 10,
              padding: 4,
              minWidth: 200,
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              zIndex: 100,
            }}
          >
            {providers.length > 0 ? (
              providers.map((p) => (
                <div key={p.id}>
                  {/* Provider name header */}
                  <div style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    color: 'var(--color-text-400)',
                    fontWeight: 600,
                    marginTop: 4,
                  }}>
                    {p.name}
                  </div>
                  {/* Models for this provider */}
                  {p.models.map((model) => (
                    <div
                      key={`${p.id}-${model}`}
                      onClick={() => {
                        setProvider(p.id, model);
                        setModelMenuOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        paddingLeft: 20,
                        borderRadius: 6,
                        fontSize: 12,
                        color: activeProvider === p.id && activeModel === model
                          ? 'var(--color-brand, #D97757)'
                          : 'var(--color-text-000)',
                        cursor: 'pointer',
                        background: activeProvider === p.id && activeModel === model
                          ? 'var(--color-bg-300)'
                          : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--color-bg-300)';
                      }}
                      onMouseLeave={(e) => {
                        if (!(activeProvider === p.id && activeModel === model)) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      <span>{model}</span>
                      {activeProvider === p.id && activeModel === model && (
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M13.5 3.5L6 11l-3.5-3.5" stroke="currentColor" strokeWidth="2" fill="none" />
                        </svg>
                      )}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div style={{ padding: '10px', fontSize: 12, color: 'var(--color-text-400)', textAlign: 'center' }}>
                No providers loaded
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* Stop button (visible during streaming) */}
        {isStreaming && (
          <button
            onClick={stopGeneration}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              background: 'var(--color-bg-000)',
              border: '0.5px solid var(--color-border-100)',
              borderRadius: 8,
              color: 'var(--color-text-000)',
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
          title="Scheduled Tasks"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            background: 'none',
            border: 'none',
            borderRadius: 6,
            color: 'var(--color-text-400)',
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
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            background: 'none',
            border: 'none',
            borderRadius: 6,
            color: 'var(--color-text-400)',
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
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            background: 'none',
            border: 'none',
            borderRadius: 6,
            color: 'var(--color-text-400)',
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
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            background: 'none',
            border: 'none',
            borderRadius: 6,
            color: 'var(--color-text-400)',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.5.5 0 01.5.5v.586l.707.707a.5.5 0 01-.707.707L8 3.793l-.5.5V2.5A.5.5 0 018 2zM4.5 4.5a.5.5 0 010 .707l-.707.707a.5.5 0 01-.707-.707l.707-.707a.5.5 0 01.707 0zm7 0a.5.5 0 01.707 0l.707.707a.5.5 0 01-.707.707l-.707-.707a.5.5 0 010-.707zM8 5.5A2.5 2.5 0 1010.5 8 2.5 2.5 0 008 5.5zm0 1A1.5 1.5 0 119.5 8 1.5 1.5 0 018 6.5zM2.5 7.5a.5.5 0 010 1H2a.5.5 0 010-1h.5zm11 0a.5.5 0 010 1H13a.5.5 0 010-1h.5zM4.5 11.5a.5.5 0 010 .707l-.707.707a.5.5 0 01-.707-.707l.707-.707a.5.5 0 01.707 0zm7 0a.5.5 0 01.707 0l.707.707a.5.5 0 01-.707.707l-.707-.707a.5.5 0 010-.707zM8 13.5a.5.5 0 01.5.5v.5a.5.5 0 01-1 0v-.5a.5.5 0 01.5-.5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
