/* ─── Site-level Permission Manager ──────────────────────────── */

export type PermissionMode = 'follow_a_plan' | 'skip_all_permission_checks';

export interface PermissionStore {
  allowlist: string[];
  denylist: string[];
  sessionAllow: string[];
}

export interface DomainPermissionState {
  allowed: boolean;
  allowForAllChats: boolean;
  lastAction: string;
  timestamp: number;
}

export interface PermissionCheckResult {
  allowed: boolean;
  requiresPrompt: boolean;
  reason?: string;
  details?: {
    mode: PermissionMode;
    inAllowlist: boolean;
    inDenylist: boolean;
  };
}

/**
 * Extract hostname from a URL. Returns null for non-http(s) schemes
 * and edge cases like about:blank, chrome://newtab, etc.
 */
export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.hostname;
  } catch {
    return null;
  }
}

const PERMISSION_STORE_KEY = 'ba-site-permissions';
const DOMAIN_STORE_KEY = 'ba-domain-permissions';
const MODE_KEY = 'ba-permission-mode';

export class PermissionManager {
  /**
   * Check if a tool is allowed on a given domain.
   * Returns { allowed, requiresPrompt, reason, details }.
   */
  async check(domain: string, toolName: string): Promise<PermissionCheckResult> {
    // 1. Check global permission mode
    const modeResult = await chrome.storage.local.get(MODE_KEY);
    const mode: PermissionMode = modeResult[MODE_KEY] || 'follow_a_plan';

    if (mode === 'skip_all_permission_checks') {
      return {
        allowed: true,
        requiresPrompt: false,
        reason: 'mode_skip_all',
        details: { mode, inAllowlist: false, inDenylist: false },
      };
    }

    // 2. Load site permissions
    const storeResult = await chrome.storage.local.get(PERMISSION_STORE_KEY);
    const store: PermissionStore = storeResult[PERMISSION_STORE_KEY] || {
      allowlist: [],
      denylist: [],
      sessionAllow: [],
    };

    const inDenylist = store.denylist.includes(domain);
    const inAllowlist = store.allowlist.includes(domain);
    const inSession = store.sessionAllow.includes(domain);

    // 3. Check denylist first
    if (inDenylist) {
      return {
        allowed: false,
        requiresPrompt: false,
        reason: 'blocked',
        details: { mode, inAllowlist: false, inDenylist: true },
      };
    }

    // 4. Check allowlist (including session)
    if (inAllowlist || inSession) {
      return {
        allowed: true,
        requiresPrompt: false,
        reason: inAllowlist ? 'allowlist' : 'session',
        details: { mode, inAllowlist, inDenylist: false },
      };
    }

    // 5. Domain not in any list → needs prompt
    return {
      allowed: false,
      requiresPrompt: true,
      reason: 'not_listed',
      details: { mode, inAllowlist: false, inDenylist: false },
    };
  }

  /**
   * Allow a domain permanently (for all chats) or for current session only.
   */
  async allow(domain: string, forAllChats: boolean): Promise<void> {
    const storeResult = await chrome.storage.local.get(PERMISSION_STORE_KEY);
    const store: PermissionStore = storeResult[PERMISSION_STORE_KEY] || {
      allowlist: [],
      denylist: [],
      sessionAllow: [],
    };

    if (forAllChats) {
      if (!store.allowlist.includes(domain)) {
        store.allowlist.push(domain);
      }
      // Remove from session if promoting to permanent
      store.sessionAllow = store.sessionAllow.filter(d => d !== domain);
      // Remove from denylist if was blocked
      store.denylist = store.denylist.filter(d => d !== domain);
    } else {
      if (!store.sessionAllow.includes(domain)) {
        store.sessionAllow.push(domain);
      }
    }

    await chrome.storage.local.set({ [PERMISSION_STORE_KEY]: store });

    // Update domain state
    await this._updateDomainState(domain, true, forAllChats, 'allow');
  }

  /**
   * Deny/block a domain permanently.
   */
  async deny(domain: string): Promise<void> {
    const storeResult = await chrome.storage.local.get(PERMISSION_STORE_KEY);
    const store: PermissionStore = storeResult[PERMISSION_STORE_KEY] || {
      allowlist: [],
      denylist: [],
      sessionAllow: [],
    };

    if (!store.denylist.includes(domain)) {
      store.denylist.push(domain);
    }
    // Remove from allowlists
    store.allowlist = store.allowlist.filter(d => d !== domain);
    store.sessionAllow = store.sessionAllow.filter(d => d !== domain);

    await chrome.storage.local.set({ [PERMISSION_STORE_KEY]: store });

    // Update domain state
    await this._updateDomainState(domain, false, false, 'deny');
  }

  /**
   * Clear session-only permissions.
   */
  async clearSession(): Promise<void> {
    const storeResult = await chrome.storage.local.get(PERMISSION_STORE_KEY);
    const store: PermissionStore = storeResult[PERMISSION_STORE_KEY] || {
      allowlist: [],
      denylist: [],
      sessionAllow: [],
    };
    store.sessionAllow = [];
    await chrome.storage.local.set({ [PERMISSION_STORE_KEY]: store });
  }

  /**
   * Get current permission state for a domain.
   */
  async getDomainState(domain: string): Promise<DomainPermissionState | null> {
    const result = await chrome.storage.local.get(DOMAIN_STORE_KEY);
    const domainPerms: Record<string, DomainPermissionState> = result[DOMAIN_STORE_KEY] || {};
    return domainPerms[domain] || null;
  }

  // ── Private helpers ────────────────────────────────────────

  private async _updateDomainState(
    domain: string,
    allowed: boolean,
    allowForAllChats: boolean,
    lastAction: string,
  ): Promise<void> {
    const result = await chrome.storage.local.get(DOMAIN_STORE_KEY);
    const domainPerms: Record<string, DomainPermissionState> = result[DOMAIN_STORE_KEY] || {};
    domainPerms[domain] = {
      allowed,
      allowForAllChats,
      lastAction,
      timestamp: Date.now(),
    };
    await chrome.storage.local.set({ [DOMAIN_STORE_KEY]: domainPerms });
  }
}

/** Singleton instance */
export const permissionManager = new PermissionManager();
