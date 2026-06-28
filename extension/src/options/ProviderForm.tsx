import { useEffect, useState } from 'react';
import type {
  AuthType,
  ProviderEndpoint,
  ProviderType,
} from '../service-worker/providers/types';
import { t } from '../utils/i18n';

interface ProviderFormProps {
  provider?: ProviderEndpoint;
  onSave: (endpoint: ProviderEndpoint) => void;
  onCancel: () => void;
  onTest: (endpoint: ProviderEndpoint) => Promise<
    | { ok: true; latencyMs: number }
    | { ok: false; error: string }
  >;
}

const DEFAULTS: ProviderEndpoint = {
  id: '',
  type: 'openai',
  label: '',
  baseUrl: '',
  authType: 'bearer',
  apiKey: '',
  enabled: true,
  modelsSource: 'auto',
  manualModels: [],
  createdAt: 0,
  updatedAt: 0,
};

const PROVIDER_TYPES: ProviderType[] = [
  'openai',
  'openai-compatible',
  'anthropic',
  'ollama',
];

const AUTH_TYPES: AuthType[] = [
  'bearer',
  'x-api-key',
  'custom-header',
  'none',
];

export function ProviderForm({
  provider,
  onSave,
  onCancel,
  onTest,
}: ProviderFormProps) {
  const [form, setForm] = useState<ProviderEndpoint>(() =>
    provider ? { ...provider } : { ...DEFAULTS },
  );
  const [manualModelsText, setManualModelsText] = useState(
    () => (provider?.manualModels ?? []).join('\n'),
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; msg: string } | null
  >(null);

  useEffect(() => {
    setForm(provider ? { ...provider } : { ...DEFAULTS });
    setManualModelsText((provider?.manualModels ?? []).join('\n'));
    setTestResult(null);
  }, [provider?.id]);

  const showApiKey = form.authType !== 'none';
  const showCustomHeader = form.authType === 'custom-header';
  const showManualModels = form.modelsSource === 'manual';

  const update = <K extends keyof ProviderEndpoint>(
    field: K,
    value: ProviderEndpoint[K],
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setTestResult(null);
  };

  const buildEndpoint = (): ProviderEndpoint => {
    const now = Date.now();
    const manualModels = showManualModels
      ? manualModelsText
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    if (provider) {
      return {
        ...form,
        manualModels,
        updatedAt: now,
      };
    }

    const slug = form.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const id = `${slug || 'provider'}-${now}`;

    return {
      ...form,
      id,
      manualModels,
      createdAt: now,
      updatedAt: now,
    };
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(buildEndpoint());
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest(buildEndpoint());
      if (result.ok) {
        setTestResult({
          ok: true,
          msg: t('options_provider_test_success', String(result.latencyMs)),
        });
      } else {
        setTestResult({
          ok: false,
          msg: t('options_provider_test_error', result.error),
        });
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        msg: t('options_provider_test_error', err.message ?? String(err)),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="provider-section">
      <h2>
        {provider ? t('options_providers_edit') : t('options_providers_add')}
      </h2>

      <form onSubmit={handleSave}>
        <label>
          {t('options_provider_label')}
          <input
            type="text"
            value={form.label}
            onChange={(e) => update('label', e.target.value)}
            placeholder={t('options_provider_label')}
            required
          />
        </label>

        <label>
          {t('options_provider_type')}
          <select
            value={form.type}
            onChange={(e) => update('type', e.target.value as ProviderType)}
            required
          >
            {PROVIDER_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t('options_provider_baseUrl')}
          <input
            type="url"
            value={form.baseUrl}
            onChange={(e) => update('baseUrl', e.target.value)}
            placeholder="https://api.example.com/v1"
            required
          />
        </label>

        <label>
          {t('options_provider_authType')}
          <select
            value={form.authType}
            onChange={(e) => update('authType', e.target.value as AuthType)}
          >
            {AUTH_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        {showCustomHeader && (
          <label>
            {t('options_provider_customHeader')}
            <input
              type="text"
              value={form.authHeaderName ?? ''}
              onChange={(e) => update('authHeaderName', e.target.value)}
              placeholder="X-Api-Key"
              required
            />
          </label>
        )}

        {showApiKey && (
          <label>
            {t('options_provider_apiKey')}
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => update('apiKey', e.target.value)}
              placeholder="sk-..."
            />
          </label>
        )}

        <label>
          {t('options_provider_modelsSource')}
          <select
            value={form.modelsSource}
            onChange={(e) =>
              update('modelsSource', e.target.value as 'auto' | 'manual')
            }
          >
            <option value="auto">auto</option>
            <option value="manual">manual</option>
          </select>
        </label>

        {showManualModels && (
          <label>
            {t('options_provider_manualModels')}
            <textarea
              value={manualModelsText}
              onChange={(e) => setManualModelsText(e.target.value)}
              placeholder="model-1\nmodel-2\nmodel-3"
              rows={4}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 6,
                padding: '10px 12px',
                background: 'var(--color-bg-200)',
                border: '0.5px solid var(--color-border-100)',
                borderRadius: 8,
                color: 'var(--color-text-000)',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </label>
        )}

        <div className="test-row" style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="btn-test"
          >
            {testing ? t('options_testing') : t('options_providers_test')}
          </button>
          {testResult && (
            <span
              className={`test-result ${testResult.ok ? 'ok' : 'fail'}`}
            >
              {testResult.msg}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button type="submit" className="btn-save">
            {t('options_provider_save')}
          </button>
          <button type="button" onClick={onCancel} className="btn-reset">
            {t('options_provider_cancel')}
          </button>
        </div>
      </form>
    </section>
  );
}
