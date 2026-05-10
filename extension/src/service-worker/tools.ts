/* ------------------------------------------------------------------ */
/*  Tool definitions & executor — Claude extension format             */
/* ------------------------------------------------------------------ */
import { permissionManager, extractDomain } from './permissions';
import { tabGroupManager } from './tab-group';
import { debuggerManager } from './debugger-session';

import type {
  ToolDefinition,
  ToolCall,
  ToolResult,
  ComputerToolInput,
  NavigateToolInput,
  JavaScriptToolInput,
  FileUploadToolInput,
  GetPageTextToolInput,
  ReadConsoleToolInput,
  ReadNetworkToolInput,
  ResizeWindowToolInput,
  BatchToolInput,
  ScreenshotResult,
  WebSearchInput,
  WebFetchInput,
  SearchProviderConfig,
  FileDownloadInput,
  ReadFileInput,
  CreateFileInput,
  EditFileInput,
} from './providers/types';

/* ================================================================== */
/*  Tool Definitions (schemas sent to the LLM)                         */
/* ================================================================== */

const COMPUTER_ACTIONS = [
  'click', 'fill', 'type', 'keypress',
  'scroll', 'wait', 'screenshot',
] as const;

const RES_W = 1280;
const RES_H = 720;

export const COMPUTER_TOOL: ToolDefinition = {
  name: 'computer',
  description: [
    'Interact with a web browser: click elements, type text, press keys, scroll, and take screenshots.',
    "If you don't have a valid tab ID, use tabs_context first to get available tabs.",
    `* The screen's resolution is ${RES_W}x${RES_H}.`,
    '* To find elements and their UIDs, use the take_snapshot tool FIRST — it generates a tree of page elements with uid=xxx identifiers.',
    '* Always call take_snapshot before using click or fill actions to discover available elements.',
    '* Available actions:',
    '  - click: click an element by uid (e.g. uid="uid_1_5"). The uid comes from take_snapshot.',
    '  - fill: type text into a form element by uid (e.g. fill uid="uid_1_5" with text="hello"). Focuses + fills + dispatches input event.',
    '  - type: type text into the currently focused element (no uid needed).',
    '  - keypress: press keyboard keys like Enter, Tab, Escape, ArrowDown, etc. Use keys array, e.g. keys: ["Enter"]',
    '  - scroll: scroll by dx, dy pixels',
    '  - wait: wait for duration ms',
    '  - screenshot: capture a screenshot of the tab',
    '* After typing text with type or fill action, use keypress action with keys: ["Enter"] to submit forms / send messages.',
    '* You do NOT need to use pixel coordinates — all element interaction is done via uid from the snapshot.',
  ].join('\n'),
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'The browser action to perform',
        enum: [...COMPUTER_ACTIONS],
      },
      uid: {
        type: 'string',
        description: 'Element uid from take_snapshot — used with click and fill actions. Example: "uid_1_5"',
      },
      text: {
        type: 'string',
        description: 'Text to type — used with type and fill actions.',
      },
      keys: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of keyboard keys to press (e.g. ["Enter"], ["Control", "c"]). Used with keypress action.',
      },
      scroll_distance: {
        type: 'array',
        items: { type: 'number' },
        minItems: 2,
        maxItems: 2,
        description: '[dx, dy] pixels to scroll.',
      },
      duration: {
        type: 'number',
        description: 'Wait duration in milliseconds — used with the wait action.',
      },
      tabId: {
        type: 'number',
        description: 'Tab ID to act on.',
      },
    },
    required: ['action', 'tabId'],
  },
};

export const SNAPSHOT_TOOL: ToolDefinition = {
  name: 'take_snapshot',
  description: [
    'Take a text-based snapshot of the current page based on the DOM accessibility tree.',
    'Returns a hierarchical listing of visible interactive elements with uid=xxx identifiers.',
    'Use these uids with the computer tool\'s click and fill actions to interact with elements.',
    'Always take a fresh snapshot before each interaction to ensure uids are up-to-date.',
  ].join('\n'),
  input_schema: {
    type: 'object',
    properties: {
      tabId: {
        type: 'number',
        description: 'Tab ID to snapshot.',
      },
    },
    required: ['tabId'],
  },
};

export const NAVIGATE_TOOL: ToolDefinition = {
  name: 'navigate',
  description: 'Navigate to a URL, or go forward/back in browser history. If no tabId is provided, uses the currently active tab. After navigating, always take a screenshot (computer action:screenshot) or take_snapshot to see the page content and continue the task.',
  input_schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to navigate to (e.g. https://example.com).',
      },
      direction: {
        type: 'string',
        enum: ['forward', 'back'],
        description: 'Navigate forward or backward in browser history.',
      },
      tabId: {
        type: 'number',
        description: 'Tab ID to act on.',
      },
    },
  },
};

export const JAVASCRIPT_TOOL: ToolDefinition = {
  name: 'javascript_tool',
  description: [
    'Execute JavaScript code in the context of the current page.',
    'The code runs in the page\'s context and can interact with the DOM, window object, and page variables.',
    'Returns the result of the last expression or any thrown errors.',
    "If you don't have a valid tab ID, use tabs_context first to get available tabs.",
  ].join(' '),
  input_schema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'JavaScript code to execute in the page context.',
      },
      tabId: {
        type: 'number',
        description: 'Tab ID to act on.',
      },
    },
    required: ['code', 'tabId'],
  },
};

export const FILE_UPLOAD_TOOL: ToolDefinition = {
  name: 'file_upload',
  description: [
    'Upload one or multiple files from the local filesystem to a file input element on the page.',
    'Do not click on file upload buttons or file inputs — clicking opens a native file picker dialog that you cannot see or interact with.',
    'Instead, use take_snapshot to find the file input element, then use this tool with its uid to upload files directly.',
    'The paths must be absolute file paths on the local machine.',
  ].join(' '),
  input_schema: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'Element uid (file input) from take_snapshot.',
      },
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Absolute file paths on the local machine.',
      },
      tabId: {
        type: 'number',
        description: 'Tab ID to act on.',
      },
    },
    required: ['uid', 'paths', 'tabId'],
  },
};

