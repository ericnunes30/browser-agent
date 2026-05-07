# PRD — BrowserAgent

> Versão: 1.0  
> Status: Em planejamento  
> Baseado em: Claude em Chrome (Engenharia reversa)

---

## 1. Visão Geral

**BrowserAgent** é uma extensão Chrome que permite um agente de IA controlar o navegador — navegar, clicar, digitar, capturar telas, extrair dados — através de um chat no side panel. Diferente do Claude em Chrome, o BrowserAgent é **model-agnostic**: conecta-se a qualquer LLM configurado pelo usuário.

### 1.1 Objetivo

Oferecer uma extensão de navegador que:
- Entenda páginas web e execute ações no lugar do usuário
- Seja compatível com **qualquer provedor de LLM** (OpenAI, Anthropic, Gemini, Ollama, etc.)
- Sirva como **servidor MCP** no futuro (conexão com agentes de codificação)
- Seja leve e extensível

### 1.2 Público-Alvo

- Desenvolvedores que usam agentes de codificação (pi coding agent)
- Usuários que automatizam tarefas no navegador
- Quem quer um "copiloto de browser" sem ficar preso a um provedor

---

## 2. Funcionalidades

### 2.1 Chat com Modelo (Side Panel)

| ID | Funcionalidade | Prioridade |
|----|---------------|------------|
| CH-01 | Chat no side panel com interface React | P0 |
| CH-02 | Selecionar modelo (dropdown com provedores/modelos) | P0 |
| CH-03 | Histórico de conversa por aba/grupo | P0 |
| CH-04 | Streaming de resposta do modelo | P0 |
| CH-05 | Suporte a texto e screenshots como entrada | P0 |
| CH-06 | Exibição de ferramentas executadas na conversa | P1 |
| CH-07 | Prompt de permissão (ask/allow/deny) inline no chat | P1 |

### 2.2 Ferramentas de Browser (Tool Executor)

| ID | Ferramenta | Descrição | Prioridade |
|----|-----------|-----------|------------|
| TL-01 | `navigate` | Navegar para uma URL | P0 |
| TL-02 | `click` | Clicar em elementos/coordenadas | P0 |
| TL-03 | `type` | Digitar texto em campos | P0 |
| TL-04 | `screenshot` | Capturar screenshot da aba | P0 |
| TL-05 | `scroll` | Rolar a página | P0 |
| TL-06 | `read_page` | Extrair texto/conteúdo da página | P0 |
| TL-07 | `read_page_interactive` | Ler via árvore de acessibilidade | P1 |
| TL-08 | `execute_javascript` | Executar JS na página | P1 |
| TL-09 | `find_element` | Encontrar elemento interativo | P1 |
| TL-10 | `set_form_value` | Definir valor de campo de formulário | P1 |
| TL-11 | `hover` | Passar mouse sobre elemento | P2 |
| TL-12 | `press_key` | Pressionar tecla do teclado | P2 |
| TL-13 | `wait` | Aguardar (com condição opcional) | P1 |
| TL-14 | `read_console` | Ler mensagens do console | P2 |
| TL-15 | `read_network` | Ler requisições de rede | P2 |
| TL-16 | `web_search` | Pesquisar na web | P2 |
| TL-17 | `web_fetch` | Fazer fetch de URL | P2 |
| TL-18 | `download` | Baixar arquivo | P2 |

### 2.3 Sistema de Permissões

| ID | Funcionalidade | Prioridade |
|----|---------------|------------|
| PM-01 | Controle por site: allow/deny/ask | P1 |
| PM-02 | Controle por ação (click, type, read...) | P1 |
| PM-03 | Modos: "ask before acting" / "auto" / "skip all checks" | P1 |
| PM-04 | Permissões one-time (allow once, deny once) | P2 |
| PM-05 | Persistência de permissões no storage | P1 |

### 2.4 Model Providers (Multi-Modelo)

| ID | Funcionalidade | Prioridade |
|----|---------------|------------|
| MP-01 | Load models do `config/models.custom.json` | P0 |
| MP-02 | Auto-pull do `~/.pi/agent/models.json` via script | P0 |
| MP-03 | Provider OpenAI-compat (OpenAI, Ollama, OpenRouter) | P0 |
| MP-04 | Provider Anthropic-compat (Claude API) | P0 |
| MP-05 | Provider Gemini (Google AI) | P2 |
| MP-06 | Interface de configuração (Options Page) | P0 |
| MP-07 | Merge: custom.json + pi models.json | P0 |
| MP-08 | Validação de API Key no Options | P1 |

### 2.5 Content Scripts

| ID | Funcionalidade | Prioridade |
|----|---------------|------------|
| CS-01 | Árvore de acessibilidade (DOM interativo) | P0 |
| CS-02 | Indicador visual do agente (cursor fantasma) | P1 |
| CS-03 | Highlight de elementos interativos | P1 |
| CS-04 | Modo gravação de ações do usuário | P2 |

### 2.6 Options Page

