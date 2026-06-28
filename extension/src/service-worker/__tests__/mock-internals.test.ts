import { describe, it, expect } from 'vitest';
import { ChromeMock } from './chrome-mock';

describe('ChromeMock internals', () => {
  it('removeTab removes the group when it was the last tab', async () => {
    const mock = new ChromeMock();
    mock.createTab({ id: 1, windowId: 1, url: 'https://x.com' });
    mock.createGroup('g1', [1]);
    expect(mock.groups).toHaveLength(1);
    expect(mock.tabs[0].groupId).toBe(1);

    await mock.removeTab(1);
    expect(mock.tabs).toHaveLength(0);
    expect(mock.groups).toHaveLength(0);
  });

  it('closeWindow removes all tabs and their groups', async () => {
    const mock = new ChromeMock();
    mock.createTab({ id: 1, windowId: 2, url: 'https://x.com' });
    mock.windows.push({ id: 2, focused: true });
    mock.createGroup('g1', [1]);

    expect(mock.groups).toHaveLength(1);
    await mock.closeWindow(2);
    expect(mock.tabs).toHaveLength(0);
    expect(mock.groups).toHaveLength(0);
  });
});
