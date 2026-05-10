/* ─── Scheduled Tasks Manager ───────────────────────────────── */

export interface ScheduledTask {
  id: string;
  name: string;
  command: string;
  schedule: {
    type: 'once' | 'daily' | 'weekly' | 'monthly';
    time: string;           // HH:MM (24h)
    dayOfWeek?: number;     // 0-6 (weekly, 0=Sunday)
    dayOfMonth?: number;    // 1-31 (monthly)
  };
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  createdAt: number;
}

const STORAGE_KEY = 'ba-scheduled-tasks';

export class ScheduledTaskManager {
  private _onExecute?: (command: string) => Promise<string>;

  setCommandHandler(handler: (command: string) => Promise<string>): void {
    this._onExecute = handler;
  }
  /**
   * Create a new scheduled task.
   */
  async create(task: Omit<ScheduledTask, 'id' | 'createdAt' | 'lastRun' | 'nextRun'>): Promise<ScheduledTask> {
    const newTask: ScheduledTask = {
      ...task,
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    };

    const tasks = await this._load();
    tasks.push(newTask);
    await this._save(tasks);
    await this._scheduleAlarm(newTask);

    return newTask;
  }

  /**
   * Delete a scheduled task.
   */
  async delete(taskId: string): Promise<void> {
    const tasks = await this._load();
    const remaining = tasks.filter(t => t.id !== taskId);
    await this._save(remaining);
    chrome.alarms.clear(taskId);
  }

  /**
   * Get all scheduled tasks.
   */
  async getAll(): Promise<ScheduledTask[]> {
    return this._load();
  }

  /**
   * Get a single task by ID.
   */
  async get(taskId: string): Promise<ScheduledTask | undefined> {
    const tasks = await this._load();
    return tasks.find(t => t.id === taskId);
  }

  /**
   * Toggle task enabled/disabled.
   */
  async toggle(taskId: string, enabled: boolean): Promise<void> {
    const tasks = await this._load();
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      task.enabled = enabled;
      await this._save(tasks);
      if (enabled) {
        await this._scheduleAlarm(task);
      } else {
        chrome.alarms.clear(taskId);
      }
    }
  }

  /**
   * Execute a task (called when alarm fires).
   */
  async execute(taskId: string): Promise<void> {
    const tasks = await this._load();
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.enabled) return;

    task.lastRun = Date.now();
    task.nextRun = this._calculateNextRun(task);
    await this._save(tasks);

    try {
      // Show running notification
      Promise.resolve(chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'BrowserAgent',
        message: `Running scheduled task: ${task.name}`,
        priority: 0,
      })).catch(() => {});

      // Execute the command
      if (this._onExecute) {
        const result = await this._onExecute(task.command);

        // Show completion notification with result preview
        const preview = result.length > 100 ? result.substring(0, 100) + '...' : result;
        Promise.resolve(chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: `Task complete: ${task.name}`,
          message: preview,
          priority: 0,
        })).catch(() => {});
      }

      // Re-schedule for recurring tasks (more accurate for monthly)
      if (task.schedule.type !== 'once' && task.enabled) {
        await this._scheduleAlarm(task);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Promise.resolve(chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: `Task failed: ${task.name}`,
        message: msg,
        priority: 2,
      })).catch(() => {});
    }
  }

  /**
   * @deprecated Listeners are now registered at module level.
   */
  init(): void {
    // Listeners moved to module level for MV3 compliance
  }

  // ── Private helpers ────────────────────────────────────────

  private async _load(): Promise<ScheduledTask[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
  }

  private async _save(tasks: ScheduledTask[]): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: tasks });
  }

  private async _scheduleAlarm(task: ScheduledTask): Promise<void> {
    const delayMs = this._calculateDelayMs(task);
    if (delayMs < 0) return; // Past time, skip

    const delayMinutes = Math.max(0.1, delayMs / 60000);

    // Always use only delayInMinutes; recurring tasks re-schedule after execution
    chrome.alarms.create(task.id, { delayInMinutes: delayMinutes });
  }

  private _calculateDelayMs(task: ScheduledTask): number {
    const now = Date.now();
    const [hours, minutes] = task.schedule.time.split(':').map(Number);
    const next = new Date();
    next.setHours(hours, minutes, 0, 0);

    if (task.schedule.type === 'daily') {
      if (next.getTime() <= now) next.setDate(next.getDate() + 1);
      return next.getTime() - now;
    }

    if (task.schedule.type === 'weekly' && task.schedule.dayOfWeek !== undefined) {
      const daysAhead = (task.schedule.dayOfWeek - next.getDay() + 7) % 7;
      if (daysAhead === 0 && next.getTime() <= now) {
        next.setDate(next.getDate() + 7);
      } else {
        next.setDate(next.getDate() + daysAhead);
      }
      return next.getTime() - now;
    }

    if (task.schedule.type === 'monthly' && task.schedule.dayOfMonth !== undefined) {
      next.setDate(task.schedule.dayOfMonth);
      if (next.getTime() <= now) next.setMonth(next.getMonth() + 1);
      return next.getTime() - now;
    }

    // Once
    if (next.getTime() <= now) return -1;
    return next.getTime() - now;
  }

  private _calculateNextRun(task: ScheduledTask): number {
    return Date.now() + this._calculateDelayMs({ ...task, lastRun: undefined });
  }
}

export const scheduledTaskManager = new ScheduledTaskManager();

/* ─── Module-level MV3 listeners ────────────────────────────── */

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const tasks = await scheduledTaskManager['_load']();
  const task = tasks.find(t => t.id === alarm.name);
  if (task && task.enabled) {
    await scheduledTaskManager.execute(alarm.name);
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT }).catch(() => {});
});
