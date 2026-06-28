import { useMemo, useState } from 'react';
import { t } from '../utils/i18n';
import type { ProviderEndpoint } from '../service-worker/providers/types';

interface RawJsonViewerProps {
  provider: ProviderEndpoint;
  rawJson: string;
  rawSearch: string;
  rawLoading: boolean;
  rawError: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
}

export function RawJsonViewer({
  provider,
  rawJson,
  rawSearch,
  rawLoading,
  rawError,
  onSearchChange,
  onClose,
}: RawJsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const formatted = useMemo(() => {
    if (!rawJson) return '';
    try {
      return JSON.stringify(JSON.parse(rawJson), null, 2);
    } catch {
      return rawJson;
    }
  }, [rawJson]);

  const filtered = useMemo(() => {
    const query = rawSearch.trim().toLowerCase();
    if (!query) return formatted;
    return formatted
      .split('\n')
      .filter((line) => line.toLowerCase().includes(query))
      .join('\n');
  }, [formatted, rawSearch]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore copy failures.
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(0, 0, 0, 0.6)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-bg-000)',
          border: '0.5px solid var(--color-border-100)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '0.5px solid var(--color-border-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--color-text-000)',
                marginBottom: 4,
              }}
            >
              {provider.label || provider.id}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--color-text-400)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: 'var(--color-bg-200)',
                }}
              >
                {provider.type}
              </span>
              <span style={{ wordBreak: 'break-all' }}>{provider.baseUrl}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-test"
            aria-label={t('options_providers_inspect_raw_close')}
          >
            {t('options_providers_inspect_raw_close')}
          </button>
        </div>

        <div
          style={{
            padding: '12px 20px',
            borderBottom: '0.5px solid var(--color-border-100)',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <input
            type="text"
            value={rawSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('options_providers_inspect_raw_search')}
            style={{
              flex: 1,
              minWidth: 180,
              margin: 0,
              padding: '10px 12px',
              background: 'var(--color-bg-200)',
              border: '0.5px solid var(--color-border-100)',
              borderRadius: 8,
              color: 'var(--color-text-000)',
              fontSize: 13,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <button onClick={handleCopy} className="btn-test">
            {copied
              ? '✓'
              : t('options_providers_inspect_raw_copy')}
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, padding: '0 20px 20px' }}>
          {rawLoading ? (
            <div
              style={{
                padding: '40px 0',
                textAlign: 'center',
                color: 'var(--color-text-400)',
                fontSize: 13,
              }}
            >
              {t('options_testing')}
            </div>
          ) : rawError ? (
            <div
              style={{
                padding: '16px 0',
                color: 'var(--color-error)',
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {rawError}
            </div>
          ) : (
            <pre
              style={{
                margin: 0,
                padding: 14,
                background: 'var(--color-bg-200)',
                border: '0.5px solid var(--color-border-100)',
                borderRadius: 8,
                color: 'var(--color-text-000)',
                fontSize: 12,
                lineHeight: 1.5,
                overflow: 'auto',
                maxHeight: 'calc(90vh - 200px)',
                minHeight: 160,
                whiteSpace: 'pre',
                wordBreak: 'break-all',
              }}
            >
              {filtered || (rawSearch.trim() ? '(no matches)' : '')}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
