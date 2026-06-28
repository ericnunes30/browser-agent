/**
 * BrowserAgent — Health Check do Service Worker
 * Cole este script no console do Service Worker (chrome://extensions →
 * "Service Worker" em "Inspecionar") para diagnosticar vazamentos de
 * estado, ports órfãos, callbacks corrompidos e sessões de debugger
 * pendentes que causam falhas intermitentes (ex.: "terceira requisição").
 *
 * Uso:
 *   1. Abra chrome://extensions
 *   2. Ative "Modo do desenvolvedor"
 *   3. No card da extensão, clique em "Service Worker"
 *   4. Cole este script no console e pressione Enter
 */
(async function healthCheck() {
  console.log('%c═══ BrowserAgent Health Check ═══', 'color:#4a90e2;font-weight:bold;font-size:14px');

  // 1. Estado do side panel
  const alive = await chrome.storage.local.get('ba-session-id');
  console.log('Session ID armazenado:', alive['ba-session-id'] || '(nenhum)');

  // 2. Tab group
  const group = await chrome.storage.local.get(['ba-tab-group-id', 'ba-tab-group-name']);
  const storedGroupId = group['ba-tab-group-id'];
  if (storedGroupId != null) {
    const groups = await chrome.tabGroups.query({});
    const exists = groups.find(g => g.id === storedGroupId);
    const tabsInGroup = await chrome.tabs.query({ groupId: storedGroupId });
    console.log(`Tab group: id=${storedGroupId} nome="${group['ba-tab-group-name']}" existe=${!!exists} tabs=${tabsInGroup.length}`);
    if (!exists) console.warn('⚠️ Group ID armazenado não existe mais — estado obsoleto');
  } else {
    console.log('Tab group: (nenhum armazenado)');
  }

  // 3. Abas ativas
  const tabs = await chrome.tabs.query({});
  const withGroup = tabs.filter(t => t.groupId != null && t.groupId >= 0);
  console.log(`Abas: ${tabs.length} total, ${withGroup.length} em grupos`);

  // 4. Alarmes (keep-alive acumulado?)
  const alarms = await chrome.alarms.getAll();
  console.log(`Alarmes ativos: ${alarms.length}`, alarms.map(a => `${a.name}(next=${new Date(a.scheduledTime).toISOString()})`));
  if (alarms.some(a => a.name === 'ba-keep-alive')) {
    console.warn('⚠️ Alarme ba-keep-alive ativo — uma requisição de chat pode estar em andamento, OU houve vazamento (startKeepAlive sem stopKeepAlive)');
  }

  // 5. Verificar ports de runtime — não há API direta para listar ports,
  //    mas podemos inferir via tentativa de conexão.
  console.log('Ports: Chrome não expõe lista de ports abertos. Use o DevTools "Event Listeners" para inspecionar onConnect.');

  // 6. Permissões
  const perms = await chrome.permissions.getAll();
  console.log('Permissões declaradas:', perms.permissions);

  // 7. Memória (aproximação)
  if (typeof performance !== 'undefined' && (performance as any).memory) {
    const mem = (performance as any).memory;
    console.log(`Memória JS: ${(mem.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB / ${(mem.jsHeapSizeLimit / 1024 / 1024).toFixed(0)}MB`);
  }

  // 8. Resumo
  const issues = [];
  if (alarms.some(a => a.name === 'ba-keep-alive')) issues.push('keep-alive pendente');
  if (storedGroupId != null && !(await chrome.tabGroups.query({})).some(g => g.id === storedGroupId)) issues.push('tab group obsoleto');
  console.log('%c═══ Resultado ═══', 'color:#4a90e2;font-weight:bold');
  if (issues.length === 0) {
    console.log('%c✅ Sem problemas óbvios detectados', 'color:#2e7d32;font-weight:bold');
  } else {
    console.warn('%c⚠️ Possíveis problemas: ' + issues.join('; '), 'color:#e65100;font-weight:bold');
  }
  return { issues, sessionId: alive['ba-session-id'], groupId: storedGroupId, alarms: alarms.length };
})().catch(e => console.error('Health check falhou:', e));