| ID | Funcionalidade | Prioridade |
|----|---------------|------------|
| OP-01 | Configurar provedores/modelos (adicionar/editar/remover) | P0 |
| OP-02 | Importar JSON de modelos | P0 |
| OP-03 | Exportar configuração atual | P1 |
| OP-04 | Re-sync automático com pi/agent/models.json | P0 |
| OP-05 | Configurações gerais (tema, atalhos, idioma) | P2 |
| OP-06 | Ver/gerenciar permissões concedidas | P2 |

### 2.7 MCP Bridge (Futuro)

| ID | Funcionalidade | Prioridade |
|----|---------------|------------|
| MC-01 | Placeholder: interfaces e tipos MCP | P3 |
| MC-02 | Native Messaging host registry | P3 |
| MC-03 | Conexão MCP com agentes de codificação | P3 |
| MC-04 | WebSocket bridge (fallback) | P3 |

---

## 3. Requisitos Não-Funcionais

| ID | Requisito | Métrica |
|----|----------|--------|
| NF-01 | Tempo de resposta do tool executor | < 500ms para ações simples (click, type) |
| NF-02 | Streaming de chat | Início de render em < 1s |
| NF-03 | Memória do service worker | Manter-se abaixo de 30s de lifetime idle |
| NF-04 | Compatibilidade | Chrome 116+ |
| NF-05 | Tamanho do bundle | < 2MB (compactado) |
| NF-06 | Segurança de API keys | Armazenadas apenas em chrome.storage criptografado |
| NF-07 | Acessibilidade do conteúdo | Formato compatível com leitores de tela |

---

## 4. Stack Tecnológica

| Camada | Escolha | Justificativa |
|--------|--------|--------------|
| Manifest | MV3 | Obrigatório para Chrome Web Store |
| UI Framework | React 19 (Vite) | Igual ao Claude em Chrome original |
| Build | Vite 5 | Rápido, MV3-friendly, HMR |
| TS | TypeScript 5.x | Tipagem segura |
| CSS | CSS Modules + Vars | Escopo isolado, tema customizável |
| State | chrome.storage.local | Nativo, persiste entre sessões |
| LLM API | fetch() + SSE | Compatível com OpenAI e Anthropic |
| Content Scripts | Vanilla TS (bundled) | Zero dependências para leveza |

---

## 5. Arquitetura de Alto Nível

```
┌─────────────────────────────────────────────────────────┐
│                    Service Worker                        │
│                                                          │
│  ┌─────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │ Message      │  │ Provider   │  │ Tool Executor,   │  │
│  │ Router       │  │ Layer      │  │ Screenshot,      │  │
│  │              │  │            │  │ Tab-Group,        │  │
│  │ recebe do    │  │ OpenAI,    │  │ Permissions       │  │
│  │ side panel/  │  │ Anthropic, │  │                   │  │
│  │ content      │  │ Gemini...  │  │                   │  │
│  └──────┬───────┘  └─────┬──────┘  └────────┬─────────┘  │
│         │                │                   │            │
└─────────┼────────────────┼───────────────────┼────────────┘
          │                │                   │
     ┌────▼────┐     ┌─────▼─────┐       ┌─────▼──────────┐
     │ Side     │     │ chrome    │       │ Content Scripts │
     │ Panel    │     │ .storage  │       │ - accessibility │
     │ (React)  │     │ .local    │       │ - indicator     │
     └──────────┘     └───────────┘       └────────────────┘
```

### 5.1 Fluxo de Comunicação

```
1. Usuário digita no Side Panel
2. Side Panel envia mensagem → Service Worker
3. Service Worker:
   a. Chama LLM via Provider Layer
   b. Se modelo responde com tool_call:
      - Consulta PermissionManager
      - Se autorizado → ToolExecutor executa no browser
      - Retorna resultado pro modelo
   c. Modelo responde com texto final
4. Service Worker envia resposta → Side Panel renderiza
```

---

## 6. Configuração de Modelos

### 6.1 Merge de Configs

```
config/models.custom.json     ~/.pi/agent/models.json
         │                              │
         └──────────────┬───────────────┘
                 ┌──────▼──────┐
                 │ sync-models │
                 │   .js       │
                 └──────┬──────┘
                 ┌──────▼──────┐
                 │ chrome.     │
                 │ storage     │
                 └─────────────┘
```

### 6.2 Formato do Arquivo

```json
{
  "providers": {
    "nome-do-provider": {
      "baseUrl": "https://api.exemplo.com/v1",
      "api": "openai-completions | anthropic-messages",
      "apiKey": "sk-...",
      "authHeader": true,
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": true
      },
      "models": [
        {
          "id": "model-id",
          "name": "Nome Amigável",
          "reasoning": true,
          "input": ["text", "image"],
          "contextWindow": 200000,
          "maxTokens": 4096
        }
      ]
    }
  }
}
```

---

## 7. Mensagens do Sistema

### 7.1 Side Panel ↔ Service Worker

