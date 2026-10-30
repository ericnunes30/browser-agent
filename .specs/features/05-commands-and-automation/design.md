# Design: Commands and Automation

**Feature ID:** `commands-and-automation`

---

## 1. Shortcuts System

### Comando `/` no ChatInput

O ChatInput já mostra o placeholder "Type / for commands". O menu de comandos abre quando o texto começa com `/`.

```
┌─────────────────────────────────────┐
│ /cl                                 │
├─────────────────────────────────────┤
│ 🗑  /clear  Clear conversation      │
│ 📸  /screenshot  Take screenshot    │
│ ℹ️  /help  Show available commands  │
│ ⚙️  /settings  Open settings        │
│ 📋  /tabs  Show tab context         │
│ 📊  /status  Show current state     │
└─────────────────────────────────────┘
```

### Fluxo

```typescript
// Em ChatInput.tsx
const [showCommands, setShowCommands] = useState(false);
const [filteredCommands, setFilteredCommands] = useState(DEFAULT_COMMANDS);

// Quando texto começa com '/'
useEffect(() => {
  if (text.startsWith('/')) {
    const query = text.slice(1).toLowerCase();
    setFilteredCommands(DEFAULT_COMMANDS.filter(cmd =>
      cmd.command.includes(query) || cmd.label.toLowerCase().includes(query)
    ));
    setShowCommands(true);
  } else {
    setShowCommands(false);
  }
}, [text]);
```

### ComandRegistry

```typescript
interface Command {
  command: string;        // ex: 'clear'
  label: string;          // ex: 'Clear conversation'
  icon: string;           // emoji ou SVG
  action: () => Promise<void> | void;
}

const DEFAULT_COMMANDS: Command[] = [
  { command: 'clear', label: 'Clear conversation', icon: '🗑', action: clearConversation },
  { command: 'screenshot', label: 'Take screenshot', icon: '📸', action: takeScreenshot },
  { command: 'help', label: 'Show available commands', icon: 'ℹ️', action: showHelp },
  { command: 'settings', label: 'Open settings', icon: '⚙️', action: () => chrome.runtime.openOptionsPage() },
  { command: 'tabs', label: 'Show tab context', icon: '📋', action: showTabs },
  { command: 'status', label: 'Show current state', icon: '📊', action: showStatus },
];
```

---

## 2. Scheduled Tasks

### Estrutura de Dados

```typescript
interface ScheduledTask {
  id: string;
  name: string;
  command: string;          // texto a enviar ao modelo
  schedule: {
    type: 'once' | 'daily' | 'weekly' | 'monthly' | 'annual';
    time: string;           // HH:MM (24h)
    dayOfWeek?: number;     // 0-6 (weekly)
    dayOfMonth?: number;    // 1-31 (monthly)
    date?: string;          // ISO (once)
  };
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  createdAt: number;
}
```

### Storage

```typescript
// chrome.storage.local
{
  'ba-scheduled-tasks': ScheduledTask[],
  'ba-shortcuts': Command[]  // custom shortcuts
}
```

### Chrome Alarms

```typescript
// Criar alarme para cada tarefa
chrome.alarms.create(task.id, {
  periodInMinutes: scheduleToPeriod(task),  // para daily/weekly/etc
  delayInMinutes: 1,  // start soon
});

// Handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const task = await getTask(alarm.name);
  if (task) {
    const result = await executeTask(task);
    await showNotification(task, result);
  }
});
```

---

## 3. Service Worker — Task Executor

```typescript
// Em service-worker/index.ts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'task:execute') {
    executeScheduledTask(msg.taskId).then(sendResponse);
    return true;
  }
  if (msg.type === 'task:create') {
    createScheduledTask(msg.task).then(sendResponse);
    return true;
  }
  if (msg.type === 'task:delete') {
    deleteScheduledTask(msg.taskId).then(sendResponse);
    return true;
  }
});
```

A execução de uma tarefa agendada reusa o fluxo `chat:send` mas sem depender da UI — executa em background e notifica o utilizador.

---

## 4. Ficheiros a Modificar/Criar

| Ficheiro | Ação |
|----------|------|
| `extension/src/side-panel/components/ChatInput.tsx` | Modificar — adicionar `/` commands menu |
| `extension/src/side-panel/components/CommandsMenu.tsx` | **Criar** — UI do menu de comandos |
| `extension/src/service-worker/scheduled-tasks.ts` | Modificar — implementar lógica completa |
| `extension/src/service-worker/index.ts` | Modificar — handlers task:execute/create/delete |
| `extension/src/side-panel/components/TaskManager.tsx` | **Criar** — UI de gestão de tarefas |
| `extension/src/side-panel/ChatContext.tsx` | Modificar — integrar CommandRegistry |
| `extension/src/side-panel/App.tsx` | Modificar — toggle TaskManager |
| `extension/_locales/*/messages.json` | Novas chaves i18n |

---

## 5. Substituição de Placeholders

```typescript
function resolvePlaceholders(text: string): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().slice(0, 5); // HH:MM

  return text
    .replace('{{currentDate}}', dateStr)
    .replace('{{currentTime}}', timeStr)
    .replace('{{modelName}}', activeModel)
    .replace('{{platform}}', navigator.platform);
}
```
