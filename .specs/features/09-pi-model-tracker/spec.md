# Feature: Pi Model Tracker

**Feature ID:** `pi-model-tracker`
**Prioridade:** Após file-tools

*Rastreio automático do ficheiro `~/.pi/agent/models.json` e sincronização com a extensão.*

---

## Descrição

Atualmente, o `scripts/sync-models.js` precisa de ser executado manualmente (ou no build) para sincronizar os modelos do pi coding agent (`~/.pi/agent/models.json`) com a extensão (`extension/config/models.custom.json`). Isto é um passo extra que o utilizador pode esquecer, resultando em modelos desatualizados na extensão.

Esta feature adiciona **rastreio automático** do ficheiro `~/.pi/agent/models.json`, detetando alterações e sincronizando-as em tempo real com a extensão — sem intervenção manual.

---

## User Stories

### P1: Watch Mode para sync-models.js ⭐ MVP

**Como** utilizador do BrowserAgent + pi coding agent,
**Quero** que, quando adiciono um novo modelo/provider no pi (`~/.pi/agent/models.json`), a extensão seja automaticamente atualizada
**Para** não ter de executar `node scripts/sync-models.js` manualmente.

**Critérios de Aceitação:**

1. WHEN executo `node scripts/sync-models.js --watch` THEN o script SHALL monitorizar `~/.pi/agent/models.json` com `fs.watch`
2. WHEN o ficheiro é modificado THEN o script SHALL re-executar o sync automáticamente
3. WHEN o sync é bem-sucedido THEN o script SHALL log "Auto-sync: models updated"
4. WHEN ocorre um erro de leitura THEN o script SHALL log o erro e continuar a monitorizar
5. WHEN o utilizador faz Ctrl+C THEN o script SHALL parar graciosamente

### P2: Notificação na Extensão

**Como** utilizador,
**Quero** ser notificado na UI da extensão quando novos modelos são sincronizados
**Para** saber que posso selecionar novos modelos no seletor do header.

**Critérios de Aceitação:**

1. WHEN o sync é executado com sucesso THEN SHALL guardar um timestamp `ba-last-sync` em `chrome.storage.local`
2. WHEN a extensão abre e o timestamp é mais recente que o último visto THEN SHALL mostrar uma badge/notificação "New models available"
3. WHEN o utilizador clica na notificação THEN SHALL desaparecer

### P3: Sincronização ao Iniciar a Extensão

**Como** utilizador,
**Quero** que a extensão verifique se o pi models.json foi alterado desde o último sync ao iniciar
**Para** garantir que os modelos estão sempre atualizados mesmo sem o watch mode.

**Critérios de Aceitação:**

1. WHEN o service worker inicia (`chrome.runtime.onStartup`) THEN SHALL verificar o timestamp de `~/.pi/agent/models.json` (via sync ou flag em storage)
2. WHEN o timestamp é mais recente que o último sync THEN SHALL marcar `ba-pending-sync: true` em storage
3. WHEN o side panel abre e `ba-pending-sync` é true THEN SHALL mostrar notificação "Sync pending — run sync-models"

### P4: Provider Registry — Recarregar Modelos

**Como** a extensão,
**Quero** que o registry de providers possa recarregar modelos em runtime sem reiniciar a extensão
**Para** que novos modelos fiquem imediatamente disponíveis no seletor.

**Critérios de Aceitação:**

1. WHEN `registry.reloadProviders()` é chamado THEN SHALL re-ler `config/models.custom.json`
2. WHEN novos modelos são carregados THEN SHALL atualizar o Map interno de providers
3. WHEN o utilizador abre o seletor de modelos THEN SHALL ver a lista atualizada

---

## Design

### Arquitetura

```
┌─────────────────────┐     fs.watch     ┌──────────────────────┐
│  ~/.pi/agent/       │ ──────────────►  │  sync-models.js      │
│  models.json        │                  │  --watch mode        │
└─────────────────────┘                  └──────────┬───────────┘
                                                    │
                                                    ▼
                                          ┌──────────────────────┐
                                          │  extension/config/    │
                                          │  models.custom.json   │
                                          └──────────┬───────────┘
                                                    │
                                          (chrome.runtime.sendMessage)
                                                    │
                                                    ▼
                                          ┌──────────────────────┐
                                          │  Service Worker       │
                                          │  providers/registry   │
                                          │  .reloadProviders()   │
                                          └──────────┬───────────┘
                                                     │
                                          (notify side panel)
                                                     │
                                                     ▼
                                          ┌──────────────────────┐
                                          │  Side Panel UI        │
                                          │  (badge/notification) │
                                          └──────────────────────┘
```

### Componentes

#### 1. `scripts/sync-models.js` — Modo Watch

Adicionar flag `--watch`:

```javascript
// Novas funções a adicionar ao sync-models.js

function watchMode() {
  console.log('[sync-models] Watching', PI_MODELS_PATH, 'for changes...');
  
  let debounceTimer;
  
  fs.watch(PI_MODELS_PATH, { persistent: true }, (eventType, filename) => {
    if (eventType !== 'change') return;
    
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      console.log('\n[sync-models] Change detected in', filename);
      
      try {
        const piProviders = loadPiModels();
        if (Object.keys(piProviders).length === 0) {
          console.log('[sync-models] No models found in pi config — skipping');
          return;
        }
        
        const customConfig = loadCustomConfig();
        const merged = mergeConfigs(customConfig, piProviders);
        writeConfig(merged);
        
        console.log('[sync-models] Auto-sync: models updated');
        
        // Optional: notify extension via chrome.runtime (via websocket/Native Messaging)
        // For v1, just log. User runs --watch in terminal alongside Chrome.
      } catch (err) {
        console.error('[sync-models] Auto-sync failed:', err.message);
      }
    }, 500); // debounce 500ms
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[sync-models] Watch stopped.');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n[sync-models] Watch stopped.');
    process.exit(0);
  });
}

// CLI argument parsing
const args = process.argv.slice(2);
if (args.includes('--watch')) {
  main(); // initial sync
  watchMode(); // then watch
} else {
  main(); // one-shot sync (existing behavior)
}
```