export const GET_PAGE_TEXT_TOOL: ToolDefinition = {
  name: 'get_page_text',
  description: [
    'Extract raw text content from the page, prioritizing article content.',
    'Ideal for reading articles, blog posts, or other text-heavy pages.',
    'Returns plain text without HTML formatting.',
    "If you don't have a valid tab ID, use tabs_context first to get available tabs.",
    'Output is limited to 50000 characters by default.',
  ].join(' '),
  input_schema: {
    type: 'object',
    properties: {
      tabId: {
        type: 'number',
        description: 'Tab ID to act on.',
      },
    },
    required: ['tabId'],
  },
};

export const READ_CONSOLE_TOOL: ToolDefinition = {
  name: 'read_console_messages',
  description: [
    'Read browser console messages (console.log, console.error, console.warn, etc.) from a specific tab.',
    'Useful for debugging JavaScript errors, viewing application logs, or understanding what\'s happening in the browser console.',
    'Returns console messages from the current domain only.',
    "If you don't have a valid tab ID, use tabs_context first to get available tabs.",
    'IMPORTANT: Always provide a pattern to filter messages — without a pattern, you may get too many irrelevant messages.',
  ].join(' '),
  input_schema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Filter pattern to narrow console messages.',
      },
      tabId: {
        type: 'number',
        description: 'Tab ID to act on.',
      },
    },
    required: ['tabId'],
  },
};

export const READ_NETWORK_TOOL: ToolDefinition = {
  name: 'read_network_requests',
  description: [
    'Read HTTP network requests (XHR, Fetch, documents, images, etc.) from a specific tab.',
    'Useful for debugging API calls, monitoring network activity, or understanding what requests a page is making.',
    'Returns all network requests made by the current page, including cross-origin requests.',
    'Requests are automatically cleared when the page navigates to a different domain.',
    "If you don't have a valid tab ID, use tabs_context first to get available tabs.",
  ].join(' '),
  input_schema: {
    type: 'object',
    properties: {
      tabId: {
        type: 'number',
        description: 'Tab ID to act on.',
      },
    },
    required: ['tabId'],
  },
};

export const RESIZE_WINDOW_TOOL: ToolDefinition = {
  name: 'resize_window',
  description: [
    'Resize the current browser window to specified dimensions.',
    'Useful for testing responsive designs or setting up specific screen sizes.',
    "If you don't have a valid tab ID, use tabs_context first to get available tabs.",
  ].join(' '),
  input_schema: {
    type: 'object',
    properties: {
      width: { type: 'integer', description: 'New window width in pixels.' },
      height: { type: 'integer', description: 'New window height in pixels.' },
      tabId: {
        type: 'number',
        description: 'Tab ID to act on.',
      },
    },
    required: ['width', 'height', 'tabId'],
  },
};

export const TABS_CONTEXT_TOOL: ToolDefinition = {
  name: 'tabs_context',
  description: 'Get context information (id, url, title) about all available tabs. Use the returned tab IDs as the tabId parameter in other tools like navigate, computer, take_snapshot.',
  input_schema: {
    type: 'object',
    properties: {},
  },
};

export const TABS_CREATE_TOOL: ToolDefinition = {
  name: 'tabs_create',
  description: 'Creates a new tab (and optionally navigates to a URL). After creating a tab, always follow up with navigate, screenshot, or take_snapshot to interact with it. Prefer tabs_create with a URL directly instead of creating an empty tab and then navigating separately.',
  input_schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'Optional URL to open in the new tab.',
      },
    },
  },
};

export const BROWSER_BATCH_TOOL: ToolDefinition = {
  name: 'browser_batch',
  description: [
    'Execute a sequence of browser tool calls in ONE round trip.',
    'Each item is {name, input} where input is exactly what you\'d pass to that tool standalone.',
    'Actions execute SEQUENTIALLY (not in parallel) and stop on the first error.',
    'Use this tool extensively to quickly execute work whenever you can predict two or more steps ahead — e.g. navigate, click a field, type, press Return, screenshot.',
    'Each tool\'s own permission check runs per item — if an action navigates to a domain without permission, the next item\'s check fails and the batch stops.',
    'Screenshots and other images are returned interleaved with outputs; coordinates you write in THIS batch refer to the screenshot taken BEFORE this call.',
    'browser_batch cannot be nested.',
  ].join(' '),
  input_schema: {
    type: 'object',
    properties: {
      actions: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Tool name (e.g. computer, navigate, take_snapshot, tabs_create). browser_batch cannot be nested.',
            },
            input: {
              type: 'object',
              description: 'That tool\'s input — same shape you\'d pass when calling it directly.',
            },
          },
          required: ['name', 'input'],
        },
        description: 'List of tool calls to execute sequentially. Example: [{"name":"computer","input":{"action":"left_click","coordinate":[100,200],"tabId":123}}, {"name":"computer","input":{"action":"type","text":"hello","tabId":123}}, {"name":"navigate","input":{"url":"https://example.com","tabId":123}}]',
      },
    },
    required: ['actions'],
  },
};

export const WEB_SEARCH_TOOL: ToolDefinition = {
  name: 'web_search',
  description: 'Search the web for information using a configured search engine (SearXNG, Google, etc.). Returns a list of formatted results with titles, URLs, and snippets.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query.' },
      count: { type: 'integer', description: 'Number of results to return (default: 5, max: 20).' },
    },
    required: ['query'],
  },
};

