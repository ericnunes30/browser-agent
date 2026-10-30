# M7 — Status Final

**Milestone:** Provider Endpoints Configuration  
**Concluído em:** 2026-06-25  
**Restrição aplicada:** sem fallback automático — endpoints configuráveis são a fonte primária; native host continua disponível apenas como fonte explícita e opcional.

---

## O que foi implementado

M7 entrega a capacidade da extensão funcionar sem native host obrigatório, conectando-se diretamente a endpoints OpenAI, Anthropic e Ollama configurados na página de opções.

- **Tipos, storage e obfuscation** (T1–T3): `ProviderType`, `ProviderEndpoint`, `ModelInfo`, helpers de storage e obfuscation reversível de API keys.
- **Adapter Pattern** (T4–T5): interfaces `ProviderAdapter`, `PromptParams`, `StreamCallbacks` e helpers HTTP compartilhados (`parseSSE`, `parseNDJSON`, `buildAuthHeaders`, `normalizeError`).
- **Adapters de provedores** (T6–T9): implementações para OpenAI, Anthropic e Ollama, além da factory `getAdapter(type)`.
- **Provider Manager** (T10–T11): orquestração de adapters, descoberta agregada de modelos e roteamento explícito de prompts. Native host permanece como opção explícita, sem fallback automático.
- **UI da options page** (T12–T14): componentes `ProviderList` e `ProviderForm`, seção de modelo padrão e integração no `App.tsx`.
- **Integração com chat** (T15–T16): `Header.tsx` e `chat-handler.ts` passam a usar o provider ativo via `ProviderManager`.
- **Testes e i18n** (T17–T19): testes unitários dos adapters, manager, obfuscation e stress do stream; strings em `en` e `pt_BR`.

---

## Resultados da verificação final

Comandos executados em `G:/novosApps/browser-agent`:

| Comando | Resultado |
|---------|-----------|
| `npx tsc --noEmit` | ✅ passou (sem erros) |
| `npm run build` | ✅ passou (com avisos pré-existentes: `eval` em `tools.ts` e dynamic import de `bridge-singleton.ts`) |
| `npx vitest run extension/src/service-worker/providers/__tests__/ extension/src/service-worker/provider-manager.test.ts extension/src/service-worker/__tests__/chat-stream-stress.test.ts extension/src/utils/__tests__/obfuscation.test.ts` | ✅ **6 arquivos, 53 testes passaram** |

Os testes específicos do escopo M7 passaram integralmente.

---

## Falhas conhecidas fora do escopo M7

Os seguintes testes já falhavam antes do M7 e não foram alterados neste milestone:

- `extension/src/service-worker/__tests__/auto-recreate.test.ts` — 7 falhas: `tabGroupManager.clearGroup` e `tabGroupManager.recreateAfterRemoval` não existem na implementação atual de `tab-group.ts`.
- `extension/src/service-worker/__tests__/sidepanel-behavior.test.ts` — 3 falhas: persistência de `ba-tab-group-id` e método `init` do `TabGroupManager` não estão implementados conforme os testes esperam.
- `extension/src/service-worker/__tests__/critical-bugs.test.ts` — 5 falhas: contador de reconexão do `NativeBridge`, timeouts em `promptAndWait` e desconexão do `ChatStream`.

**Total:** 15 falhas em 19 testes nesses 3 arquivos.  
Essas falhas estão relacionadas a funcionalidades de tab groups e native bridge, fora do escopo de provider endpoints do M7.

---

## Próximos passos / trabalho restante

1. **Definir próximo marco:** candidatos são MCP Bridge, per-session model override ou refinos de UI/UX.
2. **Corrigir falhas pré-existentes** em `tab-group.ts` e `native-bridge.ts`/critical-bugs, se forem priorizadas.
3. **Testes manuais end-to-end** com cada provider (OpenAI, Anthropic, Ollama) e native host opcional.
4. **Publicação na Chrome Web Store:** empacotar `dist/` e revisar manifesto com as novas permissões de provider endpoints.

---

## Decisões registradas

- D13 mantido: provider endpoints configuráveis substituem native host obrigatório; native host vira plano B explícito.
- D-PE-02 adicionado: sem fallback automático — o usuário deve escolher explicitamente entre endpoints configuráveis ou native host.
