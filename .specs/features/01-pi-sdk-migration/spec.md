# Pi SDK Migration — Specification

> **Feature:** Pi SDK Migration  
> **Status:** Specify  
> **Date:** 2026-05-09  
> **Priority:** P1 (Core)

---

## Problem Statement

O BrowserAgent atualmente implementa comunicação direta com providers LLM via API calls HTTP + SSE parser customizado. Esta abordagem é frágil:

1. **Bugs provider-específicos**: `reasoning_content` do DeepSeek, formato `tool_calls`, headers de auth variados
2. **Manutenção manual**: Cada novo provider exige config, formato, compat flags
3. **SSE parser customizado**: Sujeito a bugs de parsing, race conditions, phantom tool calls
4. **Sem gestão de sessão**: Histórico é gerenciado manualmente no ChatContext
5. **Sem model registry**: Descoberta de modelos é hardcoded em JSON

O Pi SDK (`@mariozechner/pi-coding-agent`) resolve todos esses problemas com:
- `createAgentSession()` — sessão agente com eventos tipados
- `ModelRegistry` — descoberta automática de providers/modelos
- `AuthStorage` — gestão de chaves API
- `defineTool()` — registro de ferramentas customizadas
- Streaming via eventos nativos (`text_delta`, `tool_execution_start`, etc.)

---

## Goals

### P1: MVP — Native Messaging Bridge ⭐

Substituir as chamadas diretas à API por um **Native Messaging Host** que executa o Pi SDK em Node.js e expõe uma API JSON via stdin/stdout.

**Acceptance Criteria:**

1. WHEN usuário envia mensagem no chat THEN sistema SHALL rotear para Pi SDK via Native Messaging
2. WHEN Pi SDK retorna `text_delta` THEN sistema SHALL exibir no chat em tempo real
3. WHEN Pi SDK executa browser tool THEN sistema SHALL executar no Chrome e retornar resultado
4. WHEN Pi SDK completa resposta THEN sistema SHALL exibir mensagem final no chat
5. WHEN provider retorna `reasoning_content` THEN sistema SHALL exibir corretamente (sem erro)

### P2: Session Persistence

Persistir sessões do Pi SDK entre reinicializações do Service Worker (Chrome MV3).

**Acceptance Criteria:**

1. WHEN SW é terminado e reiniciado THEN sistema SHALL restaurar sessão ativa do Pi SDK
2. WHEN usuário retorna à extensão após SW restart THEN sistema SHALL continuar conversa
3. WHEN sessão é restaurada THEN histórico de mensagens SHALL estar intacto

### P3: Multi-Provider via ModelRegistry

Usar `ModelRegistry` do Pi SDK para descoberta automática de providers, eliminando `models.custom.json`.

**Acceptance Criteria:**

1. WHEN Pi SDK descobre novos modelos THEN sistema SHALL exibi-los no seletor
2. WHEN usuário seleciona provider/modelo THEN sistema SHALL usar credenciais do AuthStorage
3. WHEN provider não tem API key THEN sistema SHALL notificar usuário

### P4: Cleanup — Remover Código Legado

Remover todo o código de providers customizados após validação da migração.

**Acceptance Criteria:**

1. WHEN migração completa THEN `providers/registry.ts` SHALL ser removido
2. WHEN migração completa THEN `providers/types.ts` SHALL ser simplificado para tipos compartilhados apenas
3. WHEN migração completa THEN `streamChat`, `buildRequestBody`, `extractToolCalls` SHALL ser removidos
4. WHEN migração completa THEN `models.custom.json` SHALL ser removido (ou mantido só como fallback)

---

## Out of Scope

- **Modo RPC via CLI `pi --mode rpc`**: Usaremos SDK nativo, não subprocesso
- **Sub-agentes / chains**: Não faz parte do escopo do BrowserAgent
- **Compaction automática**: O Pi SDK faz isso, não precisamos configurar
- **Migração de sessões existentes**: Sessões antigas (formato atual) não serão migradas

---

## Dependencies

- **Node.js 20+** no Native Messaging Host
- **`@mariozechner/pi-coding-agent`** instalado globalmente ou via npm no host
- **Chrome Native Messaging API** (`chrome.runtime.connectNative`)
- **Manifest do Native Messaging Host** instalado no sistema

---

## Risks

| Risk | Mitigation |
|------|------------|
| Native Messaging não disponível em alguns browsers baseados em Chromium | Detectamos fallback e informamos usuário |
| Latência extra (SDK → Native Msg → SW → Content Script) | ~100-200ms aceitável para automação; podemos otimizar com batching |
| Pi SDK é grande (~10MB) | Roda no host, não no SW; tamanho não afeta extensão |
| SW pode morrer durante sessão ativa | Pi SDK com `SessionManager.persistent()` salva estado; restauramos na reconexão |
