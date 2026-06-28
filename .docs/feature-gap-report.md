# Feature Gap Report — BrowserAgent vs Claude in Chrome

**Projeto:** BrowserAgent  
**Comparado com:** Claude in Chrome (engenharia reversa)  
**Data:** 2026-06-20  
**Versão do BrowserAgent:** v1.0 (Pi SDK Migration completa)

---

## Resumo Executivo

O BrowserAgent é um clone bem avançado do Claude in Chrome com diferenças arquiteturais fundamentais: é **model-agnostic** (qualquer LLM via Pi SDK) enquanto o original é coupled com a API da Anthropic. Essa filosofia resulta em omissões deliberadas (não precisa do app desktop, não precisa de OAuth da Anthropic, etc.), mas também revela **gaps reais** que valem a pena implementar.

**Top 5 features mais impactantes para implementar:**

| # | Feature | Impacto | Esforço | Por quê |
|---|---------|---------|---------|---------|
| 1 | **Comandos `/` no chat** | Alto | Pequeno | UX imediata, o placeholder já existe mas não funciona |
| 2 | **Task Manager UI completa** | Alto | Pequeno | O TaskManager existe mas a UI parece incompleta |
| 3 | **UI de permissões por domínio** | Alto | Médio | Sistema existe, falta a UI de gerenciamento |
| 4 | **Popup Window** | Médio | Médio | Modo alternativo útil para usuários que não querem side panel |
| 5 | **Visualização de GIFs** | Médio | Médio | Workflow recording precisa de playback |

---

## Metodologia

- Leitura completa de 8 arquivos de engenharia reversa do Claude in Chrome
- Leitura do ROADMAP.md do BrowserAgent
- Análise do código fonte (`extension/src/`)
- Comparação feature-a-feature
- Classificação por tipo, esforço e prioridade

---

## Parte 1: Features que o BrowserAgent JÁ TEM

Estas funcionalidades estão **implementadas e funcionando**:

| Feature | Status no BrowserAgent | Detalhe |
|---------|----------------------|---------|
| Chat side panel com React | ✅ | `side-panel/App.tsx` completo |
| Seleção de modelo | ✅ | Model selector com dropdown providers/modelos |
| Streaming de resposta | ✅ | Via Port + NativeBridge streaming callbacks |
| Suporte a imagens (data URL) | ✅ | `images[]` no ToolResult, passados ao prompt |
| Ferramentas de browser | ✅ | 17 tools: computer, snapshot, navigate, javascript_tool, file_upload, get_page_text, read_console, read_network, resize_window, tabs_context, tabs_create, web_search, web_fetch, download, read_file, create_file, edit_file |
| browser_batch | ✅ | Execução sequencial de múltiplas ações em uma chamada |
| Permissões por domínio | ✅ | allowlist, denylist, sessionAllow, PermissionManager |
| Permissão "Allow Once" | ✅ | `sessionAllow` no PermissionManager |
| Modo skip (skip_all_permission_checks) | ✅ | Implementado |
| Cursor fantasma | ✅ | `agent-indicator.ts` com transição 180ms cubic-bezier |
| Click ripple | ✅ | Animação CSS `claude-ripple` |
| Glow border | ✅ | Pulsante laranja na página |
| Action labels | ✅ | `indicator:action` mostra texto no topo da página |
| Drag paths | ✅ | Setas SVG vermelhas tracejadas |
| Static indicator | ✅ | Bolinha laranja + banner inferior com botões |
| Shield indicator | ✅ | Ícone de escudo quando domínio é restrito |
| Tab groups | ✅ | `tab-group.ts` com create, adopt orphan, close, recreate |
| Tarefas agendadas | ✅ | `scheduled-tasks.ts` com daily/weekly/monthly/once |
| Histórico de conversa | ✅ | `chat-stream.ts` + `ChatContext.tsx` |
| i18n (en + pt-BR) | ✅ | `_locales/` com messages.json |
| Pi SDK via Native Messaging | ✅ | `native-bridge.ts` com reconnect, exponential backoff, session |
| Estados de erro ricos | ✅ | Retry UI, error states no ChatWindow |
| Auto-scroll inteligente | ✅ | `autoScroll` ref no ChatWindow |
| Permission prompt bottom sheet | ✅ | `PermissionPrompt.tsx` com keyboard shortcuts |
| Tool status no header | ✅ | `Header.tsx` com `toolStatus` prop |
| Offscreen document | ✅ | `offscreen.html` + `offscreen.tsx` (basic) |
| `/` commands menu UI | ✅ | `CommandsMenu.tsx` existe mas comandos não executam |
| Options Page completa | ✅ | Providers, API keys, search config, site permissions |
| Page Settle Timeout | ✅ | `waitForPageLoad` com pre-phase de navigation-started |
| File download com blob cleanup | ✅ | `downloadBlob` com revoke só quando `complete/interrupted` |
| hold_key (segurar tecla) | ⚠️ | Tool existe na definição do Claude mas não no BrowserAgent |

