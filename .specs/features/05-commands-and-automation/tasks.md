# Tasks: Commands and Automation

**Feature ID:** `commands-and-automation`

---

## Dependências

- T6 (Side Panel UI) — ✅ ChatInput + ChatContext
- T11 (Scheduled Tasks) — ✅ base, precisa de ser preenchida

---

## T1: CommandRegistry + Menu UI

**Ficheiros:** `extension/src/side-panel/components/CommandsMenu.tsx` (criar), `ChatInput.tsx` (modificar)

**O quê:**
- Criar `CommandRegistry` com comandos base (`/clear`, `/screenshot`, `/help`, `/settings`, `/tabs`, `/status`)
- Em `ChatInput.tsx`: detetar `/` no início do texto, mostrar `CommandsMenu` como dropdown
- Filtrar comandos conforme o utilizador digita
- Ao selecionar, executar a ação do comando e limpar o input

**Feito quando:** `/` mostra menu, comandos executam, input é limpo após execução.

---

## T2: Scheduled Tasks — Service Worker

**Ficheiro:** `extension/src/service-worker/scheduled-tasks.ts`

**O quê:** Implementar:
- `createTask(task)` — guardar em `chrome.storage.local` + criar `chrome.alarms`
- `deleteTask(taskId)` — remover de storage + cancelar alarme
- `getTasks()` — listar tarefas
- `runTask(taskId)` — executar tarefa (reusar lógica `chat:send` com notificação)
- Handler `chrome.alarms.onAlarm` — executar tarefa quando alarme dispara
- Handler `chrome.notifications.onClicked` — abrir side panel quando notificação é clicada

**Feito quando:** Tarefas são criadas, alarmes disparam, notificações aparecem.

---

## T3: Task Manager UI

**Ficheiro:** `extension/src/side-panel/components/TaskManager.tsx` (criar)

**O quê:** Componente React com:
- Lista de tarefas (nome, schedule, próximo disparo, enabled/disabled)
- Botão "Run now"
- Botão "Delete"
- Botão "Create task" que abre formulário com: nome, comando, schedule type, hora
- Guardar/recarregar de `chrome.storage.local`

**Feito quando:** Utilizador pode ver, criar, executar e apagar tarefas na UI.

---

## T4: Integração no App + ChatContext

**Ficheiros:** `extension/src/side-panel/App.tsx`, `ChatContext.tsx`

**O quê:**
- Adicionar toggle para TaskManager no Header (ou menu)
- Garantir que CommandRegistry está acessível globalmente
- Quando comando `/screenshot` é executado, enviar mensagem ao service worker

**Feito quando:** TaskManager acessível via UI, comandos funcionam integrados.

---

## T5: i18n

**Ficheiros:** `extension/_locales/en/messages.json`, `pt_BR/messages.json`

| Chave | EN | PT |
|-------|----|-----|
| `cmd_clear` | Clear conversation | Limpar conversa |
| `cmd_screenshot` | Take screenshot | Tirar screenshot |
| `cmd_help` | Show available commands | Mostrar comandos disponíveis |
| `cmd_settings` | Open settings | Abrir configurações |
| `cmd_tabs` | Show tab context | Mostrar contexto de abas |
| `cmd_status` | Show current state | Mostrar estado atual |
| `task_create` | Create Scheduled Task | Criar tarefa agendada |
| `task_name` | Task name | Nome da tarefa |
| `task_command` | Command | Comando |
| `task_schedule` | Schedule | Agendamento |
| `task_run_now` | Run now | Executar agora |
| `task_delete` | Delete | Apagar |
| `task_daily` | Daily | Diário |
| `task_weekly` | Weekly | Semanal |
| `task_monthly` | Monthly | Mensal |
| `task_next_run` | Next run | Próxima execução |

---

## Ordem de Execução

```
T1 (commands menu) ─── (paralelo a T2)

T2 (scheduled SW) ──→ T3 (task manager UI) ──→ T4 (integration)

T5 (i18n) ─── (final)
```
