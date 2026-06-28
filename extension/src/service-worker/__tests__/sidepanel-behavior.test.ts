/**
 * Testes de comportamento do Service Worker — testa funções isoladamente.
 * Para testar o fluxo completo no navegador real, use:
 *   scripts/diagnose-sidepanel.js  (cole no console do Service Worker)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChromeMock, setupChromeMock, clearChromeMock } from './chrome-mock';

// ─── Mocks de módulos dependentes ──────────────────────────────────

vi.mock('../message-router', () => ({
  registerMessageRouter: vi.fn(),
}));

vi.mock('../chat-handler', () => ({
  handleChatSend: vi.fn(),
}));

vi.mock('../chat-stream', () => ({
  handleChatStream: vi.fn(),
}));

// ─── Testes do TabGroupManager ─────────────────────────────────────

describe('TabGroupManager', () => {
  let mock: ChromeMock;

  beforeEach(() => {
    clearChromeMock();
    mock = new ChromeMock();
    setupChromeMock(mock);
  });

  it('creates a group with a tab', async () => {
    mock.createTab({ id: 1, windowId: 1, url: 'https://example.com' });
    const { tabGroupManager } = await import('../tab-group');

    await tabGroupManager.createGroupWithTab('BrowserAgent — example.com', 1);

    expect(mock.groups).toHaveLength(1);
    expect(mock.groups[0].title).toBe('BrowserAgent — example.com');
    expect(mock.tabs[0].groupId).toBe(mock.groups[0].id);
  });

  it('adopts another tab into the existing group', async () => {
    mock.createTab({ id: 1, windowId: 1, url: 'https://a.com' });
    mock.createTab({ id: 2, windowId: 1, url: 'https://b.com' });
    const { tabGroupManager } = await import('../tab-group');

    await tabGroupManager.createGroupWithTab('g1', 1);
    const groupId = mock.groups[0].id;

    await tabGroupManager.adoptTab(2);
    expect(mock.tabs[1].groupId).toBe(groupId);
  });

  it('closes the group and removes tabs', async () => {
    mock.createTab({ id: 1, windowId: 1, url: 'https://x.com' });
    const { tabGroupManager } = await import('../tab-group');

    await tabGroupManager.createGroupWithTab('g1', 1);
    await tabGroupManager.closeGroup();

    expect(tabGroupManager.getGroupId()).toBeNull();
    expect(mock.tabs).toHaveLength(0);
  });
});

// ─── Testes do ChromeMock (infraestrutura) ─────────────────────────

describe('ChromeMock infrastructure', () => {
  it('removeTab removes the group when it was the last tab', async () => {
    const mock = new ChromeMock();
    mock.createTab({ id: 1, windowId: 1, url: 'https://x.com' });
    mock.createGroup('g1', [1]);
    expect(mock.groups).toHaveLength(1);

    await mock.removeTab(1);
    expect(mock.tabs).toHaveLength(0);
    expect(mock.groups).toHaveLength(0);
  });

  it('closeWindow removes all tabs and their groups', async () => {
    const mock = new ChromeMock();
    mock.createTab({ id: 1, windowId: 2, url: 'https://x.com' });
    mock.windows.push({ id: 2, focused: true });
    mock.createGroup('g1', [1]);

    await mock.closeWindow(2);
    expect(mock.tabs).toHaveLength(0);
    expect(mock.groups).toHaveLength(0);
  });

  it('sidePanel.open tracks calls and can fire onOpened manually', async () => {
    const mock = new ChromeMock();
    setupChromeMock(mock);

    let fired = false;
    (chrome.sidePanel as any).onOpened.addListener(() => { fired = true; });

    await chrome.sidePanel.open({ windowId: 1 });
    expect(mock.sidePanelOpenCalls).toHaveLength(1);
    expect(fired).toBe(false); // manual fire required

    await mock.fireSidePanelOpened();
    expect(fired).toBe(true);
  });
});