#### 2. Service Worker — `reloadProviders()` (em `registry.ts`)

```typescript
/**
 * Reload provider definitions from config files and storage.
 * Used by the pi model tracker to pick up new models without restart.
 */
export async function reloadProviders(): Promise<ProviderDefinition[]> {
  // Clear any cached fetch responses
  // Re-run the same logic as loadProviders but force re-fetch
  return loadProviders();
}

// Also export a function to check if new models are available
export async function hasNewModelsSince(timestamp: number): Promise<boolean> {
  try {
    const url = chrome.runtime.getURL('config/models.custom.json');
    const resp = await fetch(url, { cache: 'no-cache' });
    if (!resp.ok) return false;
    const data = await resp.json();
    // Check file's Last-Modified or compare model count/hash
    const lastModified = resp.headers.get('Last-Modified');
    if (lastModified) {
      return new Date(lastModified).getTime() > timestamp;
    }
    return false;
  } catch {
    return false;
  }
}
```

#### 3. Side Panel — Notificação de Novos Modelos

Adicionar ao `ChatContext.tsx` ou `Header.tsx`:

```typescript
// State
const [hasNewModels, setHasNewModels] = useState(false);
const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number>(0);

// On mount, check for new models
useEffect(() => {
  chrome.storage.local.get('ba-last-sync').then((result) => {
    const ts = result['ba-last-sync'] || 0;
    setLastSyncTimestamp(ts);
    
    // Check if custom config has been modified since last sync
    checkForNewModels(ts).then(setHasNewModels);
  });
}, []);

async function checkForNewModels(since: number): Promise<boolean> {
  // Option 1: Fetch with cache-bust and check Last-Modified
  try {
    const url = chrome.runtime.getURL('config/models.custom.json');
    const resp = await fetch(url, { cache: 'no-cache' });
    const lastMod = resp.headers.get('Last-Modified');
    if (lastMod) {
      return new Date(lastMod).getTime() > since;
    }
  } catch {}
  return false;
}
```

No header, mostrar badge laranja com "New" quando `hasNewModels` é true.

#### 4. Service Worker — Sincronização ao Iniciar

Em `index.ts`, no listener de `chrome.runtime.onStartup`:

```typescript
chrome.runtime.onStartup.addListener(async () => {
  // ... existing startup logic ...
  
  // Check if sync is pending
  await markPendingSyncIfNeeded();
});

async function markPendingSyncIfNeeded() {
  const result = await chrome.storage.local.get('ba-last-sync');
  const lastSync = result['ba-last-sync'] || 0;
  
  // We can't read ~/.pi/agent/models.json directly from the extension
  // So we use a heuristic: if the custom config was updated by sync-models
  // after lastSync, there are pending changes
  try {
    const url = chrome.runtime.getURL('config/models.custom.json');
    const resp = await fetch(url, { cache: 'no-cache' });
    const lastModified = resp.headers.get('Last-Modified');
    
    if (lastModified && new Date(lastModified).getTime() > lastSync) {
      await chrome.storage.local.set({ 'ba-pending-sync': true });
    }
  } catch {
    // ignore
  }
}
```

---

## Ficheiros

| Ficheiro | Ação | Descrição |
|----------|------|-----------|
| `scripts/sync-models.js` | Modificar | Adicionar modo `--watch` com `fs.watch` |
| `extension/src/service-worker/providers/registry.ts` | Modificar | Adicionar `reloadProviders()`, `hasNewModelsSince()` |
| `extension/src/service-worker/index.ts` | Modificar | `onStartup` — marcar `ba-pending-sync` |
| `extension/src/side-panel/ChatContext.tsx` | Modificar | Estado `hasNewModels`, verificação periódica |
| `extension/src/side-panel/components/Header.tsx` | Modificar | Badge "New models" no seletor de modelos |
| `extension/_locales/*/messages.json` | Modificar | Novas chaves i18n |
| `extension/config/models.custom.json` | — | Ficheiro de saída do sync (já existe) |

---

## Fora de Escopo (v1)

- **Native Messaging Host** para watch permanente sem terminal — complexidade alta para o benefício
- **WebSocket bridge** entre sync-models e extensão — o watch mode com terminal é suficiente para v1
- **Auto-instalação de modelos** — o registry apenas recarrega; o utilizador precisa de selecionar manualmente
- **Diff visual de modelos** — mostrar quais modelos foram adicionados/removidos

---

## i18n Keys

```json
{
  "models_synced": "Models synced from pi coding agent",
  "models_new_available": "New models available — click to reload",
  "models_reload": "Reload models",
  "models_reloaded": "Models reloaded successfully",
  "models_sync_pending": "Models sync pending — run sync-models --watch",
  "models_last_sync": "Last synced: {time}",
  "models_watch_active": "Watching pi models for changes...",
  "models_watch_update": "Auto-sync: models updated"
}
```
