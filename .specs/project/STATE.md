# STATE — BrowserAgent

## Current Phase

🟢 **Specify Complete** — Todos os artefatos criados. Pronto para implementação.

## Decisions

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| D01 | Usar React 19 + Vite (como o original) | Evita reengenharia desnecessária; stack testada pela Anthropic | 2026-05-07 |
| D02 | Provider Layer com 2 APIs: openai-completions + anthropic-messages | Cobre todos os provedores do pi models.json (opencode-go, minimax, xiaomimimo) | 2026-05-07 |
| D03 | Modelos carregados de `config/models.custom.json` + merge com `~/.pi/agent/models.json` | Permite custom manual + auto-pull do pi | 2026-05-07 |
| D04 | MCP apenas placeholder nesta versão | Foco na extensão primeiro, MCP depois | 2026-05-07 |
| D05 | Zero dependências de runtime no content script | Minimiza impacto nas páginas, evita conflitos | 2026-05-07 |
| D06 | Permissões em chrome.storage.local | Persistência nativa; sync entre dispositivos seria via chrome.storage.sync no futuro | 2026-05-07 |
| D07 | Sem framework de teste formal | Teste manual estruturado (3 níveis) + possibilidade de vitest no futuro | 2026-05-07 |
| D08 | Spec-Driven Development (4 fases) | Metodologia estruturada: Specify → Design → Tasks → Implement+Validate | 2026-05-07 |

## Blockers

*Nenhum no momento.*

## Learnings

| ID | Learning | Source |
|----|----------|--------|
| L01 | Claude em Chrome usa React 19.2.4 com Vite (não uma framework proprietária) | Engenharia reversa do bundle |
| L02 | A extensão não faz chamadas diretas à API Anthropic; tudo passa pelo service worker | Análise do CSP e código |
| L03 | Árvore de acessibilidade é mais confiável que DOM parsing para encontrar elementos interativos | Análise do accessibility-tree.ts |
| L04 | O bridge websocket (`claudeusercontent.com`) é um fallback ao native messaging | Análise do manifest e service worker |
| L05 | MCP Tab Group é separado dos grupos de side panel (armazenado com chave `mcpTabGroupId`) | Análise do PermissionManager |
| L06 | O options page do original suporta managed storage (políticas enterprise) | Análise do managed_schema.json |

## Preferences

- Código autoral (inspirado, não copiado)
- Nomes em inglês no código, documentação em português
- Mensagens console com tags: `[SW]`, `[CS]`, `[SP]`, `[OP]`
- Commits seguindo conventional commits: `feat:`, `fix:`, `docs:`, `chore:`