export const WEB_FETCH_TOOL: ToolDefinition = {
  name: 'web_fetch',
  description: 'Fetch and extract content from a URL. Returns plain text from HTML pages (prioritizing article/main content) or raw text for JSON/XML responses.',
  input_schema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch.' },
      maxChars: { type: 'integer', description: 'Maximum characters to return (default: 50000, max: 100000).' },
    },
    required: ['url'],
  },
};


/* ================================================================== */
/*  File Tool Definitions                                               */
/* ================================================================== */

export const FILE_DOWNLOAD_TOOL: ToolDefinition = {
  name: 'download',
  description: "Download a file from a URL to the user's Downloads folder",
  input_schema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL of the file to download' },
      filename: { type: 'string', description: 'Optional filename (default: from URL)' },
    },
    required: ['url'],
  },
};

export const READ_FILE_TOOL: ToolDefinition = {
  name: 'read_file',
  description: 'Read the contents of a text file. Opens a file picker for the user to select the file.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Reference path or filename' },
      encoding: { type: 'string', enum: ['utf-8', 'base64'], description: 'File encoding (default: utf-8)' },
    },
    required: ['path'],
  },
};

export const CREATE_FILE_TOOL: ToolDefinition = {
  name: 'create_file',
  description: 'Create a new file with the specified content. Opens a save file picker.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Suggested filename' },
      content: { type: 'string', description: 'File content' },
    },
    required: ['path', 'content'],
  },
};

export const EDIT_FILE_TOOL: ToolDefinition = {
  name: 'edit_file',
  description: 'Edit an existing file by replacing text. Opens a file picker.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Reference path' },
      oldText: { type: 'string', description: 'Text to find and replace' },
      newText: { type: 'string', description: 'Replacement text' },
    },
    required: ['path', 'oldText', 'newText'],
  },
};

/** All tools available to the LLM */
export const ALL_TOOLS: ToolDefinition[] = [
  COMPUTER_TOOL,
  SNAPSHOT_TOOL,
  NAVIGATE_TOOL,
  BROWSER_BATCH_TOOL,
  JAVASCRIPT_TOOL,
  FILE_UPLOAD_TOOL,
  GET_PAGE_TEXT_TOOL,
  READ_CONSOLE_TOOL,
  READ_NETWORK_TOOL,
  RESIZE_WINDOW_TOOL,
  TABS_CONTEXT_TOOL,
  TABS_CREATE_TOOL,
  WEB_SEARCH_TOOL,
  WEB_FETCH_TOOL,
  FILE_DOWNLOAD_TOOL,
  READ_FILE_TOOL,
  CREATE_FILE_TOOL,
  EDIT_FILE_TOOL,
];

/* ================================================================== */
/*  Tool Executor                                                      */
/* ================================================================== */

/**
 * Execute a single tool call against a browser tab.
 * For the computer tool with sub-actions, we use chrome.debugger
 * and chrome.scripting depending on the action.
 */
/**
 * Inject and execute JS in the page's main world via CDP Runtime.evaluate.
 */
async function injectScript(
  tabId: number,
  script: string,
): Promise<unknown> {
  return debuggerManager.evaluate(tabId, script);
}

/**
 * Generate a DOM accessibility snapshot by injecting JS into the page.
 * Returns a YAML-like tree with uid=xxx identifiers for each element.
 */
