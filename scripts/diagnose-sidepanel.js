/**
 * Script de Diagnóstico do Side Panel + Tab Group
 * 
 * Como usar:
 * 1. Abra chrome://extensions → encontre "BrowserAgent" → clique em
 *    "Service worker" (link azul) para abrir o DevTools do SW
 * 2. Vá na aba Console
 * 3. Cole TODO o código abaixo e pressione Enter
 * 4. Siga as instruções que aparecem no console
 * 
 * Este script testa o comportamento real da extensão no Chrome.
 */

(async function runDiagnostics() {
  const log = (msg, type = 'info') => {
    const prefix = '[DIAG]';
    if (type === 'error') console.error(prefix, msg);
    else if (type === 'warn') console.warn(prefix, msg);
    else console.log(prefix, msg);
  };

  log('=== Iniciando diagnóstico do Side Panel + Tab Group ===');

  // ─── 1. Verificar APIs ─────────────────────────────────────────
  log('1. Verificando APIs do Chrome...');
  const checks = [
    ['chrome.action', !!chrome.action],
    ['chrome.sidePanel', !!chrome.sidePanel],
    ['chrome.tabs', !!chrome.tabs],
    ['chrome.tabGroups', !!chrome.tabGroups],
    ['chrome.storage.local', !!chrome.storage.local],
  ];
  for (const [name, ok] of checks) {
    log(`   ${name}: ${ok ? '✅' : '❌'}`);
  }
  if (checks.some(([, ok]) => !ok)) {
    log('Algumas APIs estão faltando. Recarregue a extensão.', 'error');
    return;
  }

  // ─── 2. Verificar estado atual ─────────────────────────────────
  log('2. Verificando estado atual...');
  const stored = await chrome.storage.local.get(['ba-tab-group-id', 'ba-tab-group-name']);
  log(`   Storage: groupId=${stored['ba-tab-group-id'] ?? 'null'}, name=${stored['ba-tab-group-name'] ?? 'null'}`);

  const allGroups = await chrome.tabGroups.query({});
  log(`   Grupos existentes no Chrome: ${allGroups.length}`);
  for (const g of allGroups) {
    log(`     - id=${g.id}, title="${g.title ?? '(sem título)'}"`);
  }

  // ─── 3. Abrir side panel manualmente ───────────────────────────
  log('3. Tentando abrir side panel na janela atual...');
  try {
    const currentWindow = await chrome.windows.getLastFocused();
    await chrome.sidePanel.open({ windowId: currentWindow.id });
    log('   ✅ sidePanel.open() chamado com sucesso');
  } catch (err) {
    log(`   ❌ sidePanel.open() falhou: ${err.message}`, 'error');
  }

  // ─── 4. Simular clique no ícone ─────────────────────────────────
  log('4. Simulando clique no ícone da extensão...');
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      log('   ❌ Nenhuma aba ativa encontrada', 'error');
      return;
    }
    log(`   Aba ativa: id=${activeTab.id}, url=${activeTab.url}`);

    // Disparamos o evento action.onClicked manualmente
    // (não é possível disparar o clique real da toolbar, mas podemos
    //  chamar o handler se tivéssemos referência — aqui só logamos)
    log('   ⚠️  Não é possível simular o clique real da toolbar via console.');
    log('   Clique manualmente no ícone da extensão agora e observe os logs.');
  } catch (err) {
    log(`   Erro: ${err.message}`, 'error');
  }

  // ─── 5. Monitorar criação de grupo ─────────────────────────────
  log('5. Aguardando criação de grupo (verifique após clicar no ícone)...');
  setTimeout(async () => {
    const newStored = await chrome.storage.local.get(['ba-tab-group-id']);
    const newGroups = await chrome.tabGroups.query({});
    log(`   Após 2s: storage groupId=${newStored['ba-tab-group-id'] ?? 'null'}, grupos=${newGroups.length}`);
  }, 2000);

  // ─── 6. Verificar listeners registrados ────────────────────────
  log('6. Dica: para ver os listeners do Service Worker, use:');
  log('   chrome.action.onClicked.hasListeners?.()  // não existe na API, mas verifique os logs do SW');

  log('=== Diagnóstico concluído. Clique no ícone da extensão e observe o console. ===');
})();
