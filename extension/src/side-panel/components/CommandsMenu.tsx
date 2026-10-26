import React, { useState, useEffect, useRef } from 'react';
import { t } from '../../utils/i18n';

export interface Command {
  id: string;
  label: string;
  icon: string;
  description: string;
  action: () => void;
}

export const DEFAULT_COMMANDS: Command[] = [
  { id: 'clear', label: 'Clear conversation', icon: '', description: 'Clear all messages', action: () => {} },
  { id: 'screenshot', label: 'Take screenshot', icon: '', description: 'Capture current page', action: () => {} },
  { id: 'help', label: 'Show commands', icon: '', description: 'List all available commands', action: () => {} },
  { id: 'settings', label: 'Open settings', icon: '', description: 'Open extension options', action: () => {} },
  { id: 'tabs', label: 'Show tabs', icon: '', description: 'Show current tab context', action: () => {} },
  { id: 'status', label: 'Show status', icon: '', description: 'Show current provider and mode', action: () => {} },
];

interface CommandsMenuProps {
  filter: string;
  commands: Command[];
  onSelect: (command: Command) => void;
  onClose: () => void;
}

export function CommandsMenu({ filter, commands, onSelect, onClose }: CommandsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const query = filter.slice(1).toLowerCase();

  const filtered = React.useMemo(() =>
    commands.filter(cmd =>
      cmd.id.includes(query) || cmd.label.toLowerCase().includes(query)
    ),
    [commands, query]
  );

  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // Register event handlers (always called — hooks rule compliant)
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Guard: don't handle if no items
      if (filtered.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [filtered, selectedIndex, onSelect, onClose]);

  // Don't render if no items match
  if (filtered.length === 0) return null;

  const menuStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    marginBottom: 4,
    background: '#FBFAF5',
    border: '1px solid #DCD9CF',
    borderRadius: 6,
    padding: 6,
    boxShadow: '0 18px 40px rgba(18, 21, 23, 0.14)',
    zIndex: 100,
    maxHeight: 240,
    overflowY: 'auto',
  };

  return (
    <div ref={menuRef} style={menuStyle} tabIndex={-1} className="ba-menu">
      {filtered.map((cmd, i) => (
        <button
          key={cmd.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
            color: '#121517',
            background: i === selectedIndex ? '#DCE4FF' : 'transparent',
            border: 'none',
            width: '100%',
            textAlign: 'left' as const,
            fontFamily: 'inherit',
          }}
          onMouseEnter={() => setSelectedIndex(i)}
          onClick={() => { onSelect(cmd); onClose(); }}
        >
          <div>
            <div style={{ fontWeight: 500 }}>/{cmd.id}</div>
            <div style={{ fontSize: 11, color: '#5B6165' }}>{t(`cmd_${cmd.id}`)}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
