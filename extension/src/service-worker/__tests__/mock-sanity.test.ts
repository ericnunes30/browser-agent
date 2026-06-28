import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChromeMock, setupChromeMock, clearChromeMock } from './chrome-mock';

describe('Chrome mock sanity', () => {
  it('chrome.alarms exists after setup', () => {
    const mock = new ChromeMock();
    setupChromeMock(mock);
    expect((globalThis as any).chrome).toBeDefined();
    expect((globalThis as any).chrome.alarms).toBeDefined();
    expect((globalThis as any).chrome.alarms.onAlarm).toBeDefined();
    clearChromeMock();
  });

  it('importing scheduled-tasks with mock does not throw', async () => {
    const mock = new ChromeMock();
    setupChromeMock(mock);
    // Reset module cache
    vi.resetModules();
    // Import a file that has module-level chrome.* usage
    await import('../scheduled-tasks');
    expect(true).toBe(true);
    clearChromeMock();
  });
});
