import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChat, type PermissionMode, type ImageAttachment } from '../ChatContext';
import { t } from '../../utils/i18n';
import { CommandsMenu, DEFAULT_COMMANDS, Command } from './CommandsMenu';

interface ActionsMenuProps {
  onScreenshot: () => void;
  onUpload: () => void;
  disabled?: boolean;
}

function PermissionToggle({
  permissionMode,
  onChange,
  disabled,
}: {
  permissionMode: PermissionMode;
  onChange: (mode: PermissionMode) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isSkip = permissionMode === 'skip_all_permission_checks';
  const OPTIONS: { label: string; value: PermissionMode; description: string }[] = [
    {
      label: t('perm_ask_actions'),
      value: 'follow_a_plan',
      description: t('perm_plans_desc'),
    },
    {
      label: t('perm_act_no_ask'),
      value: 'skip_all_permission_checks',
      description: t('perm_auto_desc'),
    },
  ];

  const current = OPTIONS.find((o) => o.value === permissionMode)!;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 500,
          background: 'transparent',
          border: 'none',
          color: '#5B6165',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
          {isSkip ? (
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1.5A5.5 5.5 0 1113.5 8 5.5 5.5 0 018 2.5zM7 5v5a.5.5 0 001 0V5a.5.5 0 00-1 0z" />
          ) : (
            <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM4.5 7.5a.5.5 0 000 1h7a.5.5 0 000-1h-7z" />
          )}
        </svg>
        <span>{current.label}</span>
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="ba-menu"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 4,
            background: '#FBFAF5',
            border: '1px solid #DCD9CF',
            borderRadius: 6,
            padding: 4,
            minWidth: 220,
            boxShadow: '0 18px 40px rgba(18, 21, 23, 0.14)',
            zIndex: 100,
          }}
        >
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                background: opt.value === permissionMode ? '#DCE4FF' : 'transparent',
                border: 'none',
                color: '#121517',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 12,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, marginTop: 1 }}>
                {opt.value === 'skip_all_permission_checks' ? (
                  <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1.5A5.5 5.5 0 1113.5 8 5.5 5.5 0 018 2.5zM7 5v5a.5.5 0 001 0V5a.5.5 0 00-1 0z" />
                ) : (
                  <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM4.5 7.5a.5.5 0 000 1h7a.5.5 0 000-1h-7z" />
                )}
              </svg>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{opt.label}</div>
                <div style={{ color: '#5B6165', fontSize: 11 }}>{opt.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionsMenu({ onScreenshot, onUpload, disabled }: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 6,
          border: 'none',
          background: 'transparent',
          color: '#5B6165',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
        title={t('input_actions')}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3 9.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
        </svg>
      </button>

      {open && (
        <div
          className="ba-menu"
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: 4,
            background: '#FBFAF5',
            border: '1px solid #DCD9CF',
            borderRadius: 6,
            padding: 4,
            minWidth: 180,
            boxShadow: '0 18px 40px rgba(18, 21, 23, 0.14)',
            zIndex: 100,
          }}
        >
          <button
            onClick={() => { onScreenshot(); setOpen(false); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 10px',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: '#121517',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 12,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 4a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1.5l-.5-1.5A1 1 0 0010.55 3H5.45A1 1 0 004.5 3.5L4 4H2zm5.5 2.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" />
            </svg>
            {t('action_screenshot')}
          </button>
          <button
            onClick={() => { onUpload(); setOpen(false); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 10px',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: '#121517',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 12,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6.5 1.5a.5.5 0 01.5-.5h2a.5.5 0 010 1H7a.5.5 0 01-.5-.5zM4 5.5a.5.5 0 01.5-.5h7a.5.5 0 010 1h-7a.5.5 0 01-.5-.5zM3 8.5a.5.5 0 01.5-.5h9a.5.5 0 010 1h-9a.5.5 0 01-.5-.5zM4.5 11.5a.5.5 0 01.5-.5h6a.5.5 0 010 1H5a.5.5 0 01-.5-.5z" />
              <path d="M2 2a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H2zm0 1h12a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4a1 1 0 011-1z" />
            </svg>
            {t('action_upload')}
          </button>
        </div>
      )}
    </div>
  );
}

function HighRiskBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '8px 12px',
        margin: '0 0 8px',
        borderRadius: 6,
        background: '#F3F0E7',
        border: '1px solid #DCD9CF',
        fontSize: 11,
        lineHeight: 1.4,
        color: '#5B6165',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, marginTop: 1, color: '#C98A1E' }}>
        <path d="M8.97.348a1.5 1.5 0 00-1.94 0L.342 6.435a1.5 1.5 0 00-.342.84V15a1 1 0 001 1h14a1 1 0 001-1V7.275a1.5 1.5 0 00-.342-.84L8.97.348zM8 4a.5.5 0 01.5.5v4a.5.5 0 01-1 0v-4A.5.5 0 018 4zm0 7.5a.75.75 0 110-1.5.75.75 0 010 1.5z" />
      </svg>
      <div style={{ flex: 1 }}>
        <strong>{t('high_risk_title')}:</strong> {t('high_risk_text')}{' '}
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            textDecoration: 'underline',
            color: '#121517',
            cursor: 'pointer',
            fontSize: 11,
            padding: 0,
          }}
        >
          {t('high_risk_dismiss')}
        </button>
      </div>
    </div>
  );
}

