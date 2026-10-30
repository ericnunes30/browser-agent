# Design — Pi Model Tracker

**Feature ID:** `pi-model-tracker`
**Baseado no spec:** `spec.md`

---

## 1. Visão Geral da Arquitetura

```
┌─────────────────────┐      fs.watch     ┌──────────────────────────┐
│  ~/.pi/agent/       │ ───────────────►  │  sync-models.js          │
│  models.json        │                    │  --watch mode (terminal) │
│  (pi coding agent)  │                    │                          │
└─────────────────────┘                    │  1. Detecta mudança      │
                                           │  2. Lê pi models.json    │
                                           │  3. Merge com custom     │
                                           │  4. Escreve custom.json  │
                                           └────────────┬─────────────┘
                                                        │
                                                        ▼
                                           ┌──────────────────────────┐
                                           │  extension/config/        │
                                           │  models.custom.json       │
                                           │  (atualizado com novos    │
                                           │   modelos do pi)         │
                                           └────────────┬─────────────┘
                                                        │
                                           fetch (cache: no-cache)
                                                        │
                                                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       Service Worker                                │
│                                                                     │
│  chrome.runtime.onStartup → markPendingSyncIfNeeded()               │
│  registry.reloadProviders() → re-lê custom.json + storage           │
│  registry.hasNewModelsSince() → compara Last-Modified               │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                    chrome.runtime.sendMessage
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       Side Panel UI                                 │
│                                                                     │
│  Header: badge laranja "New" quando hasNewModels=true               │
│  ChatContext: checkForNewModels() no mount                          │
│  Provider selector: mostra modelos atualizados após reload          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Componentes Detalhados

### 2.1 `sync-models.js` — Modo Watch

**Ficheiro:** `scripts/sync-models.js`

#### Interface CLI

| Flag | Descrição |
|------|-----------|
| `--watch` | Monitoriza `~/.pi/agent/models.json` e auto-sincroniza |
| `--help` | Mostra ajuda |

#### Comportamento Watch

1. Executa sync inicial (one-shot)
2. Regista `fs.watch(PI_MODELS_PATH, { persistent: true }, callback)`
3. No callback:
   - Debounce de 500ms (evita múltiplos eventos por save)
   - Lê pi models.json
   - Merge com custom existente
   - Escreve novo custom.json
   - Log "Auto-sync: models updated"
4. Graceful shutdown em SIGINT/SIGTERM

#### Tratamento de Erros

- Ficheiro pi não existe → log warning, continua a watch
- Erro de leitura/escrita → log error, continua a watch
- JSON mal formatado → log error, continua a watch

#### Código

```javascript
// Adicionar ao final de sync-models.js

const WATCH_DEBOUNCE_MS = 500;

function watchMode() {
  console.log(`[sync-models] Watching ${PI_MODELS_PATH} for changes...`);

  let debounceTimer;

  fs.watch(PI_MODELS_PATH, { persistent: true }, (eventType, filename) => {
    if (eventType !== 'change') return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      console.log(`\n[sync-models] Change detected in ${filename}`);

      try {
        const piProviders = loadPiModels();
        if (Object.keys(piProviders).length === 0) {
          console.log('[sync-models] No models found — skipping');
          return;
        }

        const customConfig = loadCustomConfig();
        const merged = mergeConfigs(customConfig, piProviders);
        writeConfig(merged);

        console.log('[sync-models] Auto-sync: models updated');
      } catch (err) {
        console.error('[sync-models] Auto-sync failed:', err.message);
      }
    }, WATCH_DEBOUNCE_MS);
  });

  process.on('SIGINT', () => {
    console.log('\n[sync-models] Watch stopped.');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[sync-models] Watch stopped.');
    process.exit(0);
  });
}

// CLI routing
const args = process.argv.slice(2);
const isWatch = args.includes('--watch') || args.includes('-w');

if (isWatch) {
  main();
  watchMode();
} else {
  main();
}
```

---

### 2.2 Provider Registry — `reloadProviders()`

**Ficheiro:** `extension/src/service-worker/providers/registry.ts`

#### Novas funções exportadas

```typescript
/**
 * Força o recarregamento de todos os providers a partir das fontes
 * (storage → custom.json → defaults).
 * Útil quando o sync-models atualiza o custom.json em runtime.
 */
export async function reloadProviders(): Promise<ProviderDefinition[]> {
  return loadProviders();
}

/**
 * Verifica se o custom.json foi modificado desde um timestamp.
 * Usa o header Last-Modified do fetch com cache-busting.
 */
