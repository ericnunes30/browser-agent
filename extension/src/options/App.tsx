import { useState, useEffect, useCallback } from 'react';
import { t } from '../utils/i18n';
import { getAdapter } from '../service-worker/providers/adapter-factory';
import { ProviderManager } from '../service-worker/provider-manager';
import type {
  CustomModelEntry,
  ProviderEndpoint,
  SearchProviderConfig,
  StoredProviderConfig,
} from '../service-worker/providers/types';
import {
  DEFAULT_MAX_TOOL_ITERATIONS,
  MAX_MAX_TOOL_ITERATIONS,
  MIN_MAX_TOOL_ITERATIONS,
  loadOptions as loadExtensionOptions,
  saveOptions as saveExtensionOptions,
} from './options-config';
import { ProviderForm } from './ProviderForm';
import { ProviderList } from './ProviderList';
import { RawJsonViewer } from './RawJsonViewer';
import { CustomModelsSection } from './CustomModelsSection';
import {
  loadCustomModels,
  saveCustomModels,
} from './provider-config';
import {
  buildAuthHeaders,
  buildBaseHeaders,
} from '../service-worker/providers/http-helpers';
import './style.css';

const DEFAULT_CONFIG: StoredProviderConfig = {
  version: 1,
  providers: [],
};