export default function ChatInput() {
  const [text, setText] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [highRiskDismissed, setHighRiskDismissed] = useState(false);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendMessage, isStreaming, messages, permissionMode, setPermissionMode, stopGeneration, clearConversation, activeProvider, activeModel } = useChat();

  // Show commands menu when typing /
  useEffect(() => {
    setShowCommands(text.startsWith('/') && text.length > 0);
  }, [text]);

  const hasMessages = messages.length > 0;
  const isSkipMode = permissionMode === 'skip_all_permission_checks';
  const showHighRisk = isSkipMode && !highRiskDismissed;

  // Resize textarea to fit content — called only on user input
  const resizeTextarea = useCallback((ta: HTMLTextAreaElement) => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || isStreaming) return;
    sendMessage(trimmed, attachments.length > 0 ? attachments : undefined);
    setText('');
    setAttachments([]);
    // Reset height to CSS default (rows={1}) after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = '';
    }
  }, [text, isStreaming, sendMessage, attachments]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && showCommands) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit, showCommands]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    resizeTextarea(e.target);
  }, [resizeTextarea]);

  const handleScreenshot = useCallback(async () => {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'tab:getActive' });
      if (resp?.id) {
        await chrome.runtime.sendMessage({ type: 'SHOW_AGENT_INDICATORS', tabId: resp.id });
      }
    } catch {
      // silent
    }
  }, []);

  const handleUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const newAttachments: ImageAttachment[] = [];
    let processed = 0;
    const totalFiles = files.length;

    const checkDone = () => {
      processed++;
      if (processed === totalFiles) {
        if (newAttachments.length > 0) {
          setAttachments((prev) => [...prev, ...newAttachments]);
        }
      }
    };

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        checkDone();
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        newAttachments.push({
          id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          dataUrl,
          name: file.name,
          type: file.type,
        });
        checkDone();
      };
      reader.onerror = () => {
        checkDone();
      };
      reader.readAsDataURL(file);
    }

    // Reset input so same file can be selected again
    e.target.value = '';
  }, []);

  const handleCommand = useCallback((cmd: Command) => {
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '';
    }
    setShowCommands(false);

    switch (cmd.id) {
      case 'clear':
        clearConversation();
        break;
      case 'screenshot':
        sendMessage('/screenshot');
        break;
      case 'help': {
        const helpText = DEFAULT_COMMANDS.map(c => `/${c.id} \u2014 ${t(`cmd_${c.id}`)}`).join('\n');
        alert(helpText);
        break;
      }
      case 'settings':
        chrome.runtime.openOptionsPage();
        break;
      case 'tabs':
        sendMessage('/tabs');
        break;
      case 'status':
        sendMessage(`Current provider: ${activeProvider}, model: ${activeModel}, mode: ${permissionMode}`);
        break;
    }
  }, [clearConversation, sendMessage, activeProvider, activeModel, permissionMode]);

  const handleCommandsClose = useCallback(() => {
    setShowCommands(false);
  }, []);

  const canSend = text.trim().length > 0 || isStreaming;

  return (
    <div
      style={{
        padding: '0 12px 0',
        borderTop: '1px solid #DCD9CF',
        background: '#FBFAF5',
        flexShrink: 0,
      }}
    >
      {/* High risk banner */}
      {showHighRisk && (
        <div style={{ padding: '8px 0 0' }}>
          <HighRiskBanner onDismiss={() => setHighRiskDismissed(true)} />
        </div>
      )}

      {/* Input container */}
      <div
        className="ba-composer"
        style={{
          position: 'relative',
          marginTop: 8,
          background: '#FBFAF5',
          borderRadius: 14,
          border: '1px solid #DCD9CF',
          transition: 'box-shadow 0.15s',
        }}
      >
        {/* Commands menu */}
        {showCommands && (
          <CommandsMenu
            filter={text}
            commands={DEFAULT_COMMANDS}
            onSelect={handleCommand}
            onClose={handleCommandsClose}
          />
        )}
        {/* Image attachments preview */}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: 8, padding: '8px 12px 0', flexWrap: 'wrap' }}>
            {attachments.map((att) => (
              <div key={att.id} style={{ position: 'relative' }}>
                <img
                  src={att.dataUrl}
                  alt={att.name}
                  style={{
                    width: 60,
                    height: 60,
                    objectFit: 'cover',
                    borderRadius: 6,
                    border: '1px solid #DCD9CF',
                  }}
                />
                <button
                  onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    width: 18,
                    height: 18,
                    borderRadius: 6,
                    background: '#F3F0E7',
                    border: '1px solid #DCD9CF',
                    color: '#121517',
                    fontSize: 10,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                  }}
                  title={t('attach_remove')}
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea */}
        <div style={{ padding: '12px 12px 8px' }}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={hasMessages ? t('route_ask') : t('route_where')}
            rows={1}
            disabled={isStreaming}
            className="ba-composer-input"
            style={{
              width: '100%',
              background: 'none',
              border: 'none',
              color: '#121517',
              fontFamily: 'inherit',
              fontSize: 14,
              lineHeight: 1.5,
              resize: 'none',
              maxHeight: '50vh',
              padding: 0,
            }}
          />
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 12px 8px',
          }}
        >
          {/* Left: Permission toggle */}
          <PermissionToggle
            permissionMode={permissionMode}
            onChange={setPermissionMode}
            disabled={isStreaming}
          />

          {/* Right: buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* Actions menu */}
            {!isStreaming && (
              <ActionsMenu
                onScreenshot={handleScreenshot}
                onUpload={handleUpload}
                disabled={isStreaming}
              />
            )}

            {/* Stop / Send button */}
            {isStreaming ? (
              <button
                onClick={stopGeneration}
                className="ba-btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: 'none',
                  background: 'transparent',
                  color: '#5B6165',
                  cursor: 'pointer',
                }}
                title={t('input_stop')}
              >
                <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20Zm0,192a84,84,0,1,1,84-84A84.09,84.09,0,0,1,128,212Zm40-112v56a12,12,0,0,1-12,12H100a12,12,0,0,1-12-12V100a12,12,0,0,1,12-12h56A12,12,0,0,1,168,100Z" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!text.trim()}
                className="ba-send-btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: 'none',
                  background: isSkipMode ? '#C98A1E' : '#1E46E8',
                  color: '#FBFAF5',
                  cursor: text.trim() ? 'pointer' : 'default',
                  opacity: text.trim() ? 1 : 0.5,
                  transition: 'all 0.15s',
                }}
                title={t('input_send')}
              >
                <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M208.49,120.49a12,12,0,0,1-17,0L140,69V216a12,12,0,0,1-24,0V69L64.49,120.49a12,12,0,0,1-17-17l72-72a12,12,0,0,1,17,0l72,72A12,12,0,0,1,208.49,120.49Z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Disclaimer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '8px 0 10px',
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: '#5B6165',
            textDecoration: 'none',
            textAlign: 'center',
          }}
        >
          {t('disclaimer_route')}
        </span>
      </div>
      <div style={{ display: 'none' }} aria-hidden="true">{canSend ? '' : ''}</div>
    </div>
  );
}
