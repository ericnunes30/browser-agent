# STATE — BrowserAgent

## Current Phase

✅ **M7 Completed — Provider Endpoints Configuration**

M7 foi concluído em 2026-06-25. A extensão agora funciona sem native host obrigatório, conectando-se a endpoints OpenAI, Anthropic e Ollama configurados na options page. O native host permanece disponível como fonte explícita e opcional, conforme D13.

Próximo passo: definir e iniciar o próximo marco (candidatos: MCP Bridge, per-session model override, refinos de UI/UX).

## Decisions

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| D01 | Usar React 19 + Vite (como o original) | Evita reengenharia desnecessária; stack testada pela Anthropic | 2026-05-07 |
| D02 | ~~Provider Layer com 2 APIs~~ → **Pi SDK via Native Messaging** ✅ IMPLEMENTED | Provider custom é frágil: reasoning_content, SSE bugs, manutenção de N providers. Pi SDK resolve tudo. | 2026-05-09 |
| D03 | ~~Modelos carregados de JSON~~ → **ModelRegistry do Pi SDK** ✅ IMPLEMENTED | SDK lê `~/.pi/agent/models.json` + `auth.json` automaticamente. Zero config. | 2026-05-09 |
| D04 | MCP apenas placeholder nesta versão | Foco na extensão primeiro, MCP depois | 2026-05-07 |
| D05 | Zero dependências de runtime no content script | Minimiza impacto nas páginas, evita conflitos | 2026-05-07 |
| D-PE-01 | **Adapter Pattern** para provider endpoints (OpenAI/Anthropic/Ollama) com helpers compartilhados por composição, **não Template Method** | Provedores têm protocolos muito diferentes; herança rígida prejudicaria evolução | 2026-06-25 |
| D-PE-02 | **No fallback automático**: endpoints configuráveis são a fonte primária; native host continua como opção explícita, não como fallback automático de conexão | Garante comportamento previsível e evita troca silenciosa de provider | 2026-06-25 |
| D07 | Sem framework de teste formal | Teste manual estruturado (3 níveis) | 2026-05-07 |
| D08 | Spec-Driven Development (4 fases) | Metodologia estruturada | 2026-05-07 |
| D09 | **BrowserAgent mantém**: UI, content scripts, tab groups, permissões, indicadores ✅ IMPLEMENTED | Separação clara: extensão = browser, SDK = agent/provider | 2026-05-09 |
| D10 | **Pi SDK assume**: provider/model discovery, auth, API streaming, tool protocol, session ✅ IMPLEMENTED | SDK já tem suporte a 20+ providers, compat flags, etc. | 2026-05-09 |
| D11 | **Native Messaging Host** como bridge entre SW (Chrome) e Pi SDK (Node.js) ✅ IMPLEMENTED | Única forma de rodar SDK Node.js a partir de extensão MV3 | 2026-05-09 |
| D12 | **Fallback**: Se Native Messaging não disponível, manter API direta como fallback | Garantir funcionamento básico sem host instalado | 2026-05-09 |
| D13 | **Provider Endpoints Configuráveis**: substituir native host obrigatório por endpoints OpenAI/Anthropic/Ollama configurados na options page; native host vira plano B | Viabiliza publicação na Chrome Web Store e uso por não-desenvolvedores | 2026-06-25 |

## Blockers

- Nenhum blocker ativo. M7 concluído; próximo marco ainda a ser definido.

## Learnings

| ID | Learning | Source |
|----|----------|--------|
| L01 | Claude em Chrome usa React 19.2.4 com Vite (não uma framework proprietária) | Engenharia reversa do bundle |
| L02 | A extensão não faz chamadas diretas à API Anthropic; tudo passa pelo service worker | Análise do CSP e código |
| L03 | Árvore de acessibilidade é mais confiável que DOM parsing para encontrar elementos interativos | Análise do accessibility-tree.ts |
| L04 | O bridge websocket (`claudeusercontent.com`) é um fallback ao native messaging | Análise do manifest e service worker |
| L05 | MCP Tab Group é separado dos grupos de side panel (armazenado com chave `mcpTabGroupId`) | Análise do PermissionManager |
| L06 | O options page do original suporta managed storage (políticas enterprise) | Análise do managed_schema.json |
| L07 | Pi SDK (createAgentSession) usa eventos nativos: text_delta, thinking_delta, tool_execution_start/end, agent_end | gateway-pi/.docs/CONSOLIDACAO.md |
| L08 | ModelRegistry.create(authStorage) lê ~/.pi/agent/models.json automaticamente; getAvailable() retorna só modelos com key configurada | Pi SDK docs/sdk.md |
| L09 | AuthStorage gerencia API keys com file-locking, suporta runtime override via setRuntimeApiKey() | Pi SDK docs/sdk.md |
| L10 | `reasoning_content` do DeepSeek é tratado pelo compat do modelo no SDK — não precisa de código custom | models.custom.json: compat.requiresReasoningContentOnAssistantMessages |

## Preferences

- Código autoral (inspirado, não copiado)
- Nomes em inglês no código, documentação em português
- Mensagens console com tags: `[SW]`, `[CS]`, `[SP]`, `[OP]`
- Commits seguindo conventional commits: `feat:`, `fix:`, `docs:`, `chore:`
- Nomes de arquivos: kebab-case
- Preferir `defineTool()` do Pi SDK a implementar tools manualmente

## BSD Execution State































































































## BSD Execution State

Current feature: pi-model-tracker
Current task: T6 ()
Phase: reviewer (attempt 2)

Pipeline:
  ⏳ 📋 planner
  ⏳ 🔍 researcher
  ⏳ ⚒️ executor
  ✅ 👁️ reviewer

Completed tasks: T1, T2, T3, T4, T5

Decisions during execution:
  (none recorded)

Blockers: None
