import type { ProviderEndpoint } from '../service-worker/providers/types';
import { t } from '../utils/i18n';

interface ProviderListProps {
  providers: ProviderEndpoint[];
  activeProviderId?: string;
  testing?: string | null;
  testResults?: Record<
    string,
    { ok: true; latencyMs: number } | { ok: false; error: string }
  >;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onTest: (provider: ProviderEndpoint) => void;
  onInspectRaw: (provider: ProviderEndpoint) => void;
  onSetActive: (id: string) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onAdd: () => void;
}

export function ProviderList({
  providers,
  activeProviderId,
  testing,
  testResults,
  onEdit,
  onDelete,
  onTest,
  onInspectRaw,
  onSetActive,
  onToggleEnabled,
  onAdd,
}: ProviderListProps) {
  return (
    <section className="provider-section">
      <h2>{t('options_providers_title')}</h2>

      {providers.length === 0 ? (
        <p className="empty-list" style={{ marginBottom: 12 }}>
          {t('options_no_providers')}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {providers.map((provider) => {
            const isActive = provider.id === activeProviderId;
            return (
              <div
                key={provider.id}
                className="provider-section"
                style={{
                  marginBottom: 0,
                  borderColor: isActive
                    ? 'var(--color-brand)'
                    : undefined,
                  boxShadow: isActive ? '0 0 0 1px var(--color-brand)' : undefined,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <strong style={{ color: 'var(--color-text-000)' }}>
                      {provider.label || provider.id}
                    </strong>
                    <span
                      style={{
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'var(--color-bg-200)',
                        color: 'var(--color-text-400)',
                      }}
                    >
                      {provider.type}
                    </span>
                    {isActive && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--color-brand)',
                        }}
                      >
                        {t('options_providers_active')}
                      </span>
                    )}
                  </div>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      color: 'var(--color-text-400)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={provider.enabled}
                      onChange={(e) => onToggleEnabled(provider.id, e.target.checked)}
                    />
                    {t('options_provider_enabled')}
                  </label>
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-200)',
                    marginBottom: 12,
                    wordBreak: 'break-all',
                  }}
                >
                  {provider.baseUrl}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={() => onSetActive(provider.id)}
                    disabled={isActive || !provider.enabled}
                    className="btn-test"
                  >
                    {t('options_providers_active')}
                  </button>
                  <button onClick={() => onEdit(provider.id)} className="btn-test">
                    {t('options_providers_edit')}
                  </button>
                  <button
                    onClick={() => onTest(provider)}
                    disabled={testing === provider.id}
                    className="btn-test"
                  >
                    {testing === provider.id ? t('options_testing') : t('options_providers_test')}
                  </button>
                  <button
                    onClick={() => onInspectRaw(provider)}
                    className="btn-test"
                    title={t('options_providers_inspect_raw_title')}
                  >
                    {t('options_providers_inspect_raw')}
                  </button>
                  <button onClick={() => onDelete(provider.id)} className="btn-test">
                    {t('options_providers_delete')}
                  </button>
                  {(() => {
                    const result = testResults?.[provider.id];
                    if (!result) return null;
                    return (
                      <span
                        className={`test-result ${result.ok ? 'ok' : 'fail'}`}
                      >
                        {result.ok
                          ? `${result.latencyMs}ms`
                          : result.error}
                      </span>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button onClick={onAdd} className="btn-test">
        {t('options_providers_add')}
      </button>
    </section>
  );
}
