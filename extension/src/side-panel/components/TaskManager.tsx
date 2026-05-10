import React, { useState, useEffect, useCallback } from 'react';
import { t } from '../../utils/i18n';

interface ScheduledTask {
  id: string;
  name: string;
  command: string;
  schedule: {
    type: 'once' | 'daily' | 'weekly' | 'monthly';
    time: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
  };
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  createdAt: number;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SCHEDULE_TYPES = ['once', 'daily', 'weekly', 'monthly'];

export function TaskManager({ onClose }: { onClose: () => void }) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', command: '', type: 'daily' as 'once' | 'daily' | 'weekly' | 'monthly', time: '09:00', dayOfWeek: 1, dayOfMonth: 1 });

  const loadTasks = useCallback(async () => {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'task:getAll' });
      if (resp?.tasks) setTasks(resp.tasks);
    } catch (err) {
      console.error('[SP] Task manager error:', err);
    }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await chrome.runtime.sendMessage({ type: 'task:delete', taskId: id });
      await loadTasks();
    } catch (err) {
      console.error('[SP] Task manager error:', err);
    }
  }, [loadTasks]);

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    try {
      await chrome.runtime.sendMessage({ type: 'task:toggle', taskId: id, enabled });
      await loadTasks();
    } catch (err) {
      console.error('[SP] Task manager error:', err);
    }
  }, [loadTasks]);

  const handleRunNow = useCallback(async (id: string) => {
    try {
      await chrome.runtime.sendMessage({ type: 'task:execute', taskId: id });
      await loadTasks();
    } catch (err) {
      console.error('[SP] Task manager error:', err);
    }
  }, [loadTasks]);

  const handleCreate = useCallback(async () => {
    try {
      await chrome.runtime.sendMessage({
        type: 'task:create',
        task: {
          name: form.name,
          command: form.command,
          schedule: {
            type: form.type,
            time: form.time,
            ...(form.type === 'weekly' ? { dayOfWeek: form.dayOfWeek } : {}),
            ...(form.type === 'monthly' ? { dayOfMonth: form.dayOfMonth } : {}),
          },
          enabled: true,
        },
      });
      setShowCreate(false);
      setForm({ name: '', command: '', type: 'daily', time: '09:00', dayOfWeek: 1, dayOfMonth: 1 });
      await loadTasks();
    } catch (err) {
      console.error('[SP] Task manager error:', err);
    }
  }, [form, loadTasks]);

  const canCreate = form.name.trim().length > 0 && form.command.trim().length > 0;

  const formatTime = (ts?: number) => {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleString();
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  };

  const panelStyle: React.CSSProperties = {
    background: 'var(--color-bg-000, #2e2e2c)',
    borderRadius: '12px 12px 0 0',
    padding: '16px 20px',
    width: '100%',
    maxHeight: '70vh',
    overflowY: 'auto',
    borderTop: '0.5px solid var(--color-border-100, rgba(209,205,195,0.15))',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16, fontSize: 15, fontWeight: 600, color: 'var(--color-text-000, #f7f6f3)',
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--color-bg-200, #1f1f1d)',
    borderRadius: 8,
    padding: '10px 14px',
    marginBottom: 8,
    border: '0.5px solid var(--color-border-100, rgba(209,205,195,0.15))',
  };

  const btnStyle: React.CSSProperties = {
    background: 'var(--color-bg-200, #1f1f1d)',
    color: 'var(--color-text-000, #f7f6f3)',
    border: '0.5px solid var(--color-border-100, rgba(209,205,195,0.15))',
    padding: '6px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
  };

  return (
    <>
      <style>{`button:disabled { opacity: 0.5; cursor: not-allowed; }`}</style>
      <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        <div style={headerStyle}>
          <span>Scheduled Tasks</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnStyle} onClick={() => setShowCreate(!showCreate)}>
              {showCreate ? 'Cancel' : t('task_create')}
            </button>
            <button style={btnStyle} onClick={onClose}>✕</button>
          </div>
        </div>

        {showCreate && (
          <div style={cardStyle}>
            <input
              placeholder={t('task_name')}
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={{ ...inputStyle, marginBottom: 6 }}
            />
            <input
              placeholder={t('task_command')}
              value={form.command}
              onChange={e => setForm(f => ({ ...f, command: e.target.value }))}
              style={{ ...inputStyle, marginBottom: 6 }}
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
                style={{ ...selectStyle, flex: 1 }}
              >
                {SCHEDULE_TYPES.map(s => <option key={s} value={s}>{s === 'once' ? 'Once' : s === 'daily' ? t('task_daily') : s === 'weekly' ? t('task_weekly') : s === 'monthly' ? t('task_monthly') : s}</option>)}
              </select>
              <input
                type="time"
                value={form.time}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                style={{ ...inputStyle, width: 100 }}
              />
            </div>
            {form.type === 'weekly' && (
              <select
                value={form.dayOfWeek}
                onChange={e => setForm(f => ({ ...f, dayOfWeek: parseInt(e.target.value) }))}
                style={{ ...selectStyle, marginTop: 6 }}
              >
                {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((name, i) => (
                  <option key={i} value={i}>{name}</option>
                ))}
              </select>
            )}
            {form.type === 'monthly' && (
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-400, #9c9b91)', marginRight: 4 }}>Day:</span>
                <select
                  value={form.dayOfMonth}
                  onChange={e => setForm(f => ({ ...f, dayOfMonth: parseInt(e.target.value) }))}
                  style={{ ...selectStyle, display: 'inline-block', width: 80 }}
                >
                  {Array.from({length: 28}, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}
            <button style={{ ...btnStyle, background: 'var(--color-brand, #d97757)', color: 'white', border: 'none' }} onClick={handleCreate} disabled={!canCreate}>
              Create
            </button>
          </div>
        )}

        {tasks.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-400, #9c9b91)', fontSize: 13, padding: 20 }}>
            No scheduled tasks
          </p>
        ) : (
          tasks.map(task => (
            <div key={task.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--color-text-000, #f7f6f3)' }}>
                  {task.name || task.command.substring(0, 40)}
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-400, #9c9b91)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={task.enabled}
                    onChange={e => handleToggle(task.id, e.target.checked)}
                  />
                  {task.enabled ? t('on') : t('off')}
                </label>
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-400, #9c9b91)', marginBottom: 6 }}>
                {task.schedule.type === 'once' ? t('once') : task.schedule.type === 'daily' ? t('task_daily') : task.schedule.type === 'weekly' ? t('task_weekly') : t('task_monthly')} {t('at')} {task.schedule.time}
                {task.schedule.dayOfWeek !== undefined ? ` (${DAYS[task.schedule.dayOfWeek]})` : ''}
                {task.schedule.dayOfMonth ? ` (${t('day')} ${task.schedule.dayOfMonth})` : ''}
                {' · '}{t('task_next_run')}: {formatTime(task.nextRun)}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={smallBtn} onClick={() => handleRunNow(task.id)}>{t('task_run_now')}</button>
                <button style={smallBtn} onClick={() => handleDelete(task.id)}>{t('task_delete')}</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '8px 10px',
  background: 'var(--color-bg-200, #1f1f1d)',
  border: '0.5px solid var(--color-border-100, rgba(209,205,195,0.15))',
  borderRadius: 6, color: 'var(--color-text-000, #f7f6f3)',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: 'pointer',
};

const smallBtn: React.CSSProperties = {
  background: 'transparent', color: 'var(--color-text-400, #9c9b91)',
  border: '0.5px solid var(--color-border-100, rgba(209,205,195,0.15))',
  padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
  fontSize: 11, fontFamily: 'inherit',
};
