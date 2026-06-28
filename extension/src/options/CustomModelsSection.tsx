import { useState, useMemo } from 'react';
import { t } from '../utils/i18n';
import type { CustomModelEntry, ProviderEndpoint } from '../service-worker/providers/types';

interface CustomModelsSectionProps {
  providers: ProviderEndpoint[];
  customModels: CustomModelEntry[];
  onChange: (entries: CustomModelEntry[]) => void;
}

function generateEntryId(): string {
  return `cm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CustomModelsSection({
  providers,
  customModels,
  onChange,
}: CustomModelsSectionProps) {
  const [providerId, setProviderId] = useState('');
  const [modelId, setModelId] = useState('');
  const [name, setName] = useState('');
  const [vision, setVision] = useState(false);
  const [tools, setTools] = useState(true);
  const [streaming, setStreaming] = useState(true);

  const providerMap = useMemo(() => {
    const map = new Map<string, ProviderEndpoint>();
    for (const p of providers) {
      map.set(p.id, p);
    }
    return map;
  }, [providers]);

  function handleAdd() {
    const trimmedModelId = modelId.trim();
    if (!providerId || !trimmedModelId) return;

    const entry: CustomModelEntry = {
      id: generateEntryId(),
      providerId,
      modelId: trimmedModelId,
      name: name.trim() || undefined,
      capabilities: { vision, tools, streaming },
      createdAt: Date.now(),
    };

    onChange([...customModels, entry]);

    setModelId('');
    setName('');
    setVision(false);
    setTools(true);
    setStreaming(true);
  }

  function handleDelete(id: string) {
    onChange(customModels.filter((e) => e.id !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <section className="provider-section">
      <h2>{t('options_custom_models_title')}</h2>
      <p
        style={{
          fontSize: 13,
          color: 'var(--color-text-200)',
          marginBottom: 16,
          marginTop: -8,
        }}
      >
        {t('options_custom_models_desc')}
      </p>

      {customModels.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, marginBottom: 20 }}>
          {customModels.map((entry) => {
            const provider = providerMap.get(entry.providerId);
            const displayName = entry.name || entry.modelId;
            const caps = [
              entry.capabilities?.vision && t('options_custom_models_vision'),
              entry.capabilities?.tools && t('options_custom_models_tools'),
              entry.capabilities?.streaming && t('options_custom_models_streaming'),
            ].filter(Boolean);

            return (
              <li
                key={entry.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 12px',
                  background: 'var(--color-bg-200)',
                  borderRadius: 8,
                  marginBottom: 8,
                  fontSize: 13,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 500,
                      color: 'var(--color-text-000)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {displayName}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--color-text-400)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {entry.modelId} · {provider?.label || entry.providerId}
                    {caps.length > 0 && ` · ${caps.join(', ')}`}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="btn-small"
                >
                  {t('options_custom_models_delete')}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p
          className="empty-list"
          style={{ marginBottom: 20 }}
        >
          {t('options_custom_models_empty')}
        </p>
      )}

      <label>
        {t('options_custom_models_provider')}
        <select
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
        >
          <option value="">-- {t('options_custom_models_provider')} --</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        {t('options_custom_models_model_id')}
        <input
          type="text"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('options_custom_models_model_id')}
        />
      </label>

      <label>
        {t('options_custom_models_name')}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('options_custom_models_name')}
        />
      </label>

      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 14,
          fontSize: 13,
          color: 'var(--color-text-000)',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={vision}
            onChange={(e) => setVision(e.target.checked)}
          />
          {t('options_custom_models_vision')}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={tools}
            onChange={(e) => setTools(e.target.checked)}
          />
          {t('options_custom_models_tools')}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={streaming}
            onChange={(e) => setStreaming(e.target.checked)}
          />
          {t('options_custom_models_streaming')}
        </label>
      </div>

      <button
        onClick={handleAdd}
        disabled={!providerId || !modelId.trim()}
        className="btn-test"
      >
        {t('options_custom_models_add')}
      </button>
    </section>
  );
}
