/* ------------------------------------------------------------------ */
/*  Options Configuration — global extension settings                  */
/* ------------------------------------------------------------------ */

/** Storage key for the user-configurable max tool iterations. */
export const MAX_TOOL_ITERATIONS_KEY = 'ba-max-tool-iterations';

/** Default value if user has not set a custom value. */
export const DEFAULT_MAX_TOOL_ITERATIONS = 30;

/** Minimum allowed value (prevents degenerate cases). */
export const MIN_MAX_TOOL_ITERATIONS = 1;

/** Maximum allowed value (prevents runaway loops). */
export const MAX_MAX_TOOL_ITERATIONS = 100;

export interface ExtensionOptions {
  maxToolIterations: number;
}

/**
 * Read the extension options from chrome.storage.local.
 * Falls back to defaults if not set or invalid.
 */
export async function loadOptions(): Promise<ExtensionOptions> {
  try {
    const result = await chrome.storage.local.get(MAX_TOOL_ITERATIONS_KEY);
    const raw = result[MAX_TOOL_ITERATIONS_KEY];
    const parsed = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    const maxToolIterations = Number.isFinite(parsed)
      ? Math.min(MAX_MAX_TOOL_ITERATIONS, Math.max(MIN_MAX_TOOL_ITERATIONS, parsed))
      : DEFAULT_MAX_TOOL_ITERATIONS;
    return { maxToolIterations };
  } catch {
    return { maxToolIterations: DEFAULT_MAX_TOOL_ITERATIONS };
  }
}

/**
 * Persist the extension options to chrome.storage.local.
 */
export async function saveOptions(options: Partial<ExtensionOptions>): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (options.maxToolIterations !== undefined) {
    const value = Math.min(
      MAX_MAX_TOOL_ITERATIONS,
      Math.max(MIN_MAX_TOOL_ITERATIONS, Math.floor(options.maxToolIterations)),
    );
    updates[MAX_TOOL_ITERATIONS_KEY] = value;
  }
  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}