export async function hasNewModelsSince(timestamp: number): Promise<boolean> {
  try {
    const url = chrome.runtime.getURL('config/models.custom.json');
    const resp = await fetch(url, { cache: 'no-cache' });
    if (!resp.ok) return false;
    
    const lastModified = resp.headers.get('Last-Modified');
    if (lastModified) {
      return new Date(lastModified).getTime() > timestamp;
    }
    
    // Fallback: comparar número de modelos
    const data = await resp.clone().json();
    const modelCount = Object.values(data.providers || {}).reduce(
      (sum: number, p: any) => sum + (p.models?.length || 0), 0
    );
    
    const stored = await chrome.storage.local.get('ba-model-count');
    const prevCount = stored['ba-model-count'] || 0;
    
    if (modelCount !== prevCount) {
      await chrome.storage.local.set({ 'ba-model-count': modelCount });
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}
```

#### Modificações no `loadProviders()` existente

Adicionar parâmetro opcional `forceRefresh`:

```typescript
export async function loadProviders(forceRefresh = false): Promise<ProviderDefinition[]> {
  try {
    // Se forceRefresh, limpar cache de fetch
    if (forceRefresh) {
      // O fetch com 'no-cache' já trata disso
    }
    // ... resto igual ...
  }
}
```

---

### 2.3 Service Worker — Startup Sync Check

**Ficheiro:** `extension/src/service-worker/index.ts`

#### `chrome.runtime.onStartup` handler

Adicionar verificação de sync pendente:

```typescript
chrome.runtime.onStartup.addListener(async () => {
  console.log('[SW] Extension started');
  
  // Existing startup logic...
  await cleanupOrphanedAlarms();
  await notifyIndicatorOnStartup();
  
  // Pi model tracker: check if sync is pending
  await markPendingSyncIfNeeded();
});

async function markPendingSyncIfNeeded() {
  try {
    const result = await chrome.storage.local.get('ba-last-sync');
    const lastSync = result['ba-last-sync'] || 0;
    
    const url = chrome.runtime.getURL('config/models.custom.json');
    const resp = await fetch(url, { cache: 'no-cache' });
    const lastModified = resp.headers.get('Last-Modified');
    
    if (lastModified && new Date(lastModified).getTime() > lastSync) {
      await chrome.storage.local.set({ 'ba-pending-sync': true });
      console.log('[SW] New models detected since last sync');
    }
  } catch {
    // Silently ignore — sync check is best-effort
  }
}
```

#### Message handler para `models:reload`

Adicionar ao router de mensagens:

```typescript
case 'models:reload':
  try {
    const { reloadProviders } = await import('./providers/registry');
    const providers = await reloadProviders();
    await chrome.storage.local.set({ 'ba-last-sync': Date.now() });
    await chrome.storage.local.remove('ba-pending-sync');
    sendResponse({ success: true, count: providers.length });
  } catch (err: any) {
    sendResponse({ success: false, error: err.message });
  }
  break;

case 'models:check':
  try {
    const result = await chrome.storage.local.get([
      'ba-last-sync', 'ba-pending-sync', 'ba-model-count'
    ]);
    sendResponse(result);
  } catch {
    sendResponse({});
  }
  break;
```

---

### 2.4 Side Panel — Notificação de Novos Modelos

**Ficheiro:** `extension/src/side-panel/ChatContext.tsx`

#### Estado

```typescript
interface ChatContextValue {
  // ... existing state ...
  hasNewModels: boolean;
  checkForNewModels: () => Promise<void>;
  reloadModels: () => Promise<void>;
}
```

#### Lógica

```typescript
const [hasNewModels, setHasNewModels] = useState(false);

const checkForNewModels = useCallback(async () => {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'models:check' });
    if (resp?.['ba-pending-sync']) {
      setHasNewModels(true);
      return;
    }
    
    // Also check via Last-Modified
    const result = await chrome.storage.local.get('ba-last-sync');
    const lastSync = result['ba-last-sync'] || 0;
    
    const url = chrome.runtime.getURL('config/models.custom.json');
    const fetchResp = await fetch(url, { cache: 'no-cache' });
    const lastMod = fetchResp.headers.get('Last-Modified');
    
    if (lastMod && new Date(lastMod).getTime() > lastSync) {
      setHasNewModels(true);
    }
  } catch {
    setHasNewModels(false);
  }
}, []);

const reloadModels = useCallback(async () => {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'models:reload' });
    if (resp?.success) {
      setHasNewModels(false);
      // Optionally show toast/notification
    }
  } catch {}
}, []);

// Check on mount
useEffect(() => {
  checkForNewModels();
}, [checkForNewModels]);

// Periodic check every 5 minutes when visible
useEffect(() => {
  const interval = setInterval(checkForNewModels, 5 * 60 * 1000);
  return () => clearInterval(interval);
}, [checkForNewModels]);
```

**Ficheiro:** `extension/src/side-panel/components/Header.tsx`

#### Badge no seletor de modelos

```tsx
{/* Model selector area */}
<div style={{ position: 'relative' }}>
  <button onClick={...} style={{ /* existing style */ }}>
    {providerName} · {modelName}
    {hasNewModels && (
      <span style={{
        position: 'absolute',
        top: -4,
        right: -4,
        background: '#D97757',
        color: 'white',
        fontSize: 9,
        padding: '1px 5px',
        borderRadius: 8,
        fontWeight: 600,
      }}>
        New
      </span>
    )}
  </button>
</div>
```

---

## 3. Mensagens

| Tipo | Direção | Payload | Resposta |
|------|---------|---------|----------|
| `models:reload` | Side Panel → SW | — | `{ success, count }` ou `{ success: false, error }` |
| `models:check` | Side Panel → SW | — | `{ ba-last-sync, ba-pending-sync, ba-model-count }` |

---

## 4. Chrome Storage Keys

| Key | Tipo | Descrição |
|-----|------|-----------|
| `ba-last-sync` | `number` | Timestamp do último sync bem-sucedido (epoch ms) |
| `ba-pending-sync` | `boolean` | `true` se há novos modelos desde o último sync |
| `ba-model-count` | `number` | Número total de modelos no último sync (fallback) |

---

## 5. Flags CLI

```
node scripts/sync-models.js          # one-shot sync (comportamento atual)
node scripts/sync-models.js --watch   # one-shot + watch mode
node scripts/sync-models.js -w        # shorthand
```

---

## 6. i18n Keys

```json
{
  "models_synced": "Models synced from pi coding agent",
  "models_new_available": "New models available — click to reload",
  "models_reload": "Reload models",
  "models_reloaded": "Models reloaded successfully ({count} providers)",
  "models_sync_pending": "Models sync pending — run sync-models --watch",
  "models_last_sync": "Last synced: {time}",
  "models_watch_active": "Watching pi models for changes...",
  "models_watch_update": "Auto-sync: models updated",
  "models_new_badge": "New"
}
```
