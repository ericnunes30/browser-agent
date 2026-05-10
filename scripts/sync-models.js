#!/usr/bin/env node
/**
 * sync-models.js
 * 
 * Syncs models from pi coding agent's models.json into BrowserAgent's config.
 * 
 * Usage:
 *   node scripts/sync-models.js
 * 
 * Reads:
 *   - ~/.pi/agent/models.json (pi coding agent config)
 *   - extension/config/models.custom.json (existing custom config)
 * 
 * Writes:
 *   - extension/config/models.custom.json (merged result)
 * 
 * Merge strategy: pi models override custom models for the same provider.
 * Custom models not in pi are preserved.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const HOME = process.env.HOME || process.env.USERPROFILE || '';
const PI_MODELS_PATH = path.join(HOME, '.pi', 'agent', 'models.json');
const BROWSER_AGENT_DIR = path.join(__dirname, '..', 'extension');
const CUSTOM_CONFIG_PATH = path.join(BROWSER_AGENT_DIR, 'config', 'models.custom.json');
const DEFAULT_CONFIG_PATH = path.join(BROWSER_AGENT_DIR, 'config', 'models.default.json');

// Load pi models.json
function loadPiModels() {
  try {
    const content = fs.readFileSync(PI_MODELS_PATH, 'utf-8');
    const data = JSON.parse(content);
    console.log(`[sync-models] Loaded pi models from ${PI_MODELS_PATH}`);
    return data.providers || {};
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('[sync-models] pi models.json not found — skipping sync');
    } else {
      console.error('[sync-models] Error reading pi models:', err.message);
    }
    return {};
  }
}

// Load custom config (may not exist)
function loadCustomConfig() {
  try {
    const content = fs.readFileSync(CUSTOM_CONFIG_PATH, 'utf-8');
    console.log(`[sync-models] Loaded existing custom config from ${CUSTOM_CONFIG_PATH}`);
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('[sync-models] No existing custom config — creating new');
      return { providers: {} };
    }
    console.error('[sync-models] Error reading custom config:', err.message);
    return { providers: {} };
  }
}

// Load default config for structure reference
function loadDefaultConfig() {
  try {
    const content = fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.warn('[sync-models] Could not load default config:', err.message);
    return null;
  }
}

// Convert pi provider format to BrowserAgent format
function piProviderToBA(providerId, piProvider) {
  const models = (piProvider.models || []).map(m => ({
    id: m.id,
    name: m.name || m.id,
    providerId,
    contextWindow: m.contextWindow || 8192,
    // Keep any additional fields from pi (including compat, input, reasoning, maxTokens, etc.)
    ...Object.fromEntries(
      Object.entries(m).filter(([k]) => !['id', 'name', 'contextWindow'].includes(k))
    )
  }));

  const baseUrl = piProvider.baseUrl || piProvider.apiUrl || '';

  return {
    defaultModel: models[0]?.id || '',
    api: piProvider.api || 'openai-completions',
    baseUrl,
    apiKey: piProvider.apiKey || '',
    authHeader: piProvider.authHeader !== undefined ? piProvider.authHeader : true,
    compat: piProvider.compat || {},
    models
  };
}

// Merge pi models into custom config
function mergeConfigs(customConfig, piProviders) {
  const result = { providers: { ...customConfig.providers } };

  for (const [providerId, piProvider] of Object.entries(piProviders)) {
    if (!piProvider.models || !Array.isArray(piProvider.models) || piProvider.models.length === 0) {
      console.log(`[sync-models] Skipping ${providerId} — no models`);
      continue;
    }

    // Convert pi format to BrowserAgent format
    const baProvider = piProviderToBA(providerId, piProvider);

    // Merge: pi models override, custom models are preserved if not in pi
    const existingProvider = result.providers[providerId] || {};
    const existingModelIds = new Set((existingProvider.models || []).map(m => m.id));

    const mergedModels = [...(existingProvider.models || [])];

    for (const model of baProvider.models) {
      if (existingModelIds.has(model.id)) {
        // Override existing model with pi values
        const idx = mergedModels.findIndex(m => m.id === model.id);
        mergedModels[idx] = model;
        console.log(`[sync-models] Updated ${providerId}/${model.id} from pi`);
      } else {
        // Add new model
        mergedModels.push(model);
        console.log(`[sync-models] Added ${providerId}/${model.id} from pi`);
      }
    }

    result.providers[providerId] = {
      ...existingProvider,
      ...baProvider,
      models: mergedModels
    };
  }

  return result;
}

// Write output
function writeConfig(config) {
  const content = JSON.stringify(config, null, 2);
  fs.writeFileSync(CUSTOM_CONFIG_PATH, content, 'utf-8');
  console.log(`[sync-models] Wrote merged config to ${CUSTOM_CONFIG_PATH}`);
}

// Main
function main(isWatch = false) {
  console.log('=== BrowserAgent Model Sync ===\n');

  // Load sources
  const piProviders = loadPiModels();
  const customConfig = loadCustomConfig();

  if (Object.keys(piProviders).length === 0) {
    if (isWatch) {
      console.log('[sync-models] No pi models to sync yet. Watching for file creation...');
      return;
    } else {
      console.log('\n[sync-models] No pi models to sync. Custom config unchanged.');
      process.exit(0);
    }
  }

  // Merge
  const merged = mergeConfigs(customConfig, piProviders);

  // Write
  writeConfig(merged);

  // Summary
  const totalModels = Object.values(merged.providers).reduce(
    (sum, p) => sum + (p.models?.length || 0), 0
  );
  console.log(`\n[sync-models] Done. Total providers: ${Object.keys(merged.providers).length}, total models: ${totalModels}`);
}

/**
 * Watch mode: monitors pi models.json for changes and auto-syncs.
 */
function watchMode() {
  const WATCH_DEBOUNCE_MS = 500;

  // Watch the parent directory so atomic saves (write-temp+rename) are detected
  const watchDir = path.dirname(PI_MODELS_PATH);
  const watchFile = path.basename(PI_MODELS_PATH);

  console.log(`\n[sync-models] Watching ${PI_MODELS_PATH} for changes...`);
  console.log('[sync-models] Press Ctrl+C to stop.\n');

  let debounceTimer;
  let watcher;

  try {
    watcher = fs.watch(watchDir, { persistent: true }, (eventType, filename) => {
      // Filter by filename — the watcher sees all events in the directory
      if (filename !== watchFile) return;

      // 'change' or 'rename' — both should trigger sync
      // Atomic saves (write-temp+rename) emit 'rename', not 'change'

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log(`[sync-models] Change detected in ${watchFile}`);

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
        } catch (err) {
          console.error('[sync-models] Auto-sync failed:', err.message);
        }
      }, WATCH_DEBOUNCE_MS);
    });
  } catch (err) {
    console.error('[sync-models] Failed to start watcher:', err.message);
    console.error('[sync-models] Watch mode unavailable — falling back to one-time sync.');
    return;
  }

  // Graceful shutdown
  const shutdown = () => {
    if (watcher) {
      watcher.close();
      console.log('\n[sync-models] Watch stopped.');
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// CLI argument parsing
const args = process.argv.slice(2);
const isWatch = args.includes('--watch') || args.includes('-w');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
BrowserAgent Model Sync — syncs pi coding agent models to extension

Usage:
  node scripts/sync-models.js          One-time sync
  node scripts/sync-models.js --watch  One-time sync + watch for changes
  node scripts/sync-models.js --help   Show this help
`);
  process.exit(0);
}

if (isWatch) {
  main(true);
  watchMode();
} else {
  main();
}
