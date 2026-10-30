# Funcionalidades Pendentes — BrowserAgent

Lista priorizada de funcionalidades a implementar, inspiradas no Claude in Chrome.

---

## 1. `web_search` + `web_fetch` tools

**O quê:** Adicionar duas ferramentas que o LLM pode usar:
- `web_search` — pesquisa na web via API configurável (SearXNG, Google, Bing, etc.)
- `web_fetch` — busca conteúdo arbitrário de URLs via `fetch()` do service worker

**Porquê:** O Claude in Chrome consegue pesquisar na internet e ler páginas externas. Sem estas tools, o agente só interage com a aba ativa.

**Dependências:** Provider layer (T3), tool executor (T5)

---

## 2. `read_file` / `edit_file` / `create_file` / `download` tools

**O quê:** Ferramentas de sistema de ficheiros:
- `read_file` — ler ficheiros do sistema local (`chrome.fileSystem` ou `FileSystemAccess`)
- `edit_file` — editar ficheiros existentes
- `create_file` — criar novos ficheiros
- `download` — baixar ficheiros via `chrome.downloads.download`

**Porquê:** Claude pode ler, editar e criar ficheiros localmente, e descarregar ficheiros da web.

**Nota:** `chrome.downloads` já está no manifest.json

---

## 3. ❌ Excluído (Reservado — Workflows / Artefactos — postecipado)

---

## 4. Gestão de Abas e Grupos (Tab Groups)

**O quê:** Implementar `TabGroupManager` no service worker para:
- Criar e gerir grupos de abas
- Adotar abas órfãs
- Fechar grupos inteiros
- Multi-tab tasks (pesquisar em vários sites simultaneamente)
- Melhorar as tools `tabs_context` e `tabs_create` com gestão real de grupos

**Porquê:** Claude in Chrome organiza abas em grupos para tarefas multi-página. Sem isto, o agente trabalha sempre na mesma aba.

**Dependências:** T2 (service worker base)

---

## 5. Site-level Permissions

**O quê:** Expandir o sistema de permissões atual para incluir:
- **Approved sites** — sites onde o agente pode agir livremente
- **Always allow** — permissão persistente para um domínio
- **Allow once** — permitir apenas uma ação
- **Allow for all chats** — persistente entre conversas
- **Domain transitions** — pausa quando navega entre domínios
- **Shield system** — `lightshield.svg` / `darkshield.svg` no DOM da página
- **Permission prompt UI** — modal no side panel a pedir confirmação

**Estado atual:** Só temos `PermissionMode` global (`follow_a_plan` / `skip_all_permission_checks`). Falta a UI de confirmação e o tracking por domínio.

**Dependências:** T8 (permissions system), T6 (side panel UI)

---

## 6. Popup Window (modo alternativo)

**O quê:** Adicionar modo **popup** (janela flutuante 500×768) além do side panel:
- `action_ Popup` no manifest (já configurável)
- Alternar entre side panel e popup nas definições
- Full screen mode (opcional)

**Porquê:** Claude in Chrome oferece side panel, popup e full screen. O popup é útil para usar sem ocupar o side panel.

**Dependências:** T6 (side panel — reutiliza componentes React)

---

## 7. Shortcuts e `/` commands

**O quê:** Implementar comandos rápidos digitando `/` no chat:
- Lista de comandos ao digitar `/`
- Comandos pré-definidos: `/clear`, `/screenshot`, `/help`, etc.
- Placeholders: `{{modelName}}`, `{{currentDate}}`, `{{platform}}`
- Execução manual ou em schedule

**Estado atual:** O placeholder "Type / for commands" já existe no ChatInput, mas nenhum comando está implementado.

**Dependências:** T6 (ChatInput)

---

## 8. Tarefas Agendadas (Scheduled Tasks)

**O quê:** Sistema de tarefas com `chrome.alarms`:
- UI para criar/editar/remover tarefas no side panel
- Repetição: once, daily, weekly, monthly, annually
- Notificação ao completar (via `chrome.notifications`)
- Task Manager integrado na UI

**Estado atual:** `chrome.alarms` e `chrome.notifications` estão no manifest, e T11 já criou a base. Falta a UI e a lógica completa.

**Dependências:** T11 (scheduled tasks existente, mas vazio)

---

## 9. ❌ Excluído (Reservado — Segurança / Conectores — postecipado)

---

## 10. Indicadores Visuais — funcionalidades em falta

**O quê:** Completar o `agent-indicator.ts` com:
- **Transição suave** do cursor fantasma (180ms cubic-bezier entre posições)
- **Círculo de clique** laranja com glow (efeito visual ao clicar)
- **Labels de ação** — descrição do que o agente está a fazer na página (ex: "Clicando em 'Comprar'")
- **Drag paths** — setas vermelhas indicando arrasto
- **Static indicator** — bolinha laranja no canto superior da página quando ativo
- **Botão de parar** na página (além do side panel)

**Estado atual:** O content script `agent-indicator.ts` existe com cursor fantasma básico, glow, botão stop, audio context. Falta a label de ação, drag paths, transições e static indicator.

**Dependências:** T9 (visual indicators base)

---

## 11. ❌ Excluído — Offscreen Document (áudio + GIFs)

Não implementar. O gerador de GIFs e captura de áudio via `offscreen.html` não são necessários para esta versão.

---

## 12. ❌ Excluído (Reservado — Integrações / Conectores — postecipado)

---

## 13. (Reservado — Segurança / Privacidade — postecipado)

---

## 14. ❌ Excluído Pairing / Autenticação

**O quê:** Implementar fluxo de pairing:
- `pairing.html` (já existe como placeholder)
- Tela de login/pairing com código
- Suporte a org accounts
- Configuração de equipa (managed settings via `managed_schema.json`)

**Estado atual:** `pairing.html` existe mas está vazio.

---

## 15. ❌ Excluído (Reservado — Cowork / Quick mode — postecipado)

---

## 16. Testes funcionais com provider real

**O quê:** Testar o loop completo ponta a ponta:
1. Abrir side panel
2. Escrever mensagem
3. Enviar para provider real (ex: opencode-go / deepseek-v4-flash)
4. Ver resposta gerada
5. Ver tool calls executadas corretamente
6. Ver resultados devolvidos ao modelo
7. Corrigir bugs encontrados

**Porquê:** É o teste de validação final. Tudo pode funcionar no código mas falhar no runtime real.

**Critérios de aceitação:**
- Mensagem de texto simples → resposta gerada
- Mensagem com pedido de ação → tool call executada, resultado devolvido
- Múltiplos tool calls em sequência → execução correta
- Erros de API tratados graciosamente
- Streaming de resposta visível na UI

---

## Ordem recomendada de implementação

```
1. Testes funcionais (16) — validar se o que temos funciona
2. web_search + web_fetch (1) — expandir capacidades do agente
3. Site-level Permissions (5) — segurança primeiro
4. Tab Groups (4) — multi-tab tasks
5. Shortcuts / commands (7) — qualidade de vida
6. Indicadores Visuais completos (10) — polish
7. Tarefas Agendadas (8) — automação
8. Popup Window (6) — modo alternativo
9. read_file / edit_file / download (2) — ficheiros
10. Pairing / Autenticação (14) — enterprise
```
