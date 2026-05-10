/* ------------------------------------------------------------------ */
/*  Browser Tools — Pi SDK custom tool definitions for BrowserAgent   */
/*                                                                     */
/*  Each tool wraps an execTool() callback that sends a toolExec       */
/*  message to the Service Worker and awaits a toolResult reply.       */
/* ------------------------------------------------------------------ */
import { defineTool } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';

/**
 * Callback signature for executing a tool via the Native Messaging
 * bridge to the Service Worker.
 */
export interface ToolExecCallback {
  (toolCallId: string, name: string, args: Record<string, unknown>): Promise<{
    content: string;
    error?: string;
    images?: string[];
  }>;
}

/**
 * Execute a tool via the bridge and convert any images to Pi SDK ImageContent.
 */
async function execToolAndBuildContent(
  execTool: ToolExecCallback,
  toolCallId: string,
  name: string,
  params: Record<string, unknown>,
): Promise<{ content: any[]; details: Record<string, unknown> }> {
  const result = await execTool(toolCallId, name, params);
  const content: any[] = [{ type: 'text', text: result.content }];
  if (result.images?.length) {
    for (const img of result.images) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: img },
      });
    }
  }
  return { content, details: {} };
}

/**
 * Create all BrowserAgent tools as Pi SDK custom tools.
 *
 * @param execTool  Callback that sends a toolExec message to the SW
 *                  and awaits the toolResult reply.
 * @returns         Array of ToolDefinition suitable for customTools in
 *                  createAgentSession().
 */