const SNAPSHOT_SCRIPT = `
(function() {
  const MAP = '__baElementMap';
  const COUNTER = '__baCounter';
  
  try {
    window[MAP] = window[MAP] || new Map();
    window[COUNTER] = (window[COUNTER] || 0) + 1;
    const snapshotId = window[COUNTER];
    
    const results = [];
    let uidCounter = 0;
    
    function getRole(el) {
      const role = el.getAttribute('role');
      if (role) return role;
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();
      const map = {
        'a': 'link', 'button': 'button', 'textarea': 'textbox',
        'select': 'combobox', 'option': 'option', 'nav': 'navigation',
        'header': 'banner', 'footer': 'contentinfo', 'main': 'main',
        'aside': 'complementary', 'form': 'form',
        'img': 'img', 'input': type === 'checkbox' ? 'checkbox' :
          type === 'radio' ? 'radio' : type === 'submit' ? 'button' :
          type === 'email' ? 'textbox' : type === 'password' ? 'textbox' :
          type === 'search' ? 'searchbox' : 'textbox',
      };
      for (let i = 1; i <= 6; i++) map['h' + i] = 'heading';
      return map[tag] || 'generic';
    }
    
    function getName(el) {
      return el.getAttribute('aria-label')
        || el.getAttribute('placeholder')
        || el.getAttribute('title')
        || el.getAttribute('alt')
        || (el.labels && el.labels[0] && el.labels[0].textContent && el.labels[0].textContent.trim())
        || (['INPUT', 'TEXTAREA'].includes(el.tagName) && el.value && el.value.trim())
        || (['A', 'BUTTON', 'SUMMARY', 'LABEL', 'SPAN'].includes(el.tagName) && el.textContent && el.textContent.trim())
        || (el.getAttribute('aria-describedby') ? document.getElementById(el.getAttribute('aria-describedby'))?.textContent?.trim() : '')
        || '';
    }
    
    function isVisible(el) {
      try {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) return false;
        return true;
      } catch(e) { return false; }
    }
    
    function getInputType(el) {
      if (el.tagName === 'TEXTAREA') return 'textarea';
      if (el.tagName === 'SELECT') return 'select';
      if (el.tagName === 'INPUT') return el.getAttribute('type') || 'text';
      return '';
    }
    
    const interactiveRoles = new Set(['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio',
      'heading', 'img', 'navigation', 'banner', 'main', 'form', 'list', 'listitem',
      'tab', 'tabpanel', 'dialog', 'alertdialog', 'menu', 'menuitem', 'option',
      'progressbar', 'slider', 'switch', 'tree', 'treeitem', 'searchbox',
      'search', 'none', 'generic']);
    
    function walk(el, depth) {
      if (depth > 20 || !el || el.nodeType !== 1) return null;
      if (!isVisible(el)) return null;
      
      const role = getRole(el);
      const name = getName(el);
      const tag = el.tagName.toLowerCase();
      
      // Skip pure generic/div wrappers with no interactive children
      if (role === 'generic' && !name && !['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'IMG', 'NAV', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME', 'LABEL'].includes(el.tagName)) {
        const children = [];
        for (const child of el.children) {
          const r = walk(child, depth + 1);
          if (r) children.push(r);
        }
        return children.length > 0 ? { type: 'group', children } : null;
      }
      
      const uid = 'uid_' + snapshotId + '_' + (uidCounter++);
      window[MAP].set(uid, el);
      
      const node = { uid, role, name, tag };
      
      // Extra attributes for inputs
      if (tag === 'input' || tag === 'textarea') {
        node.inputType = getInputType(el);
        if (el.placeholder) node.placeholder = el.placeholder;
        if (el.value && el.value.trim()) node.value = el.value.trim();
        if (el.disabled) node.disabled = true;
        if (el.readOnly) node.readonly = true;
        if (el.required) node.required = true;
      }
      if (tag === 'select') {
        const selected = el.options[el.selectedIndex];
        if (selected) node.value = selected.text;
      }
      if (el.getAttribute('aria-expanded') !== null) node.expanded = el.getAttribute('aria-expanded');
      if (el.getAttribute('aria-selected') !== null) node.selected = el.getAttribute('aria-selected');
      if (el.getAttribute('aria-checked') !== null) node.checked = el.getAttribute('aria-checked');
      
      // Children
      const children = [];
      for (const child of el.children) {
        const r = walk(child, depth + 1);
        if (r) {
          if (Array.isArray(r)) children.push(...r);
          else if (r.type === 'group') children.push(...r.children);
          else children.push(r);
        }
      }
      node.children = children;
      return node;
    }
    
    // Flatten groups before returning
    function flatten(nodes) {
      const result = [];
      for (const n of nodes) {
        if (n.type === 'group') {
          result.push(...flatten(n.children));
        } else {
          if (n.children) n.children = flatten(n.children);
          result.push(n);
        }
      }
      return result;
    }
    
    const rawRoot = document.body ? walk(document.body, 0) : null;
    const root = rawRoot ? (rawRoot.type === 'group' ? { uid: 'root', role: 'root', name: 'Page', tag: 'body', children: rawRoot.children } : rawRoot) : null;
    return { snapshotId: 'snap_' + snapshotId, root };
  } catch(e) {
    return { error: e.message };
  }
})();
`;





