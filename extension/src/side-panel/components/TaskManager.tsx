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
    background: '#FBFAF5',
    borderRadius: '12px 12px 0 0',
    padding: '16px 20px',
    width: '100%',
    maxHeight: '70vh',
    overflowY: 'auto',
    borderTop: '1px solid #DCD9CF',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16, fontSize: 15, fontWeight: 600, color: '#121517',
  };

  const cardStyle: React.CSSProperties = {
    background: '#F3F0E7',
    borderRadius: 8,
    padding: '10px 14px',
    marginBottom: 8,
    border: '1px solid #DCD9CF',
  };

  const btnStyle: React.CSSProperties = {
    background: '#FBFAF5',
    color: '#121517',
    border: '1px solid #DCD9CF',
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
          <span>{t('tasks_title')}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnStyle} onClick={() => setShowCreate(!showCreate)}>
              {showCreate ? t('task_cancel') : t('task_create')}
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
                {SCHEDULE_TYPES.map(s => <option key={s} value={s}>{s === 'once' ? t('task_once') : s === 'daily' ? t('task_daily') : s === 'weekly' ? t('task_weekly') : s === 'monthly' ? t('task_monthly') : s}</option>)}
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
                <span style={{ fontSize: 11, color: '#5B6165', marginRight: 4 }}>{t('task_day')}:</span>
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
            <button style={{ ...btnStyle, background: '#1E46E8', color: '#FBFAF5', border: '1px solid #1E46E8' }} onClick={handleCreate} disabled={!canCreate}>
              {t('task_create_btn')}
            </button>
          </div>
        )}

        {tasks.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#5B6165', fontSize: 13, padding: 20 }}>
            {t('tasks_empty')}
          </p>
        ) : (
          tasks.map(task => (
            <div key={task.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 500, fontSize: 13, color: '#121517' }}>
                  {task.name || task.command.substring(0, 40)}
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#5B6165', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={task.enabled}
                    onChange={e => handleToggle(task.id, e.target.checked)}
                  />
                  {task.enabled ? t('on') : t('off')}
                </label>
              </div>
              <div style={{ fontSize: 11, color: '#5B6165', marginBottom: 6 }}>
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
  background: '#FBFAF5',
  border: '1px solid #DCD9CF',
  borderRadius: 6, color: '#121517',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: 'pointer',
};

const smallBtn: React.CSSProperties = {
  background: 'transparent', color: '#5B6165',
  border: '1px solid #DCD9CF',
  padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
  fontSize: 11, fontFamily: 'inherit',
};