---

## Parte 2: Features FALTANDO — Análise Completa

### Categoria 1: UX e Interface

#### F-01: Comandos `/` Implementados
**Tipo:** UI  
**Esforço:** Pequeno  
**Prioridade:** Alta  
**Status atual:** `CommandsMenu.tsx` existe, `DEFAULT_COMMANDS` definido, mas ações são placeholders `() => {}`.

**Descrição:** O usuário digita `/` no chat e um menu dropdown aparece com comandos rápidos. Hoje o menu renderiza mas não executa nada.

**Implementação:**
```typescript
// Em ChatInput.tsx, quando filter.startsWith('/'):
// 1. Filtrar DEFAULT_COMMANDS por query
// 2. Ao selecionar, executar a ação:
//    - /clear → ChatContext.clear()
//    - /screenshot → toolExecutor('computer', {action:'screenshot'})
//    - /help → enviar prompt de sistema "/help"
//    - /settings → chrome.runtime.openOptionsPage()
//    - /tabs → tabs_context tool
//    - /status → enviar mensagem interna que retorna status no chat
```

**Por quê é importante:** É uma das interações mais básicas do Claude in Chrome. O usuário espera que funcione.

---

#### F-02: Task Manager UI Completa
**Tipo:** UI  
**Esforço:** Pequeno  
**Prioridade:** Alta  
**Status atual:** `TaskManager.tsx` existe mas não é claro o quanto está funcional.

**Descrição:** Interface para criar, editar, remover e visualizar tarefas agendadas. A infraestrutura (`scheduled-tasks.ts`) está completa com suporte a daily/weekly/monthly/once.

**Implementação:**
```
1. TaskManager.tsx precisa de:
   - Formulário: nome, comando, tipo (once/daily/weekly/monthly), horário
   - Para weekly: selector de dia da semana
   - Para monthly: selector de dia do mês
   - Lista de tarefas existentes com toggle enable/disable
   - Botão de deletar (com confirmação)
   - Próxima execução de cada tarefa
2. Service Worker: listener chrome.alarms.onAlarm já existe
3. Não é preciso criar infraestrutura nova — só finalizar a UI.
```

---

#### F-03: Popup Window Mode
**Tipo:** UI / Arquitetura  
**Esforço:** Médio  
**Prioridade:** Média  
**Status atual:** `action: "popup"` configurado no manifest mas não implementado.

**Descrição:** Modo de exibição alternativo — uma janela flutuante (500x768) além do side panel. Útil para quem prefere não ocupar o side panel ou quer usar em tela cheia.

**Implementação:**
```
1. Criar `popup.html` + `popup/src/App.tsx` (pode reutilizar ChatContext)
2. Configurar chrome.action no manifest para abrir popup
3. Adicionar opção no Options para escolher modo: "Side Panel" / "Popup" / "Full Screen"
4. Adicionar atalho de teclado para alternar modos
5. Para full screen: chrome.windows.create({ state: 'fullscreen' })
```

**Por quê é importante:** O Claude in Chrome oferece todos os 3 modos. Manter feature parity aumenta familiaridade para usuários vindos do original.

---

#### F-04: Placeholder `hold_key` (Segurar Tecla)
**Tipo:** Ferramenta  
**Esforço:** Pequeno  
**Prioridade:** Média  
**Status atual:** `press_key` existe mas `hold_key` (segurar tecla por duração) não.

**Descrição:** `Input.dispatchKeyEvent` no CDP suporta `type: keyDown` sem `type: keyUp` — isso segura a tecla por um período. Útil para drag-and-drop, select-all, etc.