async function executeComputerTool(
  input: ComputerToolInput,
): Promise<ToolResult> {
  const { action, tabId } = input;

  // Helper: notify content script about performed action
  const notifyAction = () => {
    chrome.tabs.sendMessage(tabId, {
      type: 'indicator:action',
      action: action,
      text: `Performed ${action}`,
    }).catch(() => {});
  };

  try {
    switch (action) {
      case 'screenshot': {
        const dataUrl = await captureScreenshot(tabId);
        notifyAction();
        const base64 = dataUrl.split(',')[1];
        if (typeof base64 === 'string' && base64.length > 0) {
          const invalidMatch = base64.match(/[^A-Za-z0-9+/=]/);
          if (invalidMatch) {
            console.error(`[SW] ❌ Screenshot base64 has invalid char '${invalidMatch[0]}' at position ${invalidMatch.index}`);
          }
        }
        return {
          type: 'tool_result',
          content: 'Screenshot captured.',
          screenshots: [{ type: 'screenshot', data: base64 }],
          images: [base64],
        };
      }

      case 'click': {
        const uid = input.uid ?? '';
        if (!uid) {
          return { type: 'tool_result', content: 'click requires a uid from take_snapshot.', error: 'Missing uid' };
        }
        const clickScript = `
(function(uid) {
  try {
    const el = window.__baElementMap ? window.__baElementMap.get(uid) : null;
    if (!el) return { success: false, error: 'Element with uid "' + uid + '" not found. Take a fresh snapshot and try again.' };
    el.scrollIntoViewIfNeeded();
    el.click();
    el.focus();
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
})('${uid}');
`;
        const result = await injectScript(tabId, clickScript) as { success: boolean; error?: string };
        if (!result || !result.success) {
          return { type: 'tool_result', content: result?.error || 'Click failed', error: result?.error || 'Click failed' };
        }
        notifyAction();
        return { type: 'tool_result', content: `Clicked element ${uid}.` };
      }

      case 'fill': {
        const uid = input.uid ?? '';
        const text = input.text ?? '';
        if (!uid) {
          return { type: 'tool_result', content: 'fill requires a uid from take_snapshot.', error: 'Missing uid' };
        }
        // Escape text for JS string literal
        const escapedText = text.replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        const fillScript = `
(function(uid, value) {
  try {
    const el = window.__baElementMap ? window.__baElementMap.get(uid) : null;
    if (!el) return { success: false, error: 'Element with uid "' + uid + '" not found' };
    el.scrollIntoViewIfNeeded();
    el.focus();
    if (el.isContentEditable) {
      el.textContent = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      return { success: false, error: 'Element is not a text input' };
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
})('${uid}', '${escapedText}');
`;
        const result = await injectScript(tabId, fillScript) as { success: boolean; error?: string };
        if (!result || !result.success) {
          return { type: 'tool_result', content: result?.error || 'Fill failed', error: result?.error || 'Fill failed' };
        }
        notifyAction();
        return { type: 'tool_result', content: `Filled element ${uid} with "${text}".` };
      }

      case 'type': {
        const text = input.text ?? '';
        await debuggerManager.type(tabId, text);
        notifyAction();
        return { type: 'tool_result', content: `Typed "${text}".` };
      }

      case 'keypress': {
        const keys = input.keys ?? [];
        await debuggerManager.pressKey(tabId, keys);
        notifyAction();
        return { type: 'tool_result', content: `Pressed key(s): ${keys.join(', ')}` };
      }

      case 'scroll': {
        const [dx, dy] = input.scroll_distance ?? [0, 0];
        await debuggerManager.scroll(tabId, dx, dy);
        notifyAction();
        return { type: 'tool_result', content: `Scrolled by (${dx}, ${dy}).` };
      }

      case 'wait': {
        const ms = input.duration ?? 1000;
        await new Promise((r) => setTimeout(r, ms));
        notifyAction();
        return { type: 'tool_result', content: `Waited ${ms}ms.` };
      }

      default:
        return { type: 'tool_result', content: `Unknown action: ${action}`, error: `Unknown action: ${action}` };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { type: 'tool_result', content: `Error: ${msg}`, error: msg };
  }
}

/**
 * Execute take_snapshot: generates a DOM accessibility tree with uids.
 */
async function executeSnapshotTool(
  input: { tabId: number },
): Promise<ToolResult> {
  try {
    const result = await injectScript(input.tabId, SNAPSHOT_SCRIPT) as { snapshotId?: string; root?: unknown; error?: string };
    if (result?.error) {
      return { type: 'tool_result', content: `Snapshot error: ${result.error}`, error: result.error };
    }
    if (!result?.root) {
      return { type: 'tool_result', content: 'No page content found (empty snapshot).' };
    }
    // Format the tree as YAML-like text
    const lines = formatTreeAsYaml(result.root, 0);
    const snapshotText = `Snapshot ${result.snapshotId}:\n${lines.join('\n')}`;
    return { type: 'tool_result', content: snapshotText };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { type: 'tool_result', content: `Snapshot error: ${msg}`, error: msg };
  }
}

/**
 * Format a snapshot tree node as YAML-like indented text.
 */
function formatTreeAsYaml(node: any, depth: number): string[] {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];
  
  if (node.role === 'root') {
    lines.push('Page:');
    if (node.children) {
      for (const child of node.children) {
        lines.push(...formatTreeAsYaml(child, depth + 1));
      }
    }
    return lines;
  }
  
  const attrs: string[] = [];
  attrs.push('uid="' + node.uid + '"');
  if (node.role) attrs.push(node.role);
  if (node.name) attrs.push('"' + node.name + '"');
  
  // Extra attributes
  if (node.inputType && node.inputType !== 'text') attrs.push('type="' + node.inputType + '"');
  if (node.placeholder) attrs.push('placeholder="' + node.placeholder + '"');
  if (node.value && node.value.length < 60) attrs.push('value="' + node.value + '"');
  if (node.disabled) attrs.push('disabled');
  if (node.expanded === 'true') attrs.push('expanded');
  if (node.selected === 'true') attrs.push('selected');
  if (node.checked === 'true') attrs.push('checked');
  
  lines.push(indent + '- ' + attrs.join(' '));
  
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      lines.push(...formatTreeAsYaml(child, depth + 1));
    }
  }
  
  return lines;
}

