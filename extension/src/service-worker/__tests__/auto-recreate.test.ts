/**
 * Testes da recriação automática de grupo após destruição externa.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChromeMock, setupChromeMock, clearChromeMock } from './chrome-mock';

vi.mock('../message-router', () => ({
  registerMessageRouter: vi.fn(),
}));

vi.mock('../chat-handler', () => ({
  handleChatSend: vi.fn(),
}));

vi.mock('../chat-stream', () => ({
  handleChatStream: vi.fn(),
}));

describe('Auto-recreate after external destruction', () => {
  let mock: ChromeMock;

  beforeEach(() => {
    vi.resetModules();
    clearChromeMock();
    mock = new ChromeMock();
    setupChromeMock(mock);
  });

  it('creating a group and removing it leaves zero groups', async () => {
    mock.createTab({ id: 1, windowId: 1, url: 'https://site.com' });
    const { tabGroupManager } = await import('../tab-group');

    await tabGroupManager.createGroupWithTab('g1', 1);
    expect(mock.groups).toHaveLength(1);

    await mock.removeGroup(mock.groups[0].id);

    expect(mock.groups).toHaveLength(0);
  });

  it('ungrouping then recreating manually works', async () => {
    mock.createTab({ id: 1, windowId: 1, url: 'https://site.com' });
    const { tabGroupManager } = await import('../tab-group');

    await tabGroupManager.createGroupWithTab('g1', 1);
    await mock.removeGroup(mock.groups[0].id);

    expect(mock.groups).toHaveLength(0);

    // Simula o que tryRecreateGroupAfterRemoval fazia
    await tabGroupManager.createGroupWithTab('BrowserAgent — site.com', 1);

    expect(mock.groups).toHaveLength(1);
    expect(mock.tabs[0].groupId).toBe(mock.groups[0].id);
  });

  it('auto-recreates group when side panel is open and group is removed externally', async () => {
    mock.createTab({ id: 1, windowId: 1, url: 'https://site.com' });

    // Import index to register event listeners
    await import('../index');
    const { tabGroupManager } = await import('../tab-group');

    await tabGroupManager.createGroupWithTab('g1', 1);
    expect(mock.groups).toHaveLength(1);
    const originalGroupId = mock.groups[0].id;

    // Simulate side panel opening by connecting a port
    const port = chrome.runtime.connect({ name: 'side-panel' });

    // Remove the group externally
    await mock.removeGroup(originalGroupId);

    // Should have auto-recreated
    expect(mock.groups).toHaveLength(1);
    expect(tabGroupManager.getGroupId()).not.toBeNull();
    expect(mock.tabs[0].groupId).toBe(mock.groups[0].id);

    port.disconnect();
  });

  it('does NOT auto-recreate when side panel is closed', async () => {
    mock.createTab({ id: 1, windowId: 1, url: 'https://site.com' });

    await import('../index');
    const { tabGroupManager } = await import('../tab-group');

    await tabGroupManager.createGroupWithTab('g1', 1);
    expect(mock.groups).toHaveLength(1);

    // Side panel is NOT open — do not connect a port

    await mock.removeGroup(mock.groups[0].id);

    // Should remain zero
    expect(mock.groups).toHaveLength(0);
    expect(tabGroupManager.getGroupId()).toBeNull();
  });

  it('does NOT auto-recreate when group is closed intentionally via closeGroup()', async () => {
    mock.createTab({ id: 1, windowId: 1, url: 'https://site.com' });

    await import('../index');
    const { tabGroupManager } = await import('../tab-group');

    await tabGroupManager.createGroupWithTab('g1', 1);
    expect(mock.groups).toHaveLength(1);

    // Simulate side panel open
    const port = chrome.runtime.connect({ name: 'side-panel' });

    // Close intentionally
    await tabGroupManager.closeGroup();

    // Should remain zero because removal was intentional
    expect(mock.groups).toHaveLength(0);
    expect(tabGroupManager.getGroupId()).toBeNull();

    port.disconnect();
  });

  it('supports chrome://newtab/ for auto-recreate', async () => {
    mock.createTab({ id: 1, windowId: 1, url: 'chrome://newtab/' });

    await import('../index');
    const { tabGroupManager } = await import('../tab-group');

    await tabGroupManager.createGroupWithTab('g1', 1);
    expect(mock.groups).toHaveLength(1);

    const port = chrome.runtime.connect({ name: 'side-panel' });

    await mock.removeGroup(mock.groups[0].id);

    // Should auto-recreate even with chrome://newtab/
    expect(mock.groups).toHaveLength(1);
    expect(tabGroupManager.getGroupId()).not.toBeNull();

    port.disconnect();
  });
});
