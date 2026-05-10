import { useState, useEffect, useCallback } from 'react';
import { t } from '../utils/i18n';
import { SearchProviderConfig } from '../service-worker/providers/types';
import './style.css';

interface StoredProviders {
  [providerId: string]: {
    baseUrl?: string;
    apiKey?: string;
    selectedModel?: string;
  };
}

const DEFAULT_PROVIDERS: StoredProviders = {
  'opencode-go': {
    baseUrl: 'https://api.opencode.cn/v1',
    selectedModel: 'deepseek-v4-pro',
  },
  'minimax': {
    baseUrl: 'https://api.minimax.chat/v1',
    selectedModel: '',
  },
  'xiaomimimo': {
    baseUrl: 'https://api.xiaomi.cn/v1',
    selectedModel: '',
  },
};

export function App() {
  const [providers, setProviders] = useState<StoredProviders>({});
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [searchConfig, setSearchConfig] = useState<SearchProviderConfig>({
    url: 'https://searx.be/search?q={query}&format=json',
    parser: 'searxng',
    apiKey: '',
  });
  const [searchTesting, setSearchTesting] = useState(false);
  const [searchTestResult, setSearchTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  interface SitePermissions {
    allowlist: string[];
    denylist: string[];
    sessionAllow: string[];
  }

  const [sitePerms, setSitePerms] = useState<SitePermissions>({ allowlist: [], denylist: [], sessionAllow: [] });
  const [newDomain, setNewDomain] = useState('');

  useEffect(() => {
    chrome.storage.local.get(['ba-providers'], (result) => {
      const stored = result['ba-providers'] as StoredProviders | undefined;
      const merged = { ...DEFAULT_PROVIDERS };
      for (const [id, config] of Object.entries(stored || {})) {
        merged[id] = { ...(merged[id] || {}), ...config };
      }
      setProviders(merged);
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

  const update = useCallback((id: string, field: string, value: string) => {
    setProviders(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }));
    setSaved(false);
  }, []);

  const updateSearchConfig = useCallback((field: string, value: string) => {
    setSearchConfig(prev => ({ ...prev, [field]: value }));
  }, []);

  const addDomain = useCallback(() => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    setSitePerms(prev => ({
      ...prev,
      allowlist: prev.allowlist.includes(domain) ? prev.allowlist : [...prev.allowlist, domain],
    }));
    setNewDomain('');
  }, [newDomain]);

  const removeFromList = useCallback((list: 'allowlist' | 'denylist', domain: string) => {
    setSitePerms(prev => ({
      ...prev,
      [list]: prev[list].filter(d => d !== domain),
    }));
  }, []);

  const clearAllPermissions = useCallback(() => {
    if (confirm('Clear all site permissions?')) {
      setSitePerms({ allowlist: [], denylist: [], sessionAllow: [] });
      chrome.storage.local.set({ 'ba-site-permissions': { allowlist: [], denylist: [], sessionAllow: [] } });
    }
  }, []);

  const handleSave = useCallback(() => {
    chrome.storage.local.set({ 'ba-providers': providers }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
    chrome.storage.local.set({ 'ba-search-provider': searchConfig });
    chrome.storage.local.set({ 'ba-site-permissions': sitePerms });
  }, [providers, searchConfig, sitePerms]);

  const handleTest = useCallback(async (id: string) => {
    const p = providers[id];
    if (!p?.baseUrl || !p?.apiKey) {
      setTestResults(prev => ({ ...prev, [id]: { ok: false, msg: t('options_fill_first') } }));
      return;
    }
    setTesting(id);
    try {
      const resp = await fetch(`${p.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' }
      });
      if (resp.ok) {
        setTestResults(prev => ({ ...prev, [id]: { ok: true, msg: t('options_saved') } }));
      } else {
        setTestResults(prev => ({ ...prev, [id]: { ok: false, msg: `Error ${resp.status}: ${resp.statusText}` } }));
      }
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [id]: { ok: false, msg: `Failed: ${err.message}` } }));
    } finally {
      setTesting(null);
    }
  }, [providers]);

  const handleSearchTest = useCallback(async () => {
    if (!searchConfig.url) {
      setSearchTestResult({ ok: false, msg: t('search_test_fail', 'URL is empty') });
      return;
    }
    setSearchTesting(true);
    setSearchTestResult(null);
    try {
      let testUrl = searchConfig.url.replace('{query}', encodeURIComponent('test'));
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (searchConfig.apiKey) {
        headers['Authorization'] = `Bearer ${searchConfig.apiKey}`;
      }
      const resp = await fetch(testUrl, { headers });
      if (resp.ok) {
        setSearchTestResult({ ok: true, msg: t('search_test_success') });
      } else {
        const text = await resp.text().catch(() => '');
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
        setProviders(DEFAULT_PROVIDERS);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      });
    }
  }, []);

  return (
    <div className="options-container">
      <header className="options-header">
        <h1>{t('options_title')}</h1>
        <p>{t('options_subtitle')}</p>
      </header>

      {Object.entries(providers).map(([id, config]) => (
        <section key={id} className="provider-section">
          <h2>{id}</h2>
          <label>
            {t('options_base_url')}
            <input
              type="url"
              value={config.baseUrl || ''}
              onChange={e => update(id, 'baseUrl', e.target.value)}
              placeholder="https://api.exemplo.com/v1"
            />
          </label>
          <label>
            {t('options_api_key')}
            <input
              type="password"
              value={config.apiKey || ''}
              onChange={e => update(id, 'apiKey', e.target.value)}
              placeholder="sk-..."
            />
          </label>
          <label>
            {t('options_model')}
            <input
              type="text"
              value={config.selectedModel || ''}
              onChange={e => update(id, 'selectedModel', e.target.value)}
              placeholder="deepseek-v4-pro"
            />
          </label>
          <div className="test-row">
            <button
              onClick={() => handleTest(id)}
              disabled={testing === id}
              className="btn-test"
            >
              {testing === id ? t('options_testing') : t('options_test')}
            </button>
            {testResults[id] && (
              <span className={`test-result ${testResults[id].ok ? 'ok' : 'fail'}`}>
                {testResults[id].msg}
              </span>
            )}
          </div>
        </section>
      ))}

      <section className="provider-section">
        <h2>{t('search_provider_section')}</h2>
        <label>
          {t('search_provider_url')}
          <input
            type="url"
            value={searchConfig.url}
            onChange={e => updateSearchConfig('url', e.target.value)}
            placeholder="https://searx.be/search?q={query}&format=json"
          />
        </label>
        <label>
          {t('search_provider_parser')}
          <select
            value={searchConfig.parser}
            onChange={e => updateSearchConfig('parser', e.target.value)}
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
            onChange={e => updateSearchConfig('apiKey', e.target.value)}
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
              {sitePerms.allowlist.map(d => (
                <li key={d}>
                  <span>{d}</span>
                  <button onClick={() => removeFromList('allowlist', d)} className="btn-small">Remove</button>
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
              {sitePerms.denylist.map(d => (
                <li key={d}>
                  <span>{d}</span>
                  <button onClick={() => removeFromList('denylist', d)} className="btn-small">Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="add-domain-row">
          <input
            type="text"
            value={newDomain}
            onChange={e => setNewDomain(e.target.value)}
            placeholder={t('options_add_domain')}
            onKeyDown={e => e.key === 'Enter' && addDomain()}
          />
          <button onClick={addDomain} className="btn-test">{t('options_add_domain')}</button>
        </div>

        <button onClick={clearAllPermissions} className="btn-reset" style={{ marginTop: 12 }}>
          {t('options_clear_permissions')}
        </button>
      </section>

      <div className="actions">
        <button onClick={handleSave} className="btn-save">{t('options_save')}</button>
        <button onClick={handleReset} className="btn-reset">{t('options_reset')}</button>
        {saved && <span className="saved-indicator">{t('options_saved')}</span>}
      </div>
    </div>
  );
}