| Mensagem | Direção | Descrição |
|----------|---------|-----------|
| `chat:send` | SP → SW | Enviar mensagem do usuário |
| `chat:response` | SW → SP | Resposta do modelo (stream) |
| `chat:error` | SW → SP | Erro do modelo |
| `tool:start` | SW → SP | Ferramenta sendo executada |
| `tool:result` | SW → SP | Resultado da ferramenta |
| `models:list` | SP → SW | Solicitar lista de modelos |
| `models:response` | SW → SP | Lista de modelos disponíveis |
| `permissions:prompt` | SW → SP | Solicitar permissão |
| `permissions:response` | SP → SW | Resposta do usuário |
| `sidepanel:open` | SP → SW | Side panel foi aberto |

### 7.2 Content Scripts ↔ Service Worker

| Mensagem | Direção | Descrição |
|----------|---------|-----------|
| `cs:accessibility-tree` | SW → CS | Solicitar árvore de acessibilidade |
| `cs:accessibility-response` | CS → SW | Árvore retornada |
| `cs:highlight` | SW → CS | Destacar elementos |
| `cs:indicator-move` | SW → CS | Mover cursor fantasma |
| `cs:eval` | SW → CS | Executar JS na página |

---

## 8. Plano de Implementação (14 Etapas)

Cada task inclui: entregáveis esperados, critérios de review e métodos de teste.

### T1 — Scaffold

**Entregáveis:**
- `extension/manifest.json` (MV3 completo)
- `vite.config.ts` com plugins MV3
- `tsconfig.json` (base + extensão)
- `package.json` com scripts build/dev/pack
- Estrutura de pastas completa (vazia ou com placeholders)
- `public/icons/` com ícones temporários (círculo colorido 16/32/48/128)
- Build gerando `dist/` com extensão carregável no Chrome

**Critérios de Review:**
| Item | O que verificar |
|------|----------------|
| R1 | `manifest.json` válido (sem erros de schema MV3) |
| R2 | Todos os `.html` públicos existem e referenciam bundles corretos |
| R3 | `npm run build` gera `dist/` sem warnings |
| R4 | Extensão carrega em `chrome://extensions` (dev mode) sem erros |
| R5 | Service worker dummy registrado (loga "loaded" no console) |
| R6 | Side panel abre vazio (sem crash, sem 404) |
| R7 | `npm run dev` inicia HMR e extensão recarrega ao salvar |

**Testes:**
1. `npx @anthropic-ai/claude-code --validate` ou validação manual schema MV3
2. Carregar extensão em `chrome://extensions` → 0 erros no card da extensão
3. Abrir side panel → inspecionar → console sem erros
4. Fechar e reabrir side panel → service worker não crasha
5. Rodar `npm run build && npm run pack` → `.zip` < 1MB

---

### T2 — Service Worker

**Entregáveis:**
- `src/service-worker/index.ts` — entry com listeners de mensagem
- `src/service-worker/messages.ts` — roteador de mensagens (tipado)
- `src/service-worker/tab-group.ts` — TabGroupManager
- Side panel abre/fecha com estado correto
- Comunicação SP ↔ SW funcional (ping/pong)
- Tab group tracking (criação, fechamento, detecção de URL)
- Keep-alive com `chrome.alarms`

**Critérios de Review:**
| Item | O que verificar |
|------|----------------|
| R1 | Service worker registra no console ao instalar/ativar |
| R2 | `sidepanel:open` retorna estado válido (tabId, url, groupId) |
| R3 | SP consegue enviar `ping` e receber `pong` do SW |
| R4 | SW detecta navegação e notifica SP com nova URL |
| R5 | Ao fechar aba, grupo de tabs é limpo |
| R6 | SW não crasha em idle (< 30s) — keep-alive funcional |
| R7 | Tipos de mensagem são estritamente validados (não propaga any) |

**Testes:**
1. Abrir side panel → `chrome://serviceworker-internals` → worker ativo
2. Enviar `{ type: "ping" }` do console do side panel → receber `pong`
3. Navegar entre abas → log de eventos no SW console
4. `chrome.tabs.remove(tabId)` → SW detecta e limpa grupo
5. Aguardar 60s sem atividade → SW não dorme (alarm ativo)
6. Testar mensagens com campos faltando → erro controlado, não crash

---

### T3 — Provider Layer

**Entregáveis:**
- `src/service-worker/providers/index.ts` — factory com dispatch por `api`
- `src/service-worker/providers/models-loader.ts` — carrega de `chrome.storage`
- `src/service-worker/providers/openai.ts` — adapter OpenAI-completions
- `src/service-worker/providers/anthropic.ts` — adapter Anthropic-messages
- Tipos TypeScript para providers, modelos, mensagens de chat
- Provider registrado no SW com health-check

**Critérios de Review:**
| Item | O que verificar |
|------|----------------|
| R1 | `models-loader` lê do storage e retorna array tipado |
| R2 | Factory seleciona provider correto por `api` (openai-completions / anthropic-messages) |
| R3 | Provider OpenAI envia requisição com headers corretos (Authorization, Content-Type) |
| R4 | Provider Anthropic envia requisição com `x-api-key` e `anthropic-version` |
| R5 | Stream SSE é parseado corretamente (chunks → texto parcial) |
| R6 | Erro da API retorna erro estruturado (não crasha SW) |
| R7 | Tool calls da resposta são extraídas e tipadas |
| R8 | Suporte a `compat` flags (reasoningEffort, thinkingFormat, etc.) |

**Testes:**
1. Popular `chrome.storage.local` com config de provider OpenAI-compat
2. Chamar factory com provider → enviar prompt simples → receber texto
3. Verificar headers no `chrome://net-export` ou proxy
4. Desconectar rede → erro retornado como string (não exceção)
5. Simular streaming SSE com chunks manuais → parse correto
6. Enviar prompt que gera tool_call → tool_call extraído corretamente
7. Provider sem API key → erro `missing_api_key`

---

### T4 — Content Scripts

**Entregáveis:**
- `src/content-scripts/accessibility-tree.ts` — árvore de acessibilidade via `document`
- `src/content-scripts/agent-indicator.ts` — cursor fantasma e highlights
- Registro no manifest (`content_scripts.matches`, `run_at: "document_idle"`)
- API de mensagens (CS ↔ SW) definida e tipada
- Fallback para quando acessibilidade não está disponível

**Critérios de Review:**
| Item | O que verificar |
|------|----------------|
| R1 | Content script injetado automaticamente ao carregar página |
| R2 | Árvore de acessibilidade retorna elementos interativos (botões, links, inputs, selects) |
| R3 | Cada elemento tem: role, name, posição (x,y,w,h), ações disponíveis |
| R4 | Cursor fantasma renderiza sem quebrar layout da página |
| R5 | Highlight de elementos usa z-index e pointer-events corretos |
| R6 | CS responde em < 200ms para página típica |
| R7 | Funciona em páginas SPA (React/Angular/Vue) |

**Testes:**
1. Abrir `example.com` → verificar console: content script loaded
2. Enviar `{ type: "cs:accessibility-tree" }` → receber array com > 0 elementos
3. Inspecionar elemento retornado → role, name, rect presentes
4. Enviar highlight em elemento → elemento fica com borda azul visível
5. Navegar em SPA (ex: GitHub) → CS sobrevive sem reinjetar
6. Página sem elementos interativos → array vazio, não erro
7. Shadow DOM → elementos dentro de shadow tree são encontrados

---

### T5 — Tool Executor

**Entregáveis:**
- `src/service-worker/tool-executor.ts` — dispatcher de ferramentas
- `src/service-worker/screenshot.ts` — captura via `chrome.debugger`
- Implementação completa de 6 ferramentas P0: `navigate`, `click`, `type`, `screenshot`, `scroll`, `read_page`
- Schema de cada ferramenta (parâmetros, retorno, erros)
- Integração com PermissionManager (pergunta antes de executar)

**Critérios de Review:**
| Item | O que verificar |
|------|----------------|
| R1 | `navigate` — URL troca, tab atualiza, evento notificado |
| R2 | `click` — elemento clicado, evento `click` disparado no DOM |
| R3 | `type` — texto aparece no campo, evento `input` disparado |
| R4 | `screenshot` — retorna `dataUrl` válido (PNG), visível como imagem |
| R5 | `scroll` — página rola, posição `scrollY` atualiza |
| R6 | `read_page` — retorna texto da página (innerText ou accessibility tree) |
| R7 | Erro em ferramenta retorna mensagem descritiva (não string vazia) |
| R8 | Timeout configurável (default 10s) — ferramenta não trava infinito |

**Testes:**
1. Criar página HTML estática de teste local (botões, inputs, scroll)
2. `navigate` para `about:blank` → verificar URL no SW log
3. `click` em botão que muda texto → verificar texto mudou
4. `type` em input → verificar `.value` do input
5. `screenshot` → abrir `dataUrl` no navegador → imagem da página
6. `scroll` para baixo → verificar `window.scrollY` via CS
7. `read_page` → contém texto visível da página
8. Forçar timeout: `navigate` para URL inexistente → erro após 10s

---

### T6 — Side Panel UI

**Entregáveis:**
- `src/sidepanel/App.tsx` — app React funcional
- `src/sidepanel/components/Chat.tsx` — lista de mensagens com auto-scroll
- `src/sidepanel/components/Message.tsx` — bubble de chat (usuário + modelo)
- `src/sidepanel/components/ModelSelector.tsx` — dropdown de modelos
- `src/sidepanel/components/ToolDisplay.tsx` — tool calls inline
- `src/sidepanel/components/PermissionPrompt.tsx` — modal de permissão
- `src/sidepanel/hooks/useChat.ts` — lógica de chat (envio, stream, tool calls)
- `src/sidepanel/hooks/useModels.ts` — carrega lista de modelos
- CSS com tema dark/light e variáveis custom properties

**Critérios de Review:**
| Item | O que verificar |
|------|----------------|
| R1 | Chat renderiza mensagens do usuário (lado direito) e modelo (lado esquerdo) |
| R2 | Input de texto aceita Enter (enviar) e Shift+Enter (nova linha) |
| R3 | ModelSelector lista provedores → modelos em cascata |
| R4 | Resposta do modelo aparece em streaming (palavra por palavra) |
| R5 | Tool calls aparecem como cards expansíveis (nome + status + resultado) |
| R6 | PermissionPrompt aparece como modal com botões Allow / Deny / Allow Once |
| R7 | Scroll automático para última mensagem (sem pular quando usuário scrollou pra cima) |
| R8 | Modo vazio (sem modelo selecionado) mostra mensagem "Selecione um modelo" |
| R9 | Erro de conexão mostra banner de erro (não tela branca) |
| R10 | CSS responsivo (funciona em 300px-600px de largura) |

**Testes:**
1. Abrir side panel → UI renderiza sem erros de console
2. Selecionar modelo → nome aparece no header
3. Digitar "Olá" e Enter → mensagem aparece, modelo responde
4. Enviar prompt que gera tool_call → card de ferramenta aparece
5. Recusar permissão → tool não executa, modelo informa negação
6. Testar tema dark (prefers-color-scheme: dark) → cores mudam
7. Redimensionar side panel para 300px → layout não quebra
8. Enviar 50 mensagens → scroll funciona, performance ok

---

### T7 — Options Page

**Entregáveis:**
- `src/options/App.tsx` — página de opções React
- `src/options/ModelsConfig.tsx` — CRUD de providers/modelos
- `src/options/General.tsx` — tema, atalhos, idioma
- Import JSON (upload de arquivo ou colar texto)
- Export JSON (download)
- Botão "Sync from pi/agent/models.json"
- Validação visual (erros em campos inválidos)

**Critérios de Review:**
| Item | O que verificar |
|------|----------------|
| R1 | Lista de providers renderiza com modelos aninhados |
| R2 | Adicionar provider → salva em `chrome.storage` → side panel vê novo modelo |
| R3 | Editar API key → campo type=password, botão toggle visibilidade |
| R4 | Importar JSON → faz merge (não sobrescreve sem confirmar) |
| R5 | Exportar → download de `.json` com providers atuais |
| R6 | Remover provider → confirmação antes de deletar |
| R7 | JSON inválido → mensagem de erro no campo, não crash |
| R8 | Botão Sync → tenta ler pi models, mostra status (sucesso/erro) |

**Testes:**
1. Adicionar provider OpenAI → salvar → fechar/abrir options → provider persiste
2. Adicionar provider Anthropic → side panel mostra modelos dos dois
3. Importar arquivo JSON com 3 providers → todos aparecem
4. Importar JSON malformado → erro visível
5. Exportar → abrir JSON → campos batem com config atual
6. Remover provider → side panel perde modelos daquele provider
7. Testar `chrome.storage.sync` vs `local` — config persiste entre dispositivos se sync

---

### T8 — Permissions System

**Entregáveis:**
- `src/service-worker/permissions.ts` — PermissionManager
- Política de permissão por site (allow/deny/ask)
- Política por ação (click, type, read_page, etc.)
- Modos: "ask before acting" (default), "auto" (skip check for allowed), "skip all"
- One-time permissions: allow once, deny once
- Persistência em `chrome.storage` com chave `PERMISSION_STORAGE`
- Integração com ToolExecutor (gate antes de executar ferramenta)

**Critérios de Review:**
| Item | O que verificar |
|------|----------------|
| R1 | Primeira ação em site novo → pergunta permissão |
| R2 | "Allow" → ação executa, site salvo como allowed |
| R3 | "Deny" → ação não executa, site salvo como denied |
| R4 | Segunda ação no mesmo site (allowed) → não pergunta |
| R5 | "Allow Once" → executa só essa ação, pergunta de novo na próxima |
| R6 | Modo "auto" + site allowed → não pergunta nunca |
| R7 | Modo "ask" → sempre pergunta (ignora cache) |
| R8 | Permissões persistem após reiniciar Chrome |
| R9 | Lista de permissões visível no Options |

**Testes:**
1. Abrir side panel → navegar para `example.com` → click → prompt aparece
2. Clicar Allow → click executa → próximo click na mesma página não pergunta
3. Clicar Deny → click não executa → tool retorna "permission_denied"
4. Trocar modo para "auto" → ações executam sem prompt
5. Fechar Chrome → reabrir → permissões ainda salvas
6. Options → lista de permissões mostra todos os sites + status
7. Testar permissão por ação: click allowed, type blocked → cada um respeita

---

### T9 — Indicadores Visuais

**Entregáveis:**
- Cursor fantasma que segue ações do agente (overlay CSS posicionado)
- Highlight de elemento alvo (borda pulsante azul/verde/vermelho)
- Animação de clique (efeito ripple no ponto do click)
- Indicador de digitação (cursor piscando no campo alvo)
- Z-index gerenciado (não sobrepõe modais da página)

**Critérios de Review:**
| Item | O que verificar |
|------|----------------|
| R1 | Ao executar `click`, cursor fantasma aparece na posição alvo |
| R2 | Highlight de elemento aparece antes do click (feedback visual) |
| R3 | Animação de ripple no ponto do click (≥ 200ms, fade out) |
| R4 | Indicador de type: cursor piscando no input alvo |
| R5 | Overlay não bloqueia interação do usuário (pointer-events: none) |
| R6 | Funciona em páginas com z-index alto (ex: modais, dropdowns) |

**Testes:**
1. Executar `click` em botão → cursor se move + ripple + botão destaca
2. Executar `type` em input → cursor pisca no campo
3. Testar em página com modal aberto → overlay aparece acima do modal
4. Clicar manualmente na página enquanto overlay visível → interação funciona
5. Múltiplos cliques rápidos → animações empilham sem lag

---

### T10 — Offscreen Document

**Entregáveis:**
- `src/offscreen/audio.ts` — playback de áudio (TTS)
- `src/offscreen/gif-generator.ts` — gravação de GIF da tela
- `public/offscreen.html` com referência ao bundle
- APIs: `offscreen:play-audio`, `offscreen:stop-audio`, `offscreen:record-gif`

**Critérios de Review:**
| Item | O que verificar |
|------|----------------|
| R1 | Áudio toca sem abrir aba visível |
| R2 | Stop interrompe playback imediatamente |
| R3 | GIF gerado é válido e reproduzível |
| R4 | Offscreen document fecha após uso (não acumula) |

**Testes:**
1. Enviar texto → áudio toca nos alto-falantes
2. Enviar stop durante playback → silêncio
3. Gravar 3s de ações → GIF salvo e reproduz
4. Verificar `chrome://offscreen` → documento fecha após terminar

---

### T11 — Scheduled Tasks

**Entregáveis:**
- `src/service-worker/scheduled-tasks.ts` — gerenciador de tarefas
- Integração com `chrome.alarms` para disparo temporal
- UI no side panel: lista de tarefas, criar/editar/remover
- Persistência em `chrome.storage`
- Tarefas: navegar, preencher formulário, tirar screenshot, web_fetch

**Critérios de Review:**
| Item | O que verificar |
|------|----------------|
| R1 | Tarefa criada aparece na lista com próximo horário de execução |
| R2 | Tarefa dispara no horário correto (± 1 min tolerância) |
| R3 | Tarefa executa ação programada (ex: abrir URL e screenshot) |
| R4 | Tarefa com erro notifica usuário (chrome.notifications) |
| R5 | Editar/remover tarefa atualiza alarm e storage |
| R6 | Alarm persiste após reiniciar Chrome |

**Testes:**
1. Criar tarefa "abrir example.com" para daqui 2 min
2. Aguardar → aba abre sozinha em 2 min
3. Criar tarefa "screenshot" para daqui 1 min → notificação com preview
4. Remover tarefa → alarm cancelado (não dispara)
5. Reiniciar Chrome → tarefas ainda listadas

---

### T12 — MCP Bridge

**Entregáveis:**
- `src/service-worker/mcp/index.ts` — placeholder que loga "MCP not implemented"
- `src/service-worker/mcp/types.ts` — interfaces TypeScript para JSON-RPC 2.0
- `src/service-worker/mcp/registry.ts` — registro de hosts nativos (vazio)
- `src/service-worker/mcp/bridge.ts` — WebSocket placeholder
- Nenhuma funcionalidade real, só tipos e estrutura

**Critérios de Review:**
| Item | O que verificar |
|------|----------------|
| R1 | Interfaces MCP exportadas corretamente (ToolRequest, ToolResponse, etc.) |
| R2 | Placeholder não causa erros no SW |
| R3 | Tipos seguem spec MCP (JSON-RPC 2.0) |
| R4 | Nenhum código de conexão ativo (sem portas abertas, sem WS) |

**Testes:**
1. Importar `mcp/types.ts` em outro módulo → tipos acessíveis
2. Chamar qualquer função MCP → loga "not implemented", não crasha
3. Verificar `chrome://serviceworker-internals` → sem erros de MCP

---

### T13 — i18n

**Entregáveis:**
- `_locales/pt_BR/messages.json` — strings em português
- `_locales/en/messages.json` — strings em inglês (fallback)
- `manifest.json.default_locale: "pt_BR"`
- Componentes React usando `chrome.i18n.getMessage()`
- Placeholders no CSS (via `data-i18n`)

**Critérios de Review:**
| Item | O que verificar |
|------|----------------|
| R1 | Todas as strings visíveis têm entrada em messages.json |
| R2 | Trocar idioma do Chrome → textos mudam (pt ↔ en) |
| R3 | Placeholders com variáveis funcionam (`$1`, `$2`) |
| R4 | Nenhuma string hardcoded em português no código |

**Testes:**
1. Chrome em pt-BR → interface em português
2. Chrome em en-US → interface em inglês
3. Pesquisar código por strings em pt hardcoded → zero ocorrências visíveis
4. `chrome.i18n.getMessage("key_inexistente")` → retorna "" (não crasha)

---

### T14 — sync-models.js

**Entregáveis:**
- `extension/scripts/sync-models.js` — script Node.js standalone
- Lê `~/.pi/agent/models.json`
- Lê `extension/config/models.custom.json`
- Faz merge (custom sobrescreve pi se conflito)
- Escreve em arquivo JSON consumido pelo extension build
- Mensagens de status (sucesso, erro, providers encontrados)

**Critérios de Review:**
| Item | O que verificar |
|------|----------------|
| R1 | Script executa `node extension/scripts/sync-models.js` sem erros |
| R2 | Lê pi models.json corretamente (incluindo provider opencode-go, minimax, xiaomimimo) |
| R3 | Lê custom.json e faz merge (não perde providers) |
| R4 | Output contém todos os providers do merge |
| R5 | Se pi models.json não existe, usa só custom.json (sem crash) |
| R6 | Se custom.json não existe, usa só pi models (sem crash) |
| R7 | Output é JSON válido (parse não falha) |

**Testes:**
1. Rodar script com ambos arquivos existentes → output com providers mesclados
2. Deletar pi models.json → script roda com warning, output = custom.json
3. Deletar custom.json → output = pi models.json
4. JSON inválido em custom.json → script reporta erro e linha
5. `node sync-models.js --output models.merged.json` → arquivo criado
6. Arquivo mergeado é carregado pelo build (T1-T3) sem erros

---

## 9. Métricas de Sucesso

- [ ] Side panel funcional com chat em tempo real
- [ ] Suporte a pelo menos 2 APIs de modelos (OpenAI + Anthropic)
- [ ] 6+ ferramentas de browser implementadas
- [ ] Sistema de permissões funcional
- [ ] Configuração de modelos via arquivo custom + auto-pull
- [ ] Build limpo sem dependências do original
- [ ] Código autoral (inspirado, não copiado)

---

## 10. Riscos

| Risco | Mitigação |
|-------|-----------|
| API keys expostas em storage | chrome.storage é criptografado; documentar boas práticas |
| Service Worker idle timeout | Implementar keep-alive com chrome.alarms |
| Compatibilidade entre APIs de LLM | Abstrair via Provider Layer com adapters |
| Complexidade do tool executor | Começar com 6 ferramentas P0, expandir depois |
| MCP complexidade futura | Interfaces bem definidas desde o início |

---

## 11. Referências

- Documentação de engenharia reversa: `.docs/claude-extension/01-08`
- Plano de implementação: `.docs/claude-extension/09-plano-implementacao.md`
- Chrome Extension MV3: https://developer.chrome.com/docs/extensions/mv3/
- MCP Protocol: https://modelcontextprotocol.io/

---

## 12. Checklist de Review (Geral)

Critérios que se aplicam a **todas as tasks**, independente da funcionalidade específica.

### 12.1 Código

| ID | Critério | Como verificar |
|----|----------|----------------|
| C-01 | TypeScript compila sem erros | `npx tsc --noEmit` |
| C-02 | Nenhum `any` sem justificativa (máx. 3 por arquivo) | `rg ": any" --count` |
| C-03 | Funções exportadas têm JSDoc (pelo menos descrição + @param + @returns) | Revisão manual |
| C-04 | Nomes em inglês (variáveis, funções, arquivos) | Revisão manual |
| C-05 | Imports organizados (built-in → externos → internos → tipos → styles) | ESLint: `import/order` |
| C-06 | Nenhum console.log sem tag (ex: `[SW]`, `[CS]`, `[SP]`) | `rg "console.log" | rg -v "\\["` |
| C-07 | Tratamento de erro em todas as funções async (try/catch ou .catch) | Revisão por arquivo |
| C-08 | Nenhum código morto/comentado (máx. 2 linhas de TODO) | Revisão por arquivo |

### 12.2 Segurança

| ID | Critério | Como verificar |
|----|----------|----------------|
| S-01 | API keys nunca em logs, console nem strings de erro | `rg "sk-" --glob "*.ts" | rg -v models\\.json` |
| S-02 | Conteúdo de páginas nunca vaza para storage sem criptografia | Revisão manual dos writes |
| S-03 | CSP do manifest não tem `unsafe-eval` (exceto se justificado) | Verificar `manifest.json` |
| S-04 | Content scripts não acessam chrome.storage diretamente (só via SW) | `rg "chrome.storage" --glob "content-scripts/*.ts"` |
| S-05 | URLs externas validadas antes de fetch (contra SSRF) | Verificar regex/validação de URL |

### 12.3 Performance

| ID | Critério | Como verificar |
|----|----------|----------------|
| P-01 | Service worker responde em < 100ms para mensagens de controle | DevTools Performance tab |
| P-02 | Content script não causa layout thrashing (> 10 forced reflows/s) | DevTools Performance tab |
| P-03 | Side panel bundle < 300KB (gzip) | `du -h dist/assets/sidepanel*.js` |
| P-04 | Nenhum memory leak (perfis de memória sobem e estabilizam) | DevTools Memory → Heap snapshot |
| P-05 | Event listeners removidos no cleanup (sem dangling listeners) | Revisão de código (addListener ↔ removeListener) |

### 12.4 Documentação

| ID | Critério | Como verificar |
|----|----------|----------------|
| D-01 | README.md atualizado com instruções de build/uso | Leitura do README |
| D-02 | Changelog ou commit messages seguem convenção (ex: `feat:`, `fix:`) | `git log --oneline` |
| D-03 | Tipos e interfaces documentados inline | `rg "interface \\w+" --glob "*.ts" | head -20` |
| D-04 | Decisões de arquitetura registradas em `.docs/decisions/` | Verificar diretório |

---

## 13. Estratégia de Teste

### 13.1 Níveis de Teste

```
     ┌──────────────┐
     │   E2E        │ ← Browser real + modelo real (1x por release)
     │              │
     └──────┬───────┘
     ┌──────▼───────┐
     │   Integração │ ← Extensão carregada + mock de API (a cada task)
     │              │
     └──────┬───────┘
     ┌──────▼───────┐
     │   Unitário   │ ← Funções puras isoladas (contínuo)
     │              │
     └──────────────┘
```

### 13.2 Como Testar na Prática (Sem Framework)

Não vamos adicionar Jest/Vitest pesado. O foco é teste manual estruturado:

#### Nível 1 — Unitário (Funções Puras)

```bash
# Criar um arquivo .test.ts no mesmo diretório do módulo
# Ex: src/service-worker/providers/models-loader.test.ts

// Teste manual via Node:
// npx tsx src/service-worker/providers/models-loader.test.ts
```

**O que testar:**
- Parsing de JSON (válido, inválido, vazio)
- Merge de configs (sem conflito, com conflito, sobrescrita)
- Funções de validação (URL, formato de mensagem, schema de tool call)
- Transformações de dados (formato OpenAI ↔ Anthropic)

#### Nível 2 — Integração (Extensão Carregada + Mock)

```bash
# 1. Carregar extensão em chrome://extensions (dev mode)
# 2. Abrir chrome://serviceworker-internals → inspecionar SW
# 3. Enviar comandos pelo console do SW
# 4. Verificar respostas e comportamento
```

**O que testar:**
- Comunicação SP ↔ SW (enviar mensagens pelo console)
- Provider layer (mock de fetch com JSON fixo)
- Content script (injetar em página local e chamar funções)
- Tool executor (usar `about:blank` ou página HTML estática)

#### Nível 3 — E2E (Cenário Real)

```bash
# 1. Extensão carregada normalmente
# 2. Side panel aberto em site alvo
# 3. Usar modelo real (API key válida)
# 4. Executar tarefa completa:
#    - "Vá para google.com, pesquise 'clima SP', me diga o resultado"
```

**O que testar:**
- Fluxo completo: chat → tool calls → permissão → execução → resposta
- Streaming real do modelo
- Múltiplas abas/grupos simultâneos
- Recuperação de erro (API offline, timeout, permissão negada)

### 13.3 Página de Teste HTML

Criar `extension/tests/test-page.html` com elementos controlados:

```html
<!-- Página estática com elementos conhecidos para teste determinístico -->
<button id="btn-hello">Clique Aqui</button>
<input id="input-name" type="text" placeholder="Digite seu nome">
<div id="output"></div>
<script>
  document.getElementById('btn-hello').onclick = () => {
    document.getElementById('output').textContent = 'Olá ' +
      document.getElementById('input-name').value;
  };
</script>
```

**Usar para:**
- Testar `click` → verificar se output mudou
- Testar `type` + `click` → verificar resultado combinado
- Testar `screenshot` → comparar com baseline visual
- Testar `read_page` → verificar elementos lidos

### 13.4 Verificação por Task

| Task | Nível 1 (Unit) | Nível 2 (Integração) | Nível 3 (E2E) |
|------|---------------|---------------------|---------------|
| T1 | — | ✅ Carregar extensão | ✅ Side panel abre |
| T2 | Validação de mensagens | ✅ Ping/Pong console | ✅ SP ↔ SW live |
| T3 | Parse JSON, factory dispatch | ✅ Mock fetch provider | ✅ Modelo real responde |
| T4 | Tree parse, highlight calc | ✅ Injetar em página local | ✅ CS em site real |
| T5 | Tool schema validation | ✅ Executar em test-page.html | ✅ Ferramentas em site real |
| T6 | — | ✅ UI renderiza sem crash | ✅ Chat com modelo real |
| T7 | Merge logic | ✅ CRUD providers no storage | ✅ Fluxo completo config |
| T8 | Policy evaluation | ✅ Mock permissão + tool | ✅ Prompt → allow → executa |
| T9 | — | ✅ Overlay em test-page.html | ✅ Indicadores em site real |
| T10 | — | ✅ Áudio/GIF no offscreen doc | — |
| T11 | Alarm scheduling | ✅ Criar tarefa, ver alarm | ✅ Tarefa dispara sozinha |
| T12 | — | ✅ Import types sem erro | — |
| T13 | getMessage lookup | ✅ Textos em ambos idiomas | ✅ Chrome em pt+en switch |
| T14 | Merge, parse, file IO | ✅ Rodar script, ver output | ✅ Build com merge dos models |

### 13.5 Automação Futura (Opcional)

Quando o projeto amadurecer, adicionar:
- `vitest` para testes unitários (funções puras)
- `@anthropic-ai/claude-code` ou Puppeteer para E2E no Chrome headless
- GitHub Actions para CI (build + validate manifest + unit tests)