**Implementação:**
```typescript
// Adicionar em debugger-session.ts:
async holdKey(tabId: number, key: string, durationMs: number): Promise<void> {
  await this.sendCommand(tabId, 'Input.dispatchKeyEvent', {
    type: 'keyDown', key,
  });
  await new Promise(r => setTimeout(r, durationMs));
  await this.sendCommand(tabId, 'Input.dispatchKeyEvent', {
    type: 'keyUp', key,
  });
}

// Adicionar em tools.ts:
case 'hold_key': {
  const { key, duration } = input;
  await debuggerManager.holdKey(tabId, key, duration ?? 500);
  return { type: 'tool_result', content: `Held ${key} for ${duration ?? 500}ms.` };
}
```

---

#### F-05: Página de Gerenciamento de Permissões
**Tipo:** UI / Segurança  
**Esforço:** Médio  
**Prioridade:** Alta  
**Status atual:** Permissões existem no código (`PermissionManager`, `permissions.ts`) e o Options Page mostra uma lista básica de sites. Mas a UI é limitada.

**Descrição:** O Claude in Chrome tem uma UI completa para gerenciar sites allowlisted/denylisted, modes (ask/auto/skip), e permissões persistentes.

**Implementação:**
```
1. Expandir a seção de permissões no Options Page:
   - Tabela de sites com status (Allow/Deny/Ask/Once)
   - Botão de editar/remover por site
   - Seletor de modo global: "Ask before acting" / "Act without asking" / "Skip all"
   - Permissão "Allow for all chats" por domínio
   - Domain transitions: toggle para pausar quando navega entre domínios
2. Mostrar o shield indicator quando em domínio restrito (já implementado)
3. Warning visual para modos de alto risco (já parcialmente implementado)
```

---

#### F-06: Screenshot History / Configuração de Screenshots
**Tipo:** UI  
**Esforço:** Pequeno  
**Prioridade:** Média  
**Status atual:** Não há configuração de screenshots nem histórico visual.

**Descrição:** Strings do Claude: `"Screenshot History"`, `"Number of screenshots kept in conversation context"`, `"Maximum dimension (width or height) for screenshots"`, `"Page Settle Timeout"`.

**Implementação:**
```
1. Adicionar seção "Screenshot" no Options Page:
   - Max screenshots in context (default: 5, limitar a 1-20)
   - Max dimension (width or height) para resize (default: 1280x720)
   - Page settle timeout (ms) para waitForPageLoad
2. Persistir em chrome.storage.local
3. Aplicar config no tool executor
```

---

#### F-07: GIF Viewer / Workflow Playback
**Tipo:** UI  
**Esforço:** Médio  
**Prioridade:** Baixa  
**Status atual:** Offscreen document existe mas não gera GIFs.

**Descrição:** O Claude in Chrome pode gerar GIFs animados do workflow e reproduzi-los em `gif_viewer.html`. O BrowserAgent não tem isso.

**Nota:** Feature de baixa prioridade porque:
1. Workflow recording (F-09) também não existe
2. GIFs são mais uma feature de "socialização" do que de automação
3. O offscreen.html atual é um placeholder simples

**Implementação:**
```
1. Usar gif.js (já mencionado no offscreen) para capturar frames
2. Criar `gif_viewer.html` que exibe o GIF gerado
3. API: POST { type: 'GENERATE_GIF' } → offscreen captura frames → retorna blob URL
4. GIF viewer mostra o playback com controles de play/pause/speed
```

---

### Categoria 2: Integrações e Conectores

#### F-08: Google Workspace API Tools (Docs/Sheets/Slides)
**Tipo:** Integração  
**Esforço:** Grande  
**Prioridade:** Baixa  
**Status atual:** Não implementado.

**Descrição:** O Claude in Chrome expõe tools estruturadas para Google Docs, Sheets, Slides, Gmail e Calendar via Google Workspace API. A string `"Enable structured API tools for Google Workspace"` aparece no i18n.

**Por que NÃO implementar agora:** O BrowserAgent é model-agnostic — essas tools são específicas do ecossistema Anthropic/Google. Adicionar integração Google OAuth sem価値 clara para usuários que usam outros LLMs.

**Quando implementar:** Se houver demanda de usuários que usam Gemini ou modelos com suporte a function calling estruturado para Google Workspace.

---

#### F-09: Workflow Recording (Gravar Ações do Usuário)
**Tipo:** Ferramenta / UI  
**Esforço:** Grande  
**Prioridade:** Média  
**Status atual:** Não implementado.

