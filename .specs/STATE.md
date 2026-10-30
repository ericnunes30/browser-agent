# STATE

## Decisions

### AD-001
- **Decision**: UI em React + Vite, espelhando a arquitetura da extensao Claude em Chrome.
- **Reason**: Evita reengenharia; stack ja testada pela Anthropic para este caso de uso.
- **Trade-off**: Acoplamento ao ecossistema Vite/CrxJS para MV3.
- **Scope**: `extension/` (side panel, options, service worker build).
- **Date**: 2026-05-07
- **Status**: active (implementado: React 18 + Vite 6; corrigir docs que citam 19/5)

### AD-002
- **Decision**: MCP entra apenas como placeholder e interfaces nesta versao.
- **Reason**: Foco na extensao primeiro; MCP completo depois.
- **Trade-off**: Integracao com agentes externos adiada.
- **Scope**: `extension/` MCP bridge, `mcp-host/`.
- **Date**: 2026-05-07
- **Status**: active

### AD-003
- **Decision**: Content scripts com zero dependencias de runtime.
- **Reason**: Minimiza impacto nas paginas e evita conflitos com o host.
- **Trade-off**: Sem libs auxiliares no CS; utilidades duplicadas quando necessario.
- **Scope**: `extension/src/content-scripts/`.
- **Date**: 2026-05-07
- **Status**: active

### AD-004
- **Decision**: Sem framework de teste formal; teste manual estruturado em 3 niveis.
- **Reason**: Velocidade no inicio do projeto.
- **Trade-off**: Sem regressao automatica.
- **Scope**: repo.
- **Date**: 2026-05-07
- **Status**: superseded by AD-015

### AD-005
- **Decision**: Desenvolvimento spec-driven em 4 fases (Specify, Design, Tasks, Execute).
- **Reason**: Metodologia estruturada para features multi-componente.
- **Trade-off**: Overhead documental em mudancas pequenas (auto-size mitiga).
- **Scope**: `.specs/`.
- **Date**: 2026-05-07
- **Status**: active

### AD-006
- **Decision**: Provider layer via Pi SDK acessado por Native Messaging Host, em vez de HTTP+SSE custom.
- **Reason**: Parser custom e fragil (reasoning_content, bugs SSE, manutencao por provider); SDK resolve discovery, auth e streaming.
- **Trade-off**: Requer host Node.js instalado; unica ponte possivel do MV3 para Node.
- **Scope**: `native-host/` (removido), `extension/src/service-worker/native-bridge.ts`.
- **Date**: 2026-05-09
- **Status**: superseded by AD-014

### AD-007
- **Decision**: Model discovery via ModelRegistry do Pi SDK (`~/.pi/agent/models.json` + `auth.json`).
- **Reason**: Zero config; lista apenas modelos com key configurada.
- **Trade-off**: Acoplamento ao filesystem do pi agent no caminho native-host.
- **Scope**: caminho native-host (`native-bridge.ts`, `ChatContext`).
- **Date**: 2026-05-09
- **Status**: active (escopo restrito ao caminho native-host apos AD-014)

### AD-008
- **Decision**: Separacao de responsabilidades: extensao = browser (UI, tools, permissoes, indicadores); SDK = provider/agent.
- **Reason**: Fronteira clara; cada lado evolui sem quebrar o outro.
- **Trade-off**: Contrato rigido entre SW e host (protocolo JSONL).
- **Scope**: `extension/` x host Node.
- **Date**: 2026-05-09
- **Status**: active (escopo restrito ao caminho native-host apos AD-014)

### AD-009
- **Decision**: Pi SDK assume provider discovery, auth, streaming, tool protocol e session.
- **Reason**: SDK cobre 20+ providers com compat flags; nao reimplementar.
- **Trade-off**: Lock-in no SDK para esse caminho.
- **Scope**: caminho native-host.
- **Date**: 2026-05-09
- **Status**: active (escopo restrito ao caminho native-host apos AD-014)

### AD-010
- **Decision**: Native Messaging como bridge entre SW (Chrome) e Pi SDK (Node.js).
- **Reason**: Unica forma de rodar SDK Node a partir de extensao MV3.
- **Trade-off**: Instalacao e lifecycle do host fora do controle da extensao.
- **Scope**: `extension/src/service-worker/native-bridge.ts`, `mcp-host/`.
- **Date**: 2026-05-09
- **Status**: active

### AD-011
- **Decision**: Fallback para API direta quando Native Messaging indisponivel.
- **Reason**: Funcionamento basico sem host instalado.
- **Trade-off**: Dois caminhos de codigo para o mesmo prompt.
- **Scope**: `extension/src/service-worker/chat-handler.ts`.
- **Date**: 2026-05-09
- **Status**: superseded by AD-014

### AD-012
- **Decision**: Provider endpoints (OpenAI/Anthropic/Ollama) em Adapter Pattern com helpers por composicao, nao Template Method.
- **Reason**: Protocolos fundamentalmente distintos (endpoints, SSE vs NDJSON, auth); heranca rigida travaria evolucao.
- **Trade-off**: Mais arquivos por provider; factory como ponto unico.
- **Scope**: `extension/src/service-worker/providers/`.
- **Date**: 2026-06-25
- **Status**: active

### AD-013
- **Decision**: Sem fallback automatico entre fontes de modelo; endpoints configuraveis sao a fonte primaria, native host e opcao explicita.
- **Reason**: Comportamento previsivel; evita troca silenciosa de provider.
- **Trade-off**: Usuario precisa escolher/configurar explicitamente.
- **Scope**: `ProviderManager`, `Header.tsx`, `chat-handler.ts`.
- **Date**: 2026-06-25
- **Status**: active

### AD-014
- **Decision**: Extensao funciona sem native host obrigatorio via endpoints OpenAI/Anthropic/Ollama na options page (M7).
- **Reason**: Viabiliza Chrome Web Store e uso por nao-desenvolvedores.
- **Trade-off**: API keys sob responsabilidade do usuario (obfuscation local, sem vault).
- **Scope**: `extension/src/options/`, `extension/src/service-worker/providers/`, i18n.
- **Date**: 2026-06-25
- **Status**: active

### AD-015
- **Decision**: Testes automatizados com vitest para providers e logica de SW.
- **Reason**: Regressao nos adapters e streaming apos M7.
- **Trade-off**: Manter suite verde a cada mudanca de protocolo.
- **Scope**: `extension/src/**/*.test.ts`, `vitest.config.ts`.
- **Date**: 2026-06-25
- **Status**: active

## Handoff

- **Feature**: (nenhuma — higiene de repo)
- **Phase / Task**: Reorg `.specs` — renomeacao 00–10 e reformulacao do STATE
- **Completed**: limpeza da raiz, features renomeadas 00–10, `STATE.md` promovido para `.specs/`, `PROJECT.md`/`ROADMAP.md` arquivados em `.docs/archive/`, STATE reformulado em AD-NNN + Handoff
- **In-progress** (file:line): `.specs/STATE.md:1` — recem reescrito, nao commitado
- **Next step**: Usuario revisar o STATE e decidir o commit
- **Blockers**: pendente — confirmar exclusao de `.bsd/*`, `.docs/archive/{PROJECT,ROADMAP}.md`, `extension/key.pem` do git
- **Uncommitted files**: renames raiz + `.specs` (staged), `.gitignore` (modified), `README.md` (untracked), `.docs/wayfinding-pilot-pendencias.md` (untracked)
- **Branch**: main
