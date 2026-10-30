# Tasks — Pi Model Tracker

**Feature ID:** `pi-model-tracker`

---

## T1 — Watch Mode no sync-models.js

**Ficheiro:** `scripts/sync-models.js`

**O quê:**
1. Adicionar parsing de CLI args (`--watch`, `-w`)
2. Implementar `watchMode()` com `fs.watch` no `PI_MODELS_PATH`
3. Debounce de 500ms para eventos de save
4. Graceful shutdown (SIGINT/SIGTERM)
5. Logging: "Watching...", "Change detected", "Auto-sync: models updated"

**Critérios de aceitação:**
- `node scripts/sync-models.js --watch` → one-shot + watch
- Modificar `~/.pi/agent/models.json` → auto-sync em ≤1s
- Ctrl+C → "Watch stopped." sem erros
- Erro de leitura → log + continua watch

---

## T2 — `reloadProviders()` no Registry

**Ficheiro:** `extension/src/service-worker/providers/registry.ts`

**O quê:**
1. Adicionar `reloadProviders(): Promise<ProviderDefinition[]>` — wrapper que chama `loadProviders()` forçando refresh
2. Adicionar `hasNewModelsSince(timestamp: number): Promise<boolean>`:
   - Fetch `config/models.custom.json` com `cache: 'no-cache'`
   - Verificar header `Last-Modified`
   - Fallback: comparar contagem de modelos
3. Garantir que `loadProviders()` com `forceRefresh=true` ignora qualquer cache

**Critérios de aceitação:**
- `reloadProviders()` retorna lista atualizada de providers
- `hasNewModelsSince(oldTimestamp)` retorna `true` se custom.json foi modificado
- `npx tsc --noEmit` passa

---

## T3 — Startup Sync Check no Service Worker

**Ficheiro:** `extension/src/service-worker/index.ts`

**O quê:**
1. No `chrome.runtime.onStartup`, adicionar `markPendingSyncIfNeeded()`
2. Função lê `ba-last-sync` do storage
3. Fetch `config/models.custom.json` com `cache: 'no-cache'`
4. Compara `Last-Modified` com `ba-last-sync`
5. Se mais recente → `chrome.storage.local.set({ 'ba-pending-sync': true })`
6. Adicionar handlers de mensagem:
   - `models:reload` → chama `reloadProviders()`, atualiza `ba-last-sync`, remove `ba-pending-sync`
   - `models:check` → devolve `{ ba-last-sync, ba-pending-sync, ba-model-count }`

**Critérios de aceitação:**
- Ao iniciar extensão, verifica se custom.json foi atualizado
- `models:reload` recarrega providers e retorna contagem
- `models:check` devolve estado do sync
- `npx tsc --noEmit` passa

---

## T4 — Notificação UI (ChatContext + Header)

**Ficheiros:**
- `extension/src/side-panel/ChatContext.tsx`
- `extension/src/side-panel/components/Header.tsx`

**O quê:**
1. Em `ChatContext.tsx`:
   - Adicionar `hasNewModels: boolean` ao state
   - Adicionar `checkForNewModels()` e `reloadModels()` ao context value
   - `checkForNewModels`: envia `models:check`, verifica `ba-pending-sync`, verifica Last-Modified
   - `reloadModels`: envia `models:reload`, atualiza state
   - `useEffect` no mount com `checkForNewModels()`
   - `setInterval` a cada 5 minutos para re-verificação
2. Em `Header.tsx`:
   - Receber `hasNewModels` e `onReloadModels` como props
   - Mostrar badge "New" no seletor de modelos quando `hasNewModels` é true
   - Ao clicar no badge, chamar `onReloadModels`

**Critérios de aceitação:**
- Badge laranja "New" aparece quando há novos modelos
- Clicar no badge executa reload
- Badge desaparece após reload bem-sucedido
- `npx tsc --noEmit` passa

---

## T5 — i18n

**Ficheiros:**
- `extension/_locales/en/messages.json`
- `extension/_locales/pt_BR/messages.json`

**O quê:**
Adicionar as seguintes chaves a ambos os locales:

**en:**
```json
"models_new_badge": { "message": "New" },
"models_reload": { "message": "Reload models" },
"models_reloaded": { "message": "Models reloaded ($COUNT$ providers)", "placeholders": { "COUNT": { "content": "$1" } } },
"models_sync_pending": { "message": "Models sync pending — run sync-models --watch" }
```

**pt_BR:**
```json
"models_new_badge": { "message": "Novo" },
"models_reload": { "message": "Recarregar modelos" },
"models_reloaded": { "message": "Modelos recarregados ($COUNT$ providers)", "placeholders": { "COUNT": { "content": "$1" } } },
"models_sync_pending": { "message": "Sincronização de modelos pendente — execute sync-models --watch" }
```

**Critérios de aceitação:**
- JSON válido em ambos os ficheiros
- `npm run build` passa

---

## Ordem de Implementação

```
T1 (watch mode) → T2 (registry) → T3 (SW) → T4 (UI) → T5 (i18n)
```

**Dependências:**
- T2 não depende de T1 (podem ser paralelos)
- T3 depende de T2 (reloadProviders)
- T4 depende de T3 (mensagens models:reload/models:check)
- T5 independente (pode ser feito a qualquer momento)