**Descrição:** O Claude in Chrome pode **gravar workflows** — o usuário demonstra ações e o Claude aprende passos repetíveis. Strings de i18n: `"Start recording"`, `"Go through the steps as if you're teaching a new teammate"`, `"Enable your microphone to narrate"`, `"Voice narration active"`.

**Implementação:**
```
1. Modo de gravação:
   - chrome.tabs.onUpdated listener para capturar navegação
   - chrome.debugger para capturar clicks, types
   - Gerar uma sequência de tool calls reproduzível
2. Voice narration:
   - MediaRecorder API para capturar áudio do microfone
   - Transcrição (requer API — Whisper ou similar)
3. Playback:
   - replay_tool_sequence() no service worker
   - Executar ações em ordem com delays
4. UI:
   - Botão "Start Recording" no Header
   - Indicadores visuais de gravação (pulsante vermelho)
   - Modal de preview antes de confirmar
```

**Por quê é importante:** É uma das features mais diferenciadas do Claude in Chrome — permite que usuários não-técnicos automatizem fluxos repetitivos simplesmente demonstrando.

---

#### F-10: MCP Bridge (Desktop App Connection)
**Tipo:** Arquitetura / Integração  
**Esforço:** Grande  
**Prioridade:** Baixa (para BrowserAgent standalone)  
**Status atual:** ROADMAP.md lista como planejado (MC-01 a MC-04) mas sem implementação ativa.

**Descrição:** O Claude in Chrome age como **servidor MCP** — permite que o Claude Desktop (app nativo) controle o navegador. Protocolo: `chrome.runtime.connectNative` + JSON-RPC 2.0 sobre native messaging.

**Contexto atual:** O BrowserAgent JÁ TEM Native Messaging Host funcionando (`native-host/` + `native-bridge.ts`) mas para o caso de uso **inverso** — o host alimenta o BrowserAgent. O caso de uso MCP (BrowserAgent como servidor) é diferente.

**Implementação (se desejado):**
```
1. Registrar manifest com "nativeMessaging" permission
2. Criar native messaging manifest (com.chromium.browseragent.json)
3. Implementar MessageRouter para tool_request/tool_response
4. Protocolo JSON-RPC 2.0 com methods: notifications/tools/list_changed, etc.
```

**Nota:** Para o BrowserAgent, isso faria sentido se houvesse interesse em permitir que outros agentes (pi coding agent, Claude Code) usassem o navegador como ferramenta. É uma feature de extensibilidade futura.

---

#### F-11: Voice Narration (Microfone)
**Tipo:** Ferramenta  
**Esforço:** Médio  
**Prioridade:** Baixa  
**Status atual:** Associado a F-09 (Workflow Recording) — não existe standalone.

**Descrição:** Gravar áudio do microfone enquanto demonstra um workflow. Strings: `"Claude needs microphone access to hear your voice narration"`, `"Voice narration paused"`.

**Nota:** Requer F-09 primeiro. Além disso, requer transcrição de áudio para texto (API externa ou Whisper local), o que adiciona complexidade de integração.

---

### Categoria 3: Segurança e Privacidade

#### F-12: Enterprise Managed Storage (Org Policies)
**Tipo:** Segurança / Arquitetura  
**Esforço:** Médio  
**Prioridade:** Baixa (a menos que targeting enterprise)  
**Status atual:** Não implementado.

**Descrição:** O Claude in Chrome suporta `managed_schema.json` para policies de organização — bloqueia URLs, força login com UUID de org, filtra campos de senha da árvore de acessibilidade.

**Implementação:**
```
1. managed_storage via chrome.storage.managed (Chrome Enterprise)
2. Adicionar blocked URL patterns ao PermissionManager
3. Filter de password fields: no accessibility-tree.ts, pular inputs[type="password"]
4. blocked.html para domínios bloqueados por policy
5. Force login org UUID: só aceitar sessões de organizações específicas
```

**Por que é baixa prioridade:** Requer Chrome Enterprise / políticas de grupo. Só relevante para deploys corporativos.

---

#### F-13: Prompt Injection Warning
**Tipo:** Segurança  
**Esforço:** Pequeno  
**Prioridade:** Média  
**Status atual:** Não implementado.