async function executeNavigateTool(
  input: NavigateToolInput,
): Promise<ToolResult> {
  const { tabId, url, direction } = input;

  try {
    if (direction === 'back') {
      await chrome.tabs.goBack(tabId);
      return { type: 'tool_result', content: 'Navigated back.' };
    }
    if (direction === 'forward') {
      await chrome.tabs.goForward(tabId);
      return { type: 'tool_result', content: 'Navigated forward.' };
    }
    if (url) {
      // Check target domain permission (domain transition guard)
      const targetDomain = extractDomain(url);
      if (targetDomain) {
        const permCheck = await permissionManager.check(targetDomain, 'navigate');
        if (!permCheck.allowed && !permCheck.requiresPrompt) {
          return {
            type: 'tool_result',
            content: `Blocked site: ${targetDomain}`,
            error: 'Permission denied',
          };
        }
        if (permCheck.requiresPrompt) {
          // Will be handled when prompt UI is fully integrated in T4
          // For now, proceed with navigation
        }
      }

      await chrome.tabs.update(tabId, { url });
      await waitForPageLoad(tabId, 8000);
      return { type: 'tool_result', content: `Navigated to ${url}.` };
    }
    return { type: 'tool_result', content: 'No URL or direction provided.', error: 'No URL or direction' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { type: 'tool_result', content: `Navigation error: ${msg}`, error: msg };
  }
}

async function executeFileUploadTool(
  input: FileUploadToolInput,
): Promise<ToolResult> {
  const { tabId, uid, paths } = input;
  try {
    const result = await injectAndEval(tabId, `
      (() => {
        const el = window.__baElementMap ? window.__baElementMap.get('${uid}') : null;
        if (!el) return JSON.stringify({ error: 'File input with uid "${uid}" not found. Take a fresh snapshot first.' });
        if (el.tagName !== 'INPUT' || el.type !== 'file') {
          return JSON.stringify({ error: 'Element is not a file input' });
        }
        // Use the File System Access API or CDP to set files
        // For now, focus the element and log the paths for the native host
        el.focus();
        return JSON.stringify({ success: true, paths: ${JSON.stringify(paths)} });
      })()
    `);
    const parsed = JSON.parse(result);
    if (parsed.error) {
      return { type: 'tool_result', content: parsed.error, error: parsed.error };
    }
    return {
      type: 'tool_result',
      content: `File input ${uid} activated for upload: ${paths.join(', ')}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { type: 'tool_result', content: `Error: ${msg}`, error: msg };
  }
}

async function executeGetPageTextTool(
  input: GetPageTextToolInput,
): Promise<ToolResult> {
  const { tabId } = input;
  try {
    const text = await injectAndEval(tabId, `
      (() => {
        const article = document.querySelector('article');
        if (article) return article.innerText.substring(0, 50000);
        const main = document.querySelector('main');
        if (main) return main.innerText.substring(0, 50000);
        return document.body.innerText.substring(0, 50000);
      })()
    `);
    return {
      type: 'tool_result',
      content: String(text),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { type: 'tool_result', content: `Error: ${msg}`, error: msg };
  }
}

async function executeReadConsoleTool(
  input: ReadConsoleToolInput,
): Promise<ToolResult> {
  const { tabId, pattern } = input;
  try {
    const entries = await injectAndEval(tabId, `
      (() => {
        const entries = window.__claudeConsoleEntries || [];
        if (${JSON.stringify(pattern)}) {
          const pat = new RegExp(${JSON.stringify(pattern)}, 'i');
          return JSON.stringify(entries.filter(e => pat.test(e.message)));
        }
        return JSON.stringify(entries.slice(-50));
      })()
    `);
    return {
      type: 'tool_result',
      content: String(entries),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { type: 'tool_result', content: `Error: ${msg}`, error: msg };
  }
}

async function executeReadNetworkTool(
  input: ReadNetworkToolInput,
): Promise<ToolResult> {
  const { tabId } = input;
  try {
    const requests = await injectAndEval(tabId, `
      (() => {
        const reqs = window.__claudeNetworkEntries || [];
        return JSON.stringify(reqs.slice(-50));
      })()
    `);
    return {
      type: 'tool_result',
      content: String(requests),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { type: 'tool_result', content: `Error: ${msg}`, error: msg };
  }
}

async function executeResizeWindowTool(
  input: ResizeWindowToolInput,
): Promise<ToolResult> {
  const { width, height } = input;
  try {
    const win = await chrome.windows.getCurrent();
    await chrome.windows.update(win.id!, { width, height });
    return {
      type: 'tool_result',
      content: `Window resized to ${width}x${height}.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { type: 'tool_result', content: `Error: ${msg}`, error: msg };
  }
}

async function executeTabsContextTool(): Promise<ToolResult> {
  try {
    const tabs = await tabGroupManager.getContext();
    return {
      type: 'tool_result',
      content: JSON.stringify(tabs, null, 2),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { type: 'tool_result', content: `Error: ${msg}`, error: msg };
  }
}

async function executeTabsCreateTool(
  input: { url?: string },
): Promise<ToolResult> {
  try {
    const tab = await tabGroupManager.openTab(input.url);
    return {
      type: 'tool_result',
      content: `Created tab ${tab.id}${input.url ? ` with URL ${input.url}` : ''}.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { type: 'tool_result', content: `Error: ${msg}`, error: msg };
  }
}

async function executeWebSearch(
  input: WebSearchInput,
): Promise<ToolResult> {
  const { query, count = 5 } = input;

  try {
    // 1. Load search provider config
    const storage = await chrome.storage.local.get('ba-search-provider');
    const config: SearchProviderConfig | undefined = storage['ba-search-provider'];

    let searchUrl: string;
    let parser: 'searxng' | 'google' | 'custom';

    if (config?.url) {
      searchUrl = config.url;
      parser = config.parser || 'searxng';
    } else {
      // Default fallback: SearXNG public instance
      searchUrl = 'https://searx.be/search?q={query}&format=json';
      parser = 'searxng';
    }

    // Replace {query} placeholder
    searchUrl = searchUrl.replace('{query}', encodeURIComponent(query));

    // 2. Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        ...(config?.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        type: 'tool_result',
        content: `Search engine returned HTTP ${response.status}: ${response.statusText}`,
        error: `HTTP ${response.status}`,
      };
    }

    // 3. Parse results
    const data = await response.json();
    let results: Array<{ title: string; url: string; content?: string; snippet?: string }> = [];

    if (parser === 'searxng') {
      results = (data.results || []).slice(0, Math.min(count, 20));
    } else if (parser === 'google') {
      // Google Custom Search API format
      results = (data.items || []).slice(0, Math.min(count, 20)).map((item: any) => ({
        title: item.title,
        url: item.link,
        content: item.snippet,
      }));
    } else {
      // Custom parser — assume standard format
      results = (data.results || data.items || []).slice(0, Math.min(count, 20));
    }

    if (results.length === 0) {
      return {
        type: 'tool_result',
        content: `No results found for "${query}".`,
      };
    }

    // 4. Format results
    const formatted = results.map((r, i) =>
      `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content || r.snippet || ''}`
    ).join('\n\n');

    return {
      type: 'tool_result',
      content: formatted,
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        type: 'tool_result',
        content: 'Search request timed out after 15 seconds.',
        error: 'Timeout',
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return {
      type: 'tool_result',
      content: `Search failed: ${msg}`,
      error: msg,
    };
  }
}

async function executeWebFetch(
  input: WebFetchInput,
): Promise<ToolResult> {
  const { url, maxChars = 50000 } = input;
  const maxLimit = 100000;
  const limit = Math.min(maxChars, maxLimit);

  // 1. Validate URL — reject blocked schemes
  const blockedSchemes = ['chrome:', 'chrome-extension:', 'file:', 'data:', 'blob:', 'javascript:', 'about:'];
  try {
    const parsed = new URL(url);
    if (blockedSchemes.includes(parsed.protocol)) {
      return {
        type: 'tool_result',
        content: `Blocked URL scheme: ${parsed.protocol}//`,
        error: 'Blocked scheme',
      };
    }
  } catch {
    return {
      type: 'tool_result',
      content: `Invalid URL: ${url}`,
      error: 'Invalid URL',
    };
  }

  try {
    // 2. Fetch with 30s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        type: 'tool_result',
        content: `Failed to fetch URL: HTTP ${response.status} ${response.statusText}`,
        error: `HTTP ${response.status}`,
      };
    }

    // 3. Detect Content-Type
    const contentType = response.headers.get('content-type') || '';
    const isHTML = contentType.includes('text/html');
    const isJSON = contentType.includes('application/json');
    const isXML = contentType.includes('application/xml') || contentType.includes('text/xml');

    // 4. Get raw text
    const rawText = await response.text();

    // 5. Extract/format content
    let content: string;

    if (isHTML) {
      // Use DOMParser to extract text prioritizing article/main
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawText, 'text/html');

      // Try article first, then main, then body
      let source = doc.querySelector('article') || doc.querySelector('main') || doc.body;
      content = source?.textContent?.replace(/\s+/g, ' ').trim() || '(empty page)';
    } else if (isJSON || isXML) {
      content = rawText;
    } else {
      // Plain text or unknown — return raw
      content = rawText;
    }

    // 6. Truncation
    if (content.length > limit) {
      content = content.substring(0, limit) + `\n\n[Content truncated to ${limit} characters. Original size: ${rawText.length} chars]`;
    }

    return {
      type: 'tool_result',
      content,
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        type: 'tool_result',
        content: 'Fetch request timed out after 30 seconds.',
        error: 'Timeout',
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return {
      type: 'tool_result',
      content: `Failed to fetch URL: ${msg}`,
      error: msg,
    };
  }
}


