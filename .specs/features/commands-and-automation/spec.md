# Feature: Commands and Automation

**Feature ID:** `commands-and-automation`
**Prioridade:** 4

*Agrupa os itens 7 (Shortcuts / `/` commands) e 8 (Scheduled Tasks) da lista de pendências.*

---

## Descrição

Implementar dois sistemas complementares:

1. **Shortcuts / `/` commands** — comandos rápidos no chat (digitar `/` + nome do comando)
2. **Scheduled Tasks** — tarefas que executam automaticamente em horários definidos via `chrome.alarms`

Ambos partilham a base de comandos: shortcuts são execução manual, scheduled tasks são execução automática.

---

## User Stories

### P1: `/` Commands ⭐ MVP

**Como** utilizador,
**Quero** digitar `/` no chat para ver e executar comandos rápidos
**Para** aceder a funcionalidades sem ter que descrever em linguagem natural.

**Critérios de Aceitação:**

1. WHEN o utilizador digita `/` no input THEN um menu dropdown SHALL aparecer com comandos disponíveis
2. WHEN o utilizador continua a digitar (ex: `/cl`) THEN os comandos SHALL ser filtrados
3. WHEN o utilizador seleciona um comando THEN a ação correspondente SHALL ser executada imediatamente
4. WHEN o comando é executado THEN SHALL aparecer como mensagem de sistema no chat

### P1: Comandos Base

**Critérios de Aceitação:**

Os seguintes comandos SHALL estar disponíveis por defeito:

| Comando | Ação |
|---------|------|
| `/clear` | Limpar conversa |
| `/screenshot` | Tirar screenshot da página atual |
| `/help` | Mostrar lista de comandos disponíveis |
| `/settings` | Abrir options page |
| `/tabs` | Mostrar contexto de abas atuais |
| `/status` | Mostrar estado atual (provider, modelo, modo de permissão) |

### P2: Scheduled Tasks

**Como** utilizador,
**Quero** agendar comandos para executar automaticamente
**Para** automatizar tarefas recorrentes (ex: verificar preços todas as manhãs).

**Critérios de Aceitação:**

1. WHEN o utilizador cria uma tarefa agendada THEN os parâmetros SHALL ser guardados em `chrome.storage.local`
2. WHEN o alarme dispara THEN o comando SHALL ser executado automaticamente
3. WHEN a tarefa termina THEN SHALL mostrar notificação (`chrome.notifications`)
4. WHEN a tarefa é diária/semanal/mensal THEN o alarme SHALL ser recorrente

### P2: Placeholders em Comandos

**Critérios de Aceitação:**

1. WHEN um comando contém `{{currentDate}}` THEN SHALL ser substituído pela data atual
2. WHEN um comando contém `{{modelName}}` THEN SHALL ser substituído pelo modelo ativo
3. WHEN um comando contém `{{platform}}` THEN SHALL ser substituído pelo SO (win/mac/linux)

### P2: Task Manager UI

**Critérios de Aceitação:**

1. WHEN o utilizador abre o gestor de tarefas THEN SHALL ver lista de tarefas agendadas
2. Cada tarefa SHALL mostrar: nome, comando, schedule (daily/weekly/monthly), próximo disparo
3. WHEN o utilizador clica "Delete" THEN a tarefa SHALL ser removida e o alarme cancelado
4. WHEN o utilizador clica "Run now" THEN a tarefa SHALL ser executada imediatamente

### P3: Comandos Customizáveis

**Critérios de Aceitação:**

1. WHEN o utilizador cria um shortcut personalizado THEN SHALL ser guardado em `chrome.storage.local`
2. O shortcut SHALL ter: nome, comando (texto que será enviado ao modelo), atalho `/nome`

---

## Dependências

| Dependência | Descrição |
|-------------|-----------|
| T6 (Side Panel UI) | ✅ ChatInput para `/` commands, task manager UI |
| T11 (Scheduled Tasks) | ✅ Existe mas vazio — reutilizar `chrome.alarms` |
| T2 (Service Worker) | ✅ Handler para task execution |
| Permissions | `chrome.alarms`, `chrome.notifications` já no manifest |

## Fora de Escopo (v1)

- Comandos com placeholders complexos (ex: `{{modelName}}`)
- Drag-and-drop de tarefas na UI
- Histórico de execução de tarefas
- Tarefas com múltiplos passos (workflows)