**Descrição:** O Claude in Chrome exibe warnings quando detecta sites conhecidos por prompt injection. A string: `"Claude had to pause"` + `"Claude landed on a blocked site and can't complete your request"`.

**Implementação:**
```
1. Manter lista de domínios conhecidos por injeção de prompt
2. Ao detectar domínio na navigation:
   - Pausar execução do agente
   - Mostrar warning no chat + na página (shield indicador)
   - Alertar o usuário sobre riscos
3. Adicionar no PermissionManager: site é "untrusted" mesmo se allowlisted
```

---

#### F-14: Password Field Filtering
**Tipo:** Segurança  
**Esforço:** Pequeno  
**Prioridade:** Alta  
**Status atual:** Árvore de acessibilidade inclui todos os campos.

**Descrição:** Campos de senha (`<input type="password">`) são filtrados da árvore de acessibilidade por padrão. Strings: `"Password field filtering"`.

**Implementação:**
```typescript
// Em accessibility-tree.ts (SNAPSHOT_SCRIPT), adicionar:
if (tag === 'input') {
  const inputType = getInputType(el);
  if (inputType === 'password') {
    // Skip — não incluir em snapshot
    return null;
  }
}
```

**Por quê é importante:** Impedir que o modelo leia/escreva em campos de senha por acidente. Feature de segurança básica que o Claude in Chrome tem.

---

### Categoria 4: Dev Tools e Debug

#### F-15: Debug Settings Panel
**Tipo:** Dev Tools  
**Esforço:** Médio  
**Prioridade:** Baixa (relevante para desenvolvimento)  
**Status atual:** Não implementado.

**Descrição:** O Claude in Chrome tem um painel de debug completo: `"Debug Settings"`, `"Show trace IDs"`, `"Show tool result details"`, `"Show system reminders"`, `"Dev Testing"`, `"Load test conversations"`.

**Implementação:**
```
1. Adicionar painel "Debug" no Options Page (ou como feature flag)
2. Configurações:
   - Show trace IDs (exibir ID da requisição no stream)
   - Show tool result details (blocos expandíveis)
   - Show system reminders (tags de debug no contexto)
   - Tool ID display
   - Page Settle Timeout config
3. Para testing: botão "Load test conversation" que popula histórico com dados de teste
```

---

### Categoria 5: Notificações e Áudio

#### F-16: Notificação Sound (TTS / Áudio)
**Tipo:** UX  
**Esforço:** Pequeno  
**Prioridade:** Média  
**Status atual:** Offscreen document existe mas não toca áudio.

**Descrição:** O Claude in Chrome toca sons de notificação quando a resposta está pronta. Usa Web Audio API via offscreen document. Strings: `"PLAY_NOTIFICATION_SOUND"`, `"OFFSCREEN_PLAY_SOUND"`.

**Implementação:**
```typescript
// Em offscreen.tsx:
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PLAY_NOTIFICATION_SOUND') {
    const audioCtx = new AudioContext();
    // Gerar beep simples com oscillator ou
    // Carregar áudio de um arquivo bundled
    // Tocar e cleanup
  }
});
```

**Nota:** Feature simples mas melhora significativamente UX — o usuário sabe quando a resposta chegou sem olhar constantemente.

---

### Categoria 6: Modos de Exibição

#### F-17: Full Screen Mode
**Tipo:** UI  
**Esforço:** Pequeno  
**Prioridade:** Baixa  
**Status atual:** Não implementado (F-03 menciona como parte de 3-way toggle).

**Descrição:** Modo full screen onde o side panel ocupa toda a tela. Útil para sessões longas de automação.

**Implementação:**
```
1.chrome.windows.create({ state: 'fullscreen' }) quando modo full screen ativado
2. Ao sair:chrome.windows.update(windowId, { state: 'normal' })
3. Adicionar opção no Options + comando /fullscreen
```

---

### Categoria 7: Estrutura de Arquivos / UI

#### F-18: Pairing Page (Conexão Desktop)
**Tipo:** UI / Arquitetura  
**Esforço:** Médio  
**Prioridade:** Baixa  
**Status atual:** `pairing.html` existe mas está vazio.

**Descrição:** Página de conexão com apps desktop. A string: `"{clientLabel} wants to connect"` + `"Chrome extension with connected apps"`.

**Nota:** Para o BrowserAgent, isso seria relevante se F-10 (MCP Bridge) fosse implementado. Sem MCP, a pairing page não faz sentido.