/* ================================================================== */
/*  File Tool Executors                                                */
/* ================================================================== */

async function executeFileDownload(
  input: FileDownloadInput,
): Promise<ToolResult> {
  try {
    // Validate URL
    let url: URL;
    try {
      url = new URL(input.url);
    } catch {
      return {
        type: 'tool_result',
        content: `Failed to download: invalid URL "${input.url}"`,
      };
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      return {
        type: 'tool_result',
        content: `Failed to download: only HTTP(S) URLs are supported, got "${url.protocol}"`,
      };
    }

    // Derive filename from URL if not provided
    const filename = input.filename || url.pathname.split('/').pop() || 'download';

    const downloadId = await chrome.downloads.download({
      url: input.url,
      filename: filename,
      saveAs: false,
    });

    return {
      type: 'tool_result',
      content: `Download started: "${filename}" (ID: ${downloadId})`,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    return {
      type: 'tool_result',
      content: `Failed to download: ${msg}`,
    };
  }
}

async function executeReadFile(
  input: ReadFileInput,
  tabId: number,
): Promise<ToolResult> {
  try {
    const TIMEOUT_MS = 30_000; // 30 seconds

    // Wrap sendMessage with timeout
    const response = await Promise.race([
      chrome.tabs.sendMessage(tabId, {
        type: 'file:pick_and_read',
      }),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout: user did not respond within 30 seconds')), TIMEOUT_MS)
      ),
    ]);

    if (!response) {
      return {
        type: 'tool_result',
        content: 'Failed to read file: no response from page',
      };
    }

    if (response.error) {
      return {
        type: 'tool_result',
        content: response.error,
      };
    }

    const { content, name, size } = response;

    // Base64 encoding requested
    let resultContent = content;
    if (input.encoding === 'base64' && content) {
      resultContent = btoa(unescape(encodeURIComponent(content)));
    }

    return {
      type: 'tool_result',
      content: `Read "${name}" (${size} bytes)\n\n${resultContent}`,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('Could not establish connection') || msg.includes('Receiving end does not exist')) {
      return {
        type: 'tool_result',
        content: 'Failed to read file: target page is not available. Please refresh the page and try again.',
      };
    }
    return {
      type: 'tool_result',
      content: `Failed to read file: ${msg}`,
    };
  }
}

