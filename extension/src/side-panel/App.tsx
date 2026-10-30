import React, { useCallback, useEffect, useRef, useState } from 'react';
import Header from './components/Header';
import { BridgePanel } from './components/BridgePanel';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import { ChatProvider, useChat } from './ChatContext';
import { PermissionPrompt } from './components/PermissionPrompt';
import { TaskManager } from './components/TaskManager';
import { ContinuePrompt } from './components/ContinuePrompt';
import { t } from '../utils/i18n';

function AppInner() {
  const { pendingPermission, respondPermission, hasNewModels, reloadModels, routeStatus, routePausedStep, routeTotalSteps } = useChat();
  const [showSettings, setShowSettings] = useState(false);
  const [showTasks, setShowTasks] = useState(false);

  // Keep a persistent port open so the service worker knows the side panel is alive
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'side-panel' });
    return () => {
      port.disconnect();
    };
  }, []);

  const handleSettingsClick = useCallback(() => {
    setShowSettings((prev) => !prev);
    if (showSettings) {
      chrome.runtime.openOptionsPage?.();
    }
  }, [showSettings]);

  const handleTasksClick = useCallback(() => {
    setShowTasks((prev) => !prev);
  }, []);

  const routeLabel = routeTotalSteps > 0
    ? routeTotalSteps === 1
      ? t('route_steps_one')
      : t('route_steps_other', String(routeTotalSteps))
    : t('route_title');
  const pausedLabel = routePausedStep !== null ? t('route_paused', String(routePausedStep)) : null;

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: '#FBFAF5',
        }}
        data-route-status={routeStatus}
        data-route-steps={routeTotalSteps}
      >
        <Header
          onSettingsClick={handleSettingsClick}
          onTasksClick={handleTasksClick}
          hasNewModels={hasNewModels}
          onReloadModels={reloadModels}
        />
        <BridgePanel />
        <span
          aria-live="polite"
          data-testid="ba-route-status"
          data-route-status={routeStatus}
          style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
        >
          {routeStatus === 'paused' && pausedLabel ? pausedLabel : routeLabel}
        </span>
        <ChatWindow />
        <ChatInput />
      </div>
      <PermissionPrompt
        request={pendingPermission}
        onResponse={respondPermission}
        onDismiss={() => {/* dismissed - no action needed */}}
      />
      <ContinuePrompt />
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