export function App() {
  const [config, setConfig] = useState<StoredProviderConfig>(DEFAULT_CONFIG);
  const [editingProvider, setEditingProvider] = useState<
    ProviderEndpoint | null | undefined
  >(undefined);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { ok: true; latencyMs: number } | { ok: false; error: string }>
  >({});
  const [availableModels, setAvailableModels] = useState<
    Array<{ id: string; name: string; providerId: string; providerLabel: string }>
  >([]);
  const [defaultModel, setDefaultModel] = useState('');
  const [searchConfig, setSearchConfig] = useState<SearchProviderConfig>({
    url: 'https://searx.be/search?q={query}&format=json',
    parser: 'searxng',
    apiKey: '',
  });
  const [searchTesting, setSearchTesting] = useState(false);
  const [searchTestResult, setSearchTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  const [rawProvider, setRawProvider] = useState<ProviderEndpoint | null>(null);
  const [rawJson, setRawJson] = useState('');
  const [rawSearch, setRawSearch] = useState('');
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState('');

  const [customModels, setCustomModels] = useState<CustomModelEntry[]>([]);

  const [maxToolIterations, setMaxToolIterations] = useState<number>(DEFAULT_MAX_TOOL_ITERATIONS);
  const [maxIterationsSaved, setMaxIterationsSaved] = useState(false);

  interface SitePermissions {
    allowlist: string[];
    denylist: string[];
    sessionAllow: string[];
  }

  const [sitePerms, setSitePerms] = useState<SitePermissions>({
    allowlist: [],
    denylist: [],
    sessionAllow: [],
  });
  const [newDomain, setNewDomain] = useState('');

  const manager = ProviderManager.getInstance();

  useEffect(() => {
    manager.getConfig().then((cfg) => {
      setConfig(cfg);
      manager.listModels().then((result) => {
        if (result.ok) setAvailableModels(result.models);
      });
    });

    loadCustomModels().then(setCustomModels);

    loadExtensionOptions().then((opts) => {
      setMaxToolIterations(opts.maxToolIterations);
    });

    chrome.storage.local.get('ba-default-model', (result) => {
      if (result['ba-default-model']) {
        setDefaultModel(result['ba-default-model']);
      }
    });
  }, []);

  useEffect(() => {
    chrome.storage.local.get('ba-search-provider', (result) => {
      if (result['ba-search-provider']) {
        setSearchConfig(result['ba-search-provider']);
      }
    });
  }, []);

  useEffect(() => {
    chrome.storage.local.get('ba-site-permissions', (result) => {
      if (result['ba-site-permissions']) {
        setSitePerms(result['ba-site-permissions']);
      }
    });
  }, []);

  const refreshModels = useCallback(
    async (providerId?: string) => {
      if (providerId) {
        const result = await manager.listModels(providerId);
        if (result.ok) {
          setAvailableModels(result.models);
        } else {
          setAvailableModels([]);
        }
        return;
      }
      const result = await manager.listModels();
      if (result.ok) {
        setAvailableModels(result.models);
      } else {
        setAvailableModels([]);
      }
    },
    [manager],
  );

  const handleAdd = useCallback(() => {
    setEditingProvider(null);
  }, []);

  const handleEdit = useCallback(
    (id: string) => {
      const provider = config.providers.find((p) => p.id === id);
      if (provider) setEditingProvider(provider);
    },
    [config.providers],
  );

  const handleDelete = useCallback((id: string) => {
    if (!confirm(t('options_providers_delete_confirm'))) return;
    setConfig((prev) => ({
      ...prev,
      providers: prev.providers.filter((p) => p.id !== id),
      activeProviderId:
        prev.activeProviderId === id ? undefined : prev.activeProviderId,
    }));
    setSaved(false);
  }, []);

  const handleTest = useCallback(
    async (provider: ProviderEndpoint) => {
      const id = provider.id;
      setTesting(id);
      const saved = config.providers.some((p) => p.id === id);
      const result = saved
        ? await manager.testConnection(id)
        : await getAdapter(provider.type).testConnection(provider);
      setTestResults((prev) => ({ ...prev, [id]: result }));
      setTesting(null);
    },
    [config.providers, manager],
  );

  const handleSetActive = useCallback(
    async (id: string) => {
      const nextConfig = { ...config, activeProviderId: id };
      const saveResult = await manager.saveConfig(nextConfig);
      if (!saveResult.ok) {
        alert(saveResult.error);
        return;
      }
      setConfig(nextConfig);
      await manager.setActiveProvider(id);
      await refreshModels(id);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    [config, manager, refreshModels],
  );

  const handleToggleEnabled = useCallback((id: string, enabled: boolean) => {
    setConfig((prev) => ({
      ...prev,
      providers: prev.providers.map((p) =>
        p.id === id ? { ...p, enabled } : p,
      ),
    }));
    setSaved(false);
  }, []);

  const handleFormSave = useCallback(async (provider: ProviderEndpoint) => {
    const exists = config.providers.some((p) => p.id === provider.id);
    const nextConfig = exists
      ? {
          ...config,
          providers: config.providers.map((p) =>
            p.id === provider.id ? provider : p,
          ),
        }
      : {
          ...config,
          providers: [...config.providers, provider],
        };
    setConfig(nextConfig);
    setEditingProvider(undefined);
    setSaved(false);

    const saveResult = await manager.saveConfig(nextConfig);
    if (!saveResult.ok) {
      alert(saveResult.error);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [config, manager]);

  const handleFormCancel = useCallback(() => {
    setEditingProvider(undefined);
  }, []);

  const handleFormTest = useCallback(
    async (endpoint: ProviderEndpoint) => {
      const adapter = getAdapter(endpoint.type);
      return adapter.testConnection(endpoint);
    },
    [],
  );

  function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, '');
  }

  function normalizeOllamaBaseUrl(url: string): string {
    let cleaned = url.trim();
    while (cleaned.endsWith('/')) {
      cleaned = cleaned.slice(0, -1);
    }
    if (cleaned.toLowerCase().endsWith('/v1')) {
      cleaned = cleaned.slice(0, -3);
    }
    return cleaned;
  }

  const handleInspectRaw = useCallback(async (provider: ProviderEndpoint) => {
    setRawProvider(provider);
    setRawJson('');
    setRawSearch('');
    setRawError('');
    setRawLoading(true);

    try {
      const baseHeaders = buildBaseHeaders();
      const authHeaders = buildAuthHeaders(provider);
      let url: string;
      let headers: Record<string, string> = { ...baseHeaders, ...authHeaders };

      switch (provider.type) {
        case 'ollama':
          url = `${normalizeOllamaBaseUrl(provider.baseUrl)}/api/tags`;
          break;
        case 'anthropic':
          url = `${provider.baseUrl}/models`;
          headers['anthropic-version'] = '2023-06-01';
          break;
        case 'openai':
        case 'openai-compatible':
        default:
          url = `${normalizeBaseUrl(provider.baseUrl)}/models`;
          break;
      }

      const response = await fetch(url, { method: 'GET', headers });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
      }
      setRawJson(text);
    } catch (err) {
      setRawError(err instanceof Error ? err.message : String(err));
    } finally {
      setRawLoading(false);
    }
  }, []);

  const updateSearchConfig = useCallback((field: string, value: string) => {
    setSearchConfig((prev) => ({ ...prev, [field]: value }));
  }, []);

  const addDomain = useCallback(() => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    setSitePerms((prev) => ({
      ...prev,
      allowlist: prev.allowlist.includes(domain)
        ? prev.allowlist
        : [...prev.allowlist, domain],
    }));
    setNewDomain('');
  }, [newDomain]);

  const removeFromList = useCallback(
    (list: 'allowlist' | 'denylist', domain: string) => {
      setSitePerms((prev) => ({
        ...prev,
        [list]: prev[list].filter((d) => d !== domain),
      }));
    },
    [],
  );

  const clearAllPermissions = useCallback(() => {
    if (confirm('Clear all site permissions?')) {
      setSitePerms({ allowlist: [], denylist: [], sessionAllow: [] });
      chrome.storage.local.set({
        'ba-site-permissions': { allowlist: [], denylist: [], sessionAllow: [] },
      });
    }
  }, []);

  const handleMaxIterationsChange = useCallback(
    (raw: string) => {
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed)) {
        setMaxToolIterations(parsed);
        setMaxIterationsSaved(false);
        // Auto-save on every change so users don't have to remember to click
        // Save. This is the most common UX pattern for a single number input
        // and avoids the "I changed it but it didn't stick" confusion.
        saveExtensionOptions({ maxToolIterations: parsed })
          .then(() => {
            setMaxIterationsSaved(true);
            setTimeout(() => setMaxIterationsSaved(false), 2000);
          })
          .catch((err) => console.error('Failed to save max iterations:', err));
      }
    },
    [],
  );

  const handleMaxIterationsSave = useCallback(async () => {
    await saveExtensionOptions({ maxToolIterations });
    setMaxIterationsSaved(true);
    setTimeout(() => setMaxIterationsSaved(false), 2000);
  }, [maxToolIterations]);

  const handleCustomModelsChange = useCallback(async (entries: CustomModelEntry[]) => {
    setCustomModels(entries);
    await saveCustomModels(entries);
    await refreshModels();
  }, [refreshModels]);

  const handleSave = useCallback(async () => {
    const saveResult = await manager.saveConfig(config);
    if (!saveResult.ok) {
      alert(saveResult.error);
      return;
    }
    await manager.setActiveProvider(config.activeProviderId ?? null);
    await saveCustomModels(customModels);
    await chrome.storage.local.set({ 'ba-default-model': defaultModel });
    await chrome.storage.local.set({ 'ba-search-provider': searchConfig });
    await chrome.storage.local.set({ 'ba-site-permissions': sitePerms });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [config, customModels, defaultModel, manager, searchConfig, sitePerms]);

  const handleSearchTest = useCallback(async () => {
    if (!searchConfig.url) {
      setSearchTestResult({ ok: false, msg: t('search_test_fail', 'URL is empty') });
      return;
    }
    setSearchTesting(true);
    setSearchTestResult(null);
    try {
      let testUrl = searchConfig.url.replace('{query}', encodeURIComponent('test'));
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (searchConfig.apiKey) {
        headers['Authorization'] = `Bearer ${searchConfig.apiKey}`;
      }
      const resp = await fetch(testUrl, { headers });
      if (resp.ok) {
        setSearchTestResult({ ok: true, msg: t('search_test_success') });
      } else {
        setSearchTestResult({
          ok: false,
          msg: t('search_test_fail', `HTTP ${resp.status}: ${resp.statusText}`),
        });
      }
    } catch (err: any) {
      setSearchTestResult({
        ok: false,
        msg: t('search_test_fail', err.message),
      });
    } finally {
      setSearchTesting(false);
    }
  }, [searchConfig]);

  const handleReset = useCallback(() => {
    if (confirm(t('options_clear_confirm'))) {
      chrome.storage.local.clear(() => {
        manager.getConfig().then((cfg) => setConfig(cfg));
        loadCustomModels().then(setCustomModels);
        setDefaultModel('');
        setAvailableModels([]);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      });
    }
  }, [manager]);

  return (
    <div className="options-container">
      <header className="options-header">
        <h1>{t('options_title')}</h1>
        <p>{t('options_subtitle')}</p>
      </header>

      <ProviderList
        providers={config.providers}
        activeProviderId={config.activeProviderId}
        testing={testing}
        testResults={testResults}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onTest={handleTest}
        onInspectRaw={handleInspectRaw}
        onSetActive={handleSetActive}
        onToggleEnabled={handleToggleEnabled}
        onAdd={handleAdd}
      />

      {editingProvider !== undefined && (
        <ProviderForm
          provider={editingProvider ?? undefined}
          onSave={handleFormSave}
          onCancel={handleFormCancel}
          onTest={handleFormTest}
        />
      )}

      {rawProvider && (
        <RawJsonViewer
          provider={rawProvider}
          rawJson={rawJson}
          rawSearch={rawSearch}
          rawLoading={rawLoading}
          rawError={rawError}
          onSearchChange={setRawSearch}
          onClose={() => setRawProvider(null)}
        />
      )}

      <CustomModelsSection
        providers={config.providers}
        customModels={customModels}
        onChange={handleCustomModelsChange}
      />

      <section className="provider-section">
        <h2>{t('options_default_model')}</h2>
        <label>
          {t('options_default_model')}
          <select
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            disabled={availableModels.length === 0}
          >
            <option value="">
              {availableModels.length === 0
                ? t('options_no_providers')
                : '-- select model --'}
            </option>
            {availableModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} ({model.providerLabel})
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="provider-section">
        <h2>{t('agent_settings_section')}</h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-400)', margin: '0 0 12px' }}>
          {t('max_iterations_help')}
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ minWidth: 200 }}>{t('max_iterations_label')}</span>
          <input
            type="number"
            min={MIN_MAX_TOOL_ITERATIONS}
            max={MAX_MAX_TOOL_ITERATIONS}
            value={maxToolIterations}
            onChange={(e) => handleMaxIterationsChange(e.target.value)}
            style={{ width: 80 }}
          />
          <button
            onClick={handleMaxIterationsSave}
            className="btn-test"
            disabled={maxIterationsSaved}
          >
            {maxIterationsSaved ? t('saved') : t('save')}
          </button>
        </label>
        <p style={{ fontSize: 11, color: 'var(--color-text-400)', margin: '4px 0 0 212px' }}>
          {t(
            'max_iterations_range',
            String(MIN_MAX_TOOL_ITERATIONS),
            String(MAX_MAX_TOOL_ITERATIONS),
            String(DEFAULT_MAX_TOOL_ITERATIONS),
          )}
        </p>
      </section>

      <section className="provider-section">
        <h2>{t('search_provider_section')}</h2>
        <label>
          {t('search_provider_url')}
          <input
            type="url"
            value={searchConfig.url}
            onChange={(e) => updateSearchConfig('url', e.target.value)}
            placeholder="https://searx.be/search?q={query}&format=json"
          />
        </label>
        <label>
          {t('search_provider_parser')}
          <select
            value={searchConfig.parser}
            onChange={(e) => updateSearchConfig('parser', e.target.value)}
          >
            <option value="searxng">SearXNG</option>
            <option value="google">Google</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label>
          {t('search_provider_api_key')}
          <input
            type="password"
            value={searchConfig.apiKey || ''}
            onChange={(e) => updateSearchConfig('apiKey', e.target.value)}
            placeholder={t('search_provider_api_key')}
          />
        </label>
        <div className="test-row">
          <button
            onClick={handleSearchTest}
            disabled={searchTesting}
            className="btn-test"
          >
            {searchTesting ? t('search_testing') : t('search_test')}
          </button>
          {searchTestResult && (
            <span className={`test-result ${searchTestResult.ok ? 'ok' : 'fail'}`}>
              {searchTestResult.msg}
            </span>
          )}
        </div>
      </section>

      <section className="provider-section">
        <h2>{t('options_site_permissions')}</h2>

        <div className="domain-list">
          <h3>{t('options_allowlist')}</h3>
          {sitePerms.allowlist.length === 0 ? (
            <p className="empty-list">No sites allowed</p>
          ) : (
            <ul>
              {sitePerms.allowlist.map((d) => (
                <li key={d}>
                  <span>{d}</span>
                  <button
                    onClick={() => removeFromList('allowlist', d)}
                    className="btn-small"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="domain-list">
          <h3>{t('options_denylist')}</h3>
          {sitePerms.denylist.length === 0 ? (
            <p className="empty-list">No sites blocked</p>
          ) : (
            <ul>
              {sitePerms.denylist.map((d) => (
                <li key={d}>
                  <span>{d}</span>
                  <button
                    onClick={() => removeFromList('denylist', d)}
                    className="btn-small"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="add-domain-row">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder={t('options_add_domain')}
            onKeyDown={(e) => e.key === 'Enter' && addDomain()}
          />
          <button onClick={addDomain} className="btn-test">
            {t('options_add_domain')}
          </button>
        </div>

        <button
          onClick={clearAllPermissions}
          className="btn-reset"
          style={{ marginTop: 12 }}
        >
          {t('options_clear_permissions')}
        </button>
      </section>

      <div className="actions">
        <button onClick={handleSave} className="btn-save">
          {t('options_save')}
        </button>
        <button onClick={handleReset} className="btn-reset">
          {t('options_reset')}
        </button>
        {saved && <span className="saved-indicator">{t('options_saved')}</span>}
      </div>
    </div>
  );
}