async function executeCreateFile(
  input: CreateFileInput,
  _tabId: number,
): Promise<ToolResult> {
  try {
    const content = input.content || '';
    const blob = new Blob([content], { type: 'text/plain' });
    const blobUrl = URL.createObjectURL(blob);
    const filename = input.path || 'file.txt';

    const downloadId = await chrome.downloads.download({
      url: blobUrl,
      filename: filename,
      saveAs: false,
    });

    // Revoke blob URL after a short delay to allow download to start
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

    return {
      type: 'tool_result',
      content: `Created "${filename}" (${blob.size} bytes)`,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    return {
      type: 'tool_result',
      content: `Failed to create file: ${msg}`,
    };
  }
}

async function executeEditFile(
  input: EditFileInput,
  tabId: number,
): Promise<ToolResult> {
  try {
    const TIMEOUT_MS = 30_000;

    // Step 1: Read the file via content script
    const response = await Promise.race([
      chrome.tabs.sendMessage(tabId, {
        type: 'file:pick_and_read',
      }),
      new Promise<null>((_, reject) =>
        setTimeout(
          () => reject(new Error('Timeout: user did not respond within 30 seconds')),
          TIMEOUT_MS,
        )
      ),
    ]);

    if (!response) {
      return {
        type: 'tool_result',
        content: 'Failed to edit file: no response from page',
      };
    }

    if (response.error) {
      return {
        type: 'tool_result',
        content: response.error,
      };
    }

    const { content, name, size } = response;

    // Step 2: Apply text replacement
    if (!content.includes(input.oldText)) {
      return {
        type: 'tool_result',
        content: `String not found in file: "${input.oldText.substring(0, 100)}"`,
      };
    }

    const newContent = content.replaceAll(input.oldText, input.newText);

    // Step 3: Create modified file as download
    const filename = input.path || name || 'edited-file.txt';
    const blob = new Blob([newContent], { type: 'text/plain' });
    const blobUrl = URL.createObjectURL(blob);

    const downloadId = await chrome.downloads.download({
      url: blobUrl,
      filename: filename,
      saveAs: false,
    });

    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

    return {
      type: 'tool_result',
      content: `Edited "${filename}" (${blob.size} bytes) - downloaded as new file`,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('Timeout')) {
      return {
        type: 'tool_result',
        content: msg,
      };
    }
    if (msg.includes('Could not establish connection') || msg.includes('Receiving end does not exist')) {
      return {
        type: 'tool_result',
        content: 'Failed to edit file: target page is not available. Please refresh the page and try again.',
      };
    }
    return {
      type: 'tool_result',
      content: `Failed to edit file: ${msg}`,
    };
  }
}

/* ================================================================== */
/*  Public API                                                         */
/* ================================================================== */

/**
 * Execute a named tool with given input. Returns a ToolResult.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  _tabId?: number,
): Promise<ToolResult> {
  // ── Permission check ──────────────────────────────────────
  // Skip permission check for tools that don't interact with domains
  const toolsNeedingPermission = ['computer', 'navigate', 'take_snapshot', 'javascript_tool',
    'form_input', 'file_upload', 'get_page_text', 'read_console_messages',
    'read_network_requests', 'resize_window'];

  // For browser_batch, individual items will be checked
  if (name !== 'browser_batch' && toolsNeedingPermission.includes(name)) {
    const tabId = (input.tabId as number) || _tabId;
    if (tabId) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab?.url) {
          const domain = extractDomain(tab.url);
          if (domain) {
            const permCheck = await permissionManager.check(domain, name);
            if (!permCheck.allowed && !permCheck.requiresPrompt) {
              return {
                type: 'tool_result',
                content: `Blocked site: ${domain}`,
                error: 'Permission denied',
              };
            }
            if (permCheck.requiresPrompt) {
              // Notify the content script to show the shield indicator
              chrome.tabs.sendMessage(tabId, {
                type: 'indicator:shield',
                show: true,
                restricted: true,
              }).catch(() => { /* content script not loaded */ });
            }
            if (!permCheck.allowed && !permCheck.requiresPrompt) {
              // Blocked domain — show shield without glow
              chrome.tabs.sendMessage(tabId, {
                type: 'indicator:shield',
                show: true,
                restricted: false,
              }).catch(() => { /* content script not loaded */ });
            }
          }
        }
      } catch {
        // Tab might have been removed, proceed anyway
      }
    }
  }

  switch (name) {
    case 'computer':
      return executeComputerTool(input as unknown as ComputerToolInput);

    case 'take_snapshot':
      return executeSnapshotTool(input as { tabId: number });

    case 'navigate':
      return executeNavigateTool(input as unknown as NavigateToolInput);

    case 'javascript_tool':
      return executeJavaScriptTool(input as unknown as JavaScriptToolInput);

    case 'file_upload':
      return executeFileUploadTool(input as unknown as FileUploadToolInput);

    case 'get_page_text':
      return executeGetPageTextTool(input as unknown as GetPageTextToolInput);

    case 'read_console_messages':
      return executeReadConsoleTool(input as unknown as ReadConsoleToolInput);

    case 'read_network_requests':
      return executeReadNetworkTool(input as unknown as ReadNetworkToolInput);

    case 'resize_window':
      return executeResizeWindowTool(input as unknown as ResizeWindowToolInput);

    case 'tabs_context':
      return executeTabsContextTool();

    case 'tabs_create':
      return executeTabsCreateTool(input);

    case 'web_search':
      return executeWebSearch(input as unknown as WebSearchInput);

    case 'web_fetch':
      return executeWebFetch(input as unknown as WebFetchInput);

    case 'download':
      return executeFileDownload(input as unknown as FileDownloadInput);

    case 'read_file':
      return executeReadFile(input as unknown as ReadFileInput, _tabId ?? 0);

    case 'create_file':
      return executeCreateFile(input as unknown as CreateFileInput, _tabId ?? 0);

    case 'edit_file':
      return executeEditFile(input as unknown as EditFileInput, _tabId ?? 0);

    case 'browser_batch': {
      const batchInput = input as unknown as BatchToolInput;
      const results: ToolResult[] = [];
      for (const item of batchInput.actions) {
        const result = await executeTool(item.name, item.input, _tabId);
        results.push(result);
        if (result.error) break; // stop on first error
      }
      return {
        type: 'tool_result',
        content: results.map((r) => r.content).join('\n---\n'),
        screenshots: results.flatMap((r) => r.screenshots ?? []),
      };
    }

    default:
      return {
        type: 'tool_result',
        content: `Unknown tool: ${name}`,
        error: `Unknown tool: ${name}`,
      };
  }
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

/**
 * Inject JS into a tab via chrome.scripting and return the result.
 */
async function injectAndEval(
  tabId: number,
  code: string,
): Promise<string> {
  try {
    const value = await debuggerManager.evaluate(tabId, code);
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: msg });
  }
}

/**
 * Capture a screenshot of the given tab.
 * Uses chrome.tabs.captureVisibleTab (like Claude in Chrome) when the tab
 * is the active tab in its window. Falls back to chrome.debugger CDP for
 * background tabs.
 */
async function captureScreenshot(tabId: number): Promise<string> {
  try {
    // Try captureVisibleTab first (simpler, more reliable, Claude-compatible)
    const tab = await chrome.tabs.get(tabId);
    if (tab.active && tab.windowId !== undefined) {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      return dataUrl; // Already in data:image/png;base64,... format
    }
  } catch {
    // Fall through to CDP approach
  }
  // Fallback: use CDP for background tabs
  const base64 = await debuggerManager.captureScreenshot(tabId);
  return `data:image/png;base64,${base64}`;
}

/**
 * Wait for a tab to finish loading, with timeout.
 */
async function waitForPageLoad(
  tabId: number,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') return;
    } catch {
      // tab might have been removed
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}
