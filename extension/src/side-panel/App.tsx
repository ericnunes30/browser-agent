import React, { useCallback, useEffect, useRef, useState } from 'react';
import Header from './components/Header';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import { ChatProvider, useChat } from './ChatContext';
import { PermissionPrompt } from './components/PermissionPrompt';
import { TaskManager } from './components/TaskManager';

function AppInner() {
  const { pendingPermission, respondPermission, hasNewModels, reloadModels } = useChat();
  const [showSettings, setShowSettings] = useState(false);
  const [showTasks, setShowTasks] = useState(false);

  const handleSettingsClick = useCallback(() => {
    setShowSettings((prev) => !prev);
    if (showSettings) {
      chrome.runtime.openOptionsPage?.();
    }
  }, [showSettings]);

  const handleTasksClick = useCallback(() => {
    setShowTasks((prev) => !prev);
  }, []);

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: 'var(--color-bg-100)',
        }}
      >
        <Header 
          onSettingsClick={handleSettingsClick} 
          onTasksClick={handleTasksClick}
          hasNewModels={hasNewModels}
          onReloadModels={reloadModels}
        />
        <ChatWindow />
        <ChatInput />
      </div>
      <PermissionPrompt
        request={pendingPermission}
        onResponse={respondPermission}
        onDismiss={() => {/* dismissed - no action needed */}}
      />
      {showTasks && <TaskManager onClose={() => setShowTasks(false)} />}
    </>
  );
}

export default function App() {
  return (
    <ChatProvider>
      <AppInner />
    </ChatProvider>
  );
}