---

## Parte 3: Features que o BrowserAgent NÃO PRECISA

Estas features do Claude in Chrome são **deliberadamente omitidas** no BrowserAgent por design:

| Feature | Razão da Omissão |
|---------|------------------|
| **OAuth Anthropic** | BrowserAgent não usa API da Anthropic diretamente — é model-agnostic |
| **Desktop App Native Messaging (receive)** | BrowserAgent USA o Pi SDK como client, não como servidor |
| **Google OAuth** | Same reason — não faz sentido sem Google Workspace tools (F-08) |
| **Slack/Outlook Connectors** | Specific to Claude's ecosystem integrations |
| **Cowork (beyond browser)** | O BrowserAgent já expõe file tools — não precisa de integração sistema de arquivos nativa |
| **Sessions API (nova experiência)** | Beta feature do Claude in Chrome — arquitetura diferente |
| **Quick mode** | Experimental — sem especificação clara |
| **Bridge WebSocket (wss://bridge.claudeusercontent.com)** | Alternative ao native messaging da Anthropic — irrelevante para Pi SDK |
| **Analytics (Segment, Sentry, Honeycomb, Datadog)** | O BrowserAgent não coleta telemetria por design |
| **Org-specific blocked sites (hardcoded)** | Só faz sentido com managed storage (F-12) |
| **Force login org UUID** | Enterprise feature |
| **Claude Code native messaging** | Conecta Claude Desktop ao navegador — BrowserAgent JÁ faz isso no sentido inverso |

---

## Parte 4: Resumo e Priorização

### Features a Implementar (Ordem Sugerida)

```
PRIORIDADE ALTA (Implementar no próximo ciclo)
──────────────────────────────────────────────
1. F-14: Password Field Filtering         [Segurança — 30 min]
2. F-01: Comandos `/` Implementados        [UX — 2-3h]
3. F-02: Task Manager UI Completa          [UX — 2-3h]
4. F-05: Página de Permissões Completa    [UX — 3-4h]
5. F-06: Screenshot Config + History      [UX — 1-2h]

PRIORIDADE MÉDIA (Próximos ciclos)
──────────────────────────────────────────────
6. F-13: Prompt Injection Warning          [Segurança — 1-2h]
7. F-16: Notification Sound (TTS)          [UX — 1h]
8. F-04: hold_key tool                    [Ferramenta — 30 min]
9. F-03 + F-17: Popup + Fullscreen modes  [UX — 4-6h]

PRIORIDADE BAIXA (Quando necessário)
──────────────────────────────────────────────
10. F-09: Workflow Recording + Playback    [Feature — 2-3 dias]
11. F-07: GIF Viewer                      [UX — 4-6h]
12. F-15: Debug Settings Panel            [Dev Tools — 2-3h]
13. F-10: MCP Bridge (como servidor)      [Arquitetura — 1-2 dias]
14. F-11: Voice Narration                 [Feature — 1 dia]
15. F-12: Enterprise Managed Storage      [Segurança — 2-3h]
```

### Estimativa Total de Esforço

| Categoria | Tempo Estimado |
|-----------|---------------|
| Features P0 (Alta) | ~8-12 horas |
| Features P1 (Média) | ~12-18 horas |
| Features P2 (Baixa) | ~5-7 dias |
| **Total** | **~9-13 dias de desenvolvimento** |

---

## Parte 5: Conclusão

O BrowserAgent está **notavelmente completo** em comparação com o Claude in Chrome original. As principais lacunas identificadas são:

1. **UX incremental** (comandos `/`, Task Manager, permissões UI) — esforço pequeno, impacto alto
2. **Segurança** (password filtering, prompt injection warning) — implementação rápida, valor grande
3. **Workflow recording** — feature mais diferenciada do Claude in Chrome, mas requer investimento significativo

As features de **integração** (Google Workspace, Slack, MCP Bridge como servidor) são deliberadamente omitidas porque não se alinham com a filosofia **model-agnostic** do BrowserAgent.

O BrowserAgent tem uma arquitetura mais simples e limpa que o original exatamente porque removeu essas dependências. O foco deve ser **polir a experiência core** (chat, tools, permissões, indicadores visuais) antes de expandir para integrações.

---

*Relatório gerado via análise de engenharia reversa do Claude in Chrome e inspeção do código fonte do BrowserAgent.*