export function createBrowserTools(execTool: ToolExecCallback) {
  return [
    /* ============================================================== */
    /*  1. computer — Mouse, keyboard, screenshot                     */
    /* ============================================================== */
    defineTool({
      name: 'computer',
      label: 'Computer Interaction',
      description: [
        'Use a mouse and keyboard to interact with a web browser, and take screenshots.',
        "If you don't have a valid tab ID, use tabs_context first to get available tabs.",
        '* The screen\'s resolution is 1280x720.',
        '* Whenever you intend to click on an element like an icon, you should consult a screenshot to determine the coordinates of the element before moving the cursor.',
        '* If you tried clicking on a program or link but it failed to load, even after waiting, try adjusting your click location so that the tip of the cursor visually falls on the element that you want to click.',
        '* Make sure to click any buttons, links, icons, etc with the cursor tip in the center of the element. Don\'t click boxes on their edges unless asked.',
      ].join('\n'),
      parameters: Type.Object({
        action: Type.Enum({
          click: 'click',
          key: 'key',
          type: 'type',
          wait: 'wait',
          left_click_drag: 'left_click_drag',
          left_click: 'left_click',
          scroll_to: 'scroll_to',
          hover: 'hover',
          right_click: 'right_click',
          triple_click: 'triple_click',
          double_click: 'double_click',
          scroll: 'scroll',
          screenshot: 'screenshot',
        }),
        coordinate: Type.Optional(
          Type.Array(Type.Number(), { minItems: 2, maxItems: 2 }),
        ),
        start_coordinate: Type.Optional(
          Type.Array(Type.Number(), { minItems: 2, maxItems: 2 }),
        ),
        text: Type.Optional(Type.String()),
        keys: Type.Optional(Type.Array(Type.String())),
        scroll_distance: Type.Optional(
          Type.Array(Type.Number(), { minItems: 2, maxItems: 2 }),
        ),
        scroll_target: Type.Optional(
          Type.Array(Type.Number(), { minItems: 2, maxItems: 2 }),
        ),
        duration: Type.Optional(Type.Number()),
        tabId: Type.Number(),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'computer', params as Record<string, unknown>);
      },
    }),

    /* ============================================================== */
    /*  2. navigate — Navigate to URL / back / forward                */
    /* ============================================================== */
    defineTool({
      name: 'navigate',
      label: 'Navigate',
      description: 'Navigate to a URL, or go forward/back in browser history. If no tabId is provided, uses the currently active tab. After navigating, always take a screenshot (computer action:screenshot) or read_page to see the page content and continue the task.',
      parameters: Type.Object({
        url: Type.Optional(Type.String()),
        direction: Type.Optional(
          Type.Enum({ forward: 'forward', back: 'back' }),
        ),
        tabId: Type.Optional(Type.Number()),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'navigate', params as Record<string, unknown>);
      },
    }),

    /* ============================================================== */
    /*  3. read_page — Accessibility tree                             */
    /* ============================================================== */
    defineTool({
      name: 'read_page',
      label: 'Read Page',
      description: [
        'Get an accessibility tree representation of elements on the page.',
        'By default returns all elements including non-visible ones.',
        'Can optionally filter for only interactive elements, limit tree depth, or focus on a specific element.',
        'Returns a structured tree that represents how screen readers see the page content.',
        "If you don't have a valid tab ID, use tabs_context first to get available tabs.",
        'Output is limited to 50000 characters — if exceeded, specify a depth limit or ref_id to focus on a specific element.',
      ].join(' '),
      parameters: Type.Object({
        filter: Type.Optional(
          Type.Enum({ all: 'all', interactive: 'interactive', visible: 'visible' }),
        ),
        depth: Type.Optional(Type.Integer()),
        maxChars: Type.Optional(Type.Integer()),
        refId: Type.Optional(Type.String()),
        tabId: Type.Number(),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'read_page', params as Record<string, unknown>);
      },
    }),

    /* ============================================================== */
    /*  4. javascript_tool — Execute JS in page context               */
    /* ============================================================== */
    defineTool({
      name: 'javascript_tool',
      label: 'JavaScript Execution',
      description: [
        "Execute JavaScript code in the context of the current page.",
        "The code runs in the page's context and can interact with the DOM, window object, and page variables.",
        "Returns the result of the last expression or any thrown errors.",
        "If you don't have a valid tab ID, use tabs_context first to get available tabs.",
      ].join(' '),
      parameters: Type.Object({
        code: Type.String(),
        tabId: Type.Number(),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'javascript_tool', params as Record<string, unknown>);
      },
    }),

    /* ============================================================== */
    /*  5. form_input — Set form field value by ref                   */
    /* ============================================================== */
    defineTool({
      name: 'form_input',
      label: 'Form Input',
      description: [
        "Set values in form elements using element reference ID from the read_page tool.",
        "If you don't have a valid tab ID, use tabs_context first to get available tabs.",
      ].join(' '),
      parameters: Type.Object({
        ref: Type.String(),
        value: Type.String(),
        tabId: Type.Number(),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'form_input', params as Record<string, unknown>);
      },
    }),

    /* ============================================================== */
    /*  6. file_upload — Upload file(s) to file input                 */
    /* ============================================================== */
    defineTool({
      name: 'file_upload',
      label: 'File Upload',
      description: [
        'Upload one or multiple files from the local filesystem to a file input element on the page.',
        'Do not click on file upload buttons or file inputs — clicking opens a native file picker dialog that you cannot see or interact with.',
        'Instead, use read_page to locate the file input element, then use this tool with its ref to upload files directly.',
        'The paths must be absolute file paths on the local machine.',
      ].join(' '),
      parameters: Type.Object({
        ref: Type.String(),
        paths: Type.Array(Type.String()),
        tabId: Type.Number(),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'file_upload', params as Record<string, unknown>);
      },
    }),

    /* ============================================================== */
    /*  7. get_page_text — Extract visible text                       */
    /* ============================================================== */
    defineTool({
      name: 'get_page_text',
      label: 'Get Page Text',
      description: [
        "Extract raw text content from the page, prioritizing article content.",
        "Ideal for reading articles, blog posts, or other text-heavy pages.",
        "Returns plain text without HTML formatting.",
        "If you don't have a valid tab ID, use tabs_context first to get available tabs.",
        "Output is limited to 50000 characters by default.",
      ].join(' '),
      parameters: Type.Object({
        tabId: Type.Number(),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'get_page_text', params as Record<string, unknown>);
      },
    }),

    /* ============================================================== */
    /*  8. read_console_messages — Read browser console               */
    /* ============================================================== */
    defineTool({
      name: 'read_console_messages',
      label: 'Read Console Messages',
      description: [
        "Read browser console messages (console.log, console.error, console.warn, etc.) from a specific tab.",
        "Useful for debugging JavaScript errors, viewing application logs, or understanding what's happening in the browser console.",
        "Returns console messages from the current domain only.",
        "If you don't have a valid tab ID, use tabs_context first to get available tabs.",
        "IMPORTANT: Always provide a pattern to filter messages — without a pattern, you may get too many irrelevant messages.",
      ].join(' '),
      parameters: Type.Object({
        pattern: Type.Optional(Type.String()),
        tabId: Type.Number(),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'read_console_messages', params as Record<string, unknown>);
      },
    }),

    /* ============================================================== */
    /*  9. read_network_requests — Read network requests              */
    /* ============================================================== */
    defineTool({
      name: 'read_network_requests',
      label: 'Read Network Requests',
      description: [
        "Read HTTP network requests (XHR, Fetch, documents, images, etc.) from a specific tab.",
        "Useful for debugging API calls, monitoring network activity, or understanding what requests a page is making.",
        "Returns all network requests made by the current page, including cross-origin requests.",
        "Requests are automatically cleared when the page navigates to a different domain.",
        "If you don't have a valid tab ID, use tabs_context first to get available tabs.",
      ].join(' '),
      parameters: Type.Object({
        tabId: Type.Number(),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'read_network_requests', params as Record<string, unknown>);
      },
    }),

    /* ============================================================== */
    /*  10. resize_window — Resize browser window                     */
    /* ============================================================== */
    defineTool({
      name: 'resize_window',
      label: 'Resize Window',
      description: [
        "Resize the current browser window to specified dimensions.",
        "Useful for testing responsive designs or setting up specific screen sizes.",
        "If you don't have a valid tab ID, use tabs_context first to get available tabs.",
      ].join(' '),
      parameters: Type.Object({
        width: Type.Integer(),
        height: Type.Integer(),
        tabId: Type.Number(),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'resize_window', params as Record<string, unknown>);
      },
    }),

    /* ============================================================== */
    /*  11. tabs_context — List all available tabs                    */
    /* ============================================================== */
    defineTool({
      name: 'tabs_context',
      label: 'Tabs Context',
      description: "Get context information (id, url, title) about all available tabs. Use the returned tab IDs as the tabId parameter in other tools like navigate, computer, read_page.",
      parameters: Type.Object({}),
      execute: async (toolCallId, _params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'tabs_context', {});
      },
    }),

    /* ============================================================== */
    /*  12. tabs_create — Create a new tab                            */
    /* ============================================================== */
    defineTool({
      name: 'tabs_create',
      label: 'Create Tab',
      description: "Creates a new tab (and optionally navigates to a URL). After creating a tab, always follow up with navigate, screenshot, or read_page to interact with it. Prefer tabs_create with a URL directly instead of creating an empty tab and then navigating separately.",
      parameters: Type.Object({
        url: Type.Optional(Type.String()),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'tabs_create', params as Record<string, unknown>);
      },
    }),

    /* ============================================================== */
    /*  13. browser_batch — Execute a sequence of tool calls          */
    /* ============================================================== */
    defineTool({
      name: 'browser_batch',
      label: 'Browser Batch',
      description: [
        'Execute a sequence of browser tool calls in ONE round trip.',
        'Each item is {name, input} where input is exactly what you\'d pass to that tool standalone.',
        'Actions execute SEQUENTIALLY (not in parallel) and stop on the first error.',
        'Use this tool extensively to quickly execute work whenever you can predict two or more steps ahead — e.g. navigate, click a field, type, press Return, screenshot.',
        'Each tool\'s own permission check runs per item — if an action navigates to a domain without permission, the next item\'s check fails and the batch stops.',
        'Screenshots and other images are returned interleaved with outputs; coordinates you write in THIS batch refer to the screenshot taken BEFORE this call.',
        'browser_batch cannot be nested.',
      ].join(' '),
      parameters: Type.Object({
        actions: Type.Array(
          Type.Object({
            name: Type.String(),
            input: Type.Object({}, { additionalProperties: true }),
          }),
          { minItems: 1 },
        ),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'browser_batch', params as Record<string, unknown>);
      },
    }),

    /* ============================================================== */
    /*  14. web_search — Search the web                               */
    /* ============================================================== */
    defineTool({
      name: 'web_search',
      label: 'Web Search',
      description: "Search the web for information using a configured search engine (SearXNG, Google, etc.). Returns a list of formatted results with titles, URLs, and snippets.",
      parameters: Type.Object({
        query: Type.String(),
        count: Type.Optional(Type.Integer()),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'web_search', params as Record<string, unknown>);
      },
    }),

    /* ============================================================== */
    /*  15. web_fetch — Fetch a URL and extract content               */
    /* ============================================================== */
    defineTool({
      name: 'web_fetch',
      label: 'Web Fetch',
      description: "Fetch and extract content from a URL. Returns plain text from HTML pages (prioritizing article/main content) or raw text for JSON/XML responses.",
      parameters: Type.Object({
        url: Type.String(),
        maxChars: Type.Optional(Type.Integer()),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'web_fetch', params as Record<string, unknown>);
      },
    }),

    /* ============================================================== */
    /*  16. download — Download a file from a URL                     */
    /* ============================================================== */
    defineTool({
      name: 'download',
      label: 'Download File',
      description: "Download a file from a URL to the user's Downloads folder",
      parameters: Type.Object({
        url: Type.String(),
        filename: Type.Optional(Type.String()),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'download', params as Record<string, unknown>);
      },
    }),

    /* ============================================================== */
    /*  17. read_file — Read a local file                             */
    /* ============================================================== */
    defineTool({
      name: 'read_file',
      label: 'Read File',
      description: "Read the contents of a text file. Opens a file picker for the user to select the file.",
      parameters: Type.Object({
        path: Type.String(),
        encoding: Type.Optional(
          Type.Enum({ 'utf-8': 'utf-8', 'base64': 'base64' }),
        ),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'read_file', params as Record<string, unknown>);
      },
    }),

    /* ============================================================== */
    /*  18. create_file — Create a local file                         */
    /* ============================================================== */
    defineTool({
      name: 'create_file',
      label: 'Create File',
      description: "Create a new file with the specified content. Opens a save file picker.",
      parameters: Type.Object({
        path: Type.String(),
        content: Type.String(),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'create_file', params as Record<string, unknown>);
      },
    }),

    /* ============================================================== */
    /*  19. edit_file — Edit a local file                             */
    /* ============================================================== */
    defineTool({
      name: 'edit_file',
      label: 'Edit File',
      description: "Edit an existing file by replacing text. Opens a file picker.",
      parameters: Type.Object({
        path: Type.String(),
        oldText: Type.String(),
        newText: Type.String(),
      }),
      execute: async (toolCallId, params) => {
        return execToolAndBuildContent(execTool, toolCallId, 'edit_file', params as Record<string, unknown>);
      },
    }),
  ];
}
