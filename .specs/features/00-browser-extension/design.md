# Design — Browser Extension

> Feature: `browser-extension`  
> Phase: Design  
> Based on: PRD.md + Reverse engineering analysis

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Chrome Extension                             │
│                                                                   │
│  ┌──────────────────┐    ┌────────────────────────────────────┐  │
│  │   Side Panel      │    │        Service Worker              │  │
│  │   (React SPA)     │    │                                    │  │
│  │                   │    │  ┌──────────────────────────────┐  │  │
│  │  ┌─────────────┐  │    │  │ MessageRouter                │  │  │
│  │  │ ChatView    │  │◄──►│  │ - fan-out to handlers        │  │  │
│  │  │ ModelSelect │  │ msg │  │ - type-safe dispatch         │  │  │
│  │  │ ToolCard    │  │    │  └──────────────────────────────┘  │  │
│  │  │ Permission  │  │    │                                    │  │
│  │  │ Prompt      │  │    │  ┌─────────┐ ┌─────────────────┐  │  │
│  │  └─────────────┘  │    │  │Provider │ │ ToolExecutor    │  │  │
│  └──────────────────┘    │  │ Layer   │ │ - navigate      │  │  │
│                          │  │         │ │ - click         │  │  │
│  ┌──────────────────┐    │  │ OpenAI  │ │ - type          │  │  │
│  │  Options Page     │    │  │ Anthrop │ │ - screenshot    │  │  │
│  │  (React SPA)      │    │  │         │ │ - scroll        │  │  │
│  │                   │    │  └────┬────┘ │ - read_page     │  │  │
│  │  ┌─────────────┐  │    │       │      └────────┬────────┘  │  │
│  │  │ModelsConfig │  │    │  ┌────▼──────────────────▼─────┐  │  │
│  │  │General      │  │    │  │ PermissionManager           │  │  │
│  │  └─────────────┘  │    │  │ - site policy               │  │  │
│  └──────────────────┘    │  │ - action policy              │  │  │
│                          │  │ - modes (ask/auto/skip)      │  │  │
│  ┌──────────────────┐    │  └─────────────────────────────┘  │  │
│  │ Content Scripts   │    │                                    │  │
│  │                   │    │  ┌──────────────────────────────┐  │  │
│  │ accessibility-    │◄──►│  │ TabGroupManager              │  │  │
│  │ tree.ts           │ msg│  │ - group create/close         │  │  │
│  │                   │    │  │ - tab tracking               │  │  │
│  │ agent-indicator   │    │  └──────────────────────────────┘  │  │
│  │ .ts               │    │                                    │  │
│  └──────────────────┘    └────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────┐                                             │
│  │ Offscreen Doc     │  audio.ts, gif-generator.ts                │
│  └──────────────────┘                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Design

### 1. Service Worker (`src/service-worker/`)

#### 1.1 Entry Point — `index.ts`
```typescript
// Lifecycle
chrome.runtime.onInstalled.addListener(handleInstalled);
chrome.runtime.onStartup.addListener(handleStartup);

// Messaging
chrome.runtime.onMessage.addListener(handleMessage);
chrome.runtime.onConnect.addListener(handleConnect);

// Side panel
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Keep-alive
chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
```

#### 1.2 MessageRouter — `messages.ts`
```typescript
type Message =
  | { type: 'chat:send'; payload: ChatPayload }
  | { type: 'models:list' }
  | { type: 'cs:accessibility-tree'; tabId: number }
  | { type: 'permissions:response'; decision: 'allow' | 'deny' | 'allow_once' }
  // ... all message types

async function handleMessage(msg: Message, sender, sendResponse) {
  switch (msg.type) {
    case 'chat:send': return chatHandler(msg.payload);
    case 'models:list': return modelsHandler();
    // ...
  }
}
```

#### 1.3 TabGroupManager — `tab-group.ts`
```typescript
class TabGroupManager {
  private groupId: number | null;
  
  async createGroup(tabId: number): Promise<number>;
  async closeGroup(): Promise<void>;
  getActiveTab(): Promise<chrome.tabs.Tab>;
  async trackTabEvents(callback: TabEventCallback): UnsubscribeFn;
}
```

#### 1.4 PermissionManager — `permissions.ts`
```typescript
type PermissionMode = 'ask' | 'auto' | 'skip_all';
type Decision = 'allow' | 'deny' | 'allow_once';

class PermissionManager {
  private policies: Map<string, SitePolicy>;
  private mode: PermissionMode;
  
  async checkPermission(
    site: string, 
    action: ToolAction
  ): Promise<Decision>;
  
  async setPolicy(site: string, action: ToolAction, decision: Decision): Promise<void>;
  async setMode(mode: PermissionMode): Promise<void>;
  async getPolicies(): Promise<PolicyEntry[]>;
}
```

---

### 2. Provider Layer (`src/service-worker/providers/`)

#### 2.1 Factory — `index.ts`
```typescript
interface ProviderConfig {
  baseUrl: string;
  api: 'openai-completions' | 'anthropic-messages';
  apiKey: string;
  authHeader?: boolean;
  compat?: CompatFlags;
  models: ModelDef[];
}

class ProviderFactory {
  static create(config: ProviderConfig): LLMProvider;
}

interface LLMProvider {
  chat(params: ChatParams): AsyncIterable<ChatChunk>;
  listModels(): ModelDef[];
}
```

#### 2.2 OpenAI Adapter — `openai.ts`
```typescript
class OpenAIProvider implements LLMProvider {
  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        tools: params.tools,
        stream: true,
        stream_options: { include_usage: true }
      }),
      signal: params.signal
    });
    yield* parseSSE(response.body);
  }
}
```

#### 2.3 Anthropic Adapter — `anthropic.ts`
```typescript
class AnthropicProvider implements LLMProvider {
  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: { 
        'x-api-key': apiKey, 
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens,
        messages: params.messages,
        tools: params.tools,
        stream: true
      }),
      signal: params.signal
    });
    yield* parseSSE(response.body);
  }
}
```

#### 2.4 Models Loader — `models-loader.ts`
```typescript
interface ModelsConfig {
  providers: Record<string, ProviderConfig>;
}

async function loadModels(): Promise<ProviderConfig[]> {
  const stored = await chrome.storage.local.get('models_config');
  if (stored.models_config) {
    return validateConfig(stored.models_config);
  }
  // Fallback: bundled config
  return fetch(chrome.runtime.getURL('config/models.default.json'))
    .then(r => r.json())
    .then(validateConfig);
}
```

---

### 3. Tool Executor (`src/service-worker/tool-executor.ts`)

```typescript
interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(params: Record<string, unknown>, tabId: number): Promise<ToolResult>;
}

const tools: Record<string, ToolDef> = {
  navigate: {
    name: 'navigate',
    description: 'Navigate to a URL in the active tab',
    parameters: { url: { type: 'string', description: 'URL to navigate to' } },
    async execute({ url }, tabId) {
      await chrome.tabs.update(tabId, { url });
      return { success: true };
    }
  },
  click: { /* ... */ },
  type: { /* ... */ },
  screenshot: { /* ... */ },
  scroll: { /* ... */ },
  read_page: { /* ... */ }
};
```

---

### 4. Side Panel (`src/sidepanel/`)

```
src/sidepanel/
├── App.tsx                  # Root component, state provider
├── main.tsx                 # ReactDOM.createRoot
├── components/
│   ├── Chat.tsx             # Message list with auto-scroll
│   ├── Message.tsx          # Single message bubble
│   ├── ChatInput.tsx        # Text input with send/attach
│   ├── ModelSelector.tsx    # Provider > Model cascade dropdown
│   ├── ToolCard.tsx         # Expandable tool call card
│   └── PermissionPrompt.tsx # Modal: Allow / Deny / Allow Once
├── hooks/
│   ├── useChat.ts           # Message state, send, stream receive
│   └── useModels.ts         # Load models from SW, selection state
└── styles/
    ├── variables.css         # CSS custom properties
    ├── chat.css
    └── components.css
```

**State Management:** React Context + useReducer (sem Redux/Zustand).

```typescript
interface ChatState {
  messages: Message[];
  selectedModel: ModelDef | null;
  isLoading: boolean;
  pendingPermission: PermissionRequest | null;
}

type ChatAction =
  | { type: 'ADD_MESSAGE'; message: Message }
  | { type: 'APPEND_CHUNK'; content: string }
  | { type: 'SET_MODEL'; model: ModelDef }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SHOW_PERMISSION'; request: PermissionRequest }
  | { type: 'RESOLVE_PERMISSION' };
```

---

### 5. Content Scripts (`src/content-scripts/`)

#### 5.1 Accessibility Tree — `accessibility-tree.ts`
```typescript
interface InteractiveElement {
  role: string;
  name: string;
  rect: { x: number; y: number; width: number; height: number };
  actions: string[];
  attributes: Record<string, string>;
}

function getInteractiveElements(): InteractiveElement[] {
  const interactive = new Set([
    'button', 'link', 'textbox', 'searchbox', 'combobox',
    'listbox', 'menuitem', 'option', 'tab', 'checkbox',
    'radio', 'switch', 'slider', 'spinbutton'
  ]);
  
  const elements: InteractiveElement[] = [];
  const walker = document.createTreeWalker(
    document.body, NodeFilter.SHOW_ELEMENT
  );
  // ... traverse and collect
  return elements;
}

// Listen for SW requests
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'cs:accessibility-tree') {
    sendResponse({ elements: getInteractiveElements() });
  }
});
```

#### 5.2 Agent Indicator — `agent-indicator.ts`
Creates an overlay `<div id="browser-agent-overlay">` with:
- Ghost cursor (follows click coordinates)
- Element highlight (border around target)
- Ripple animation (expanding circle at click point)
- Typing indicator (blinking caret in input fields)

All with `pointer-events: none` to not block user interaction.

---

### 6. Options Page (`src/options/`)

```
src/options/
├── App.tsx                  # Tab layout: Models | General
├── ModelsConfig.tsx          # Provider CRUD, model list, import/export
└── General.tsx              # Theme, shortcuts, language
```

---

### 7. Data Flow

```
User Message
    │
    ▼
Side Panel (App.tsx)
    │ chat:send
    ▼
Service Worker (messages.ts)
    │
    ├──► Provider Layer (chat stream)
    │       │
    │       ├── text chunks ──► SP (stream back)
    │       │
    │       └── tool_call
    │              │
    │              ▼
    │         PermissionManager.checkPermission()
    │              │
    │              ├── denied ──► SP (permission_denied)
    │              │
    │              └── allowed
    │                     │
    │                     ▼
    │                Tool Executor
    │                     │
    │                     ├── navigate ──► chrome.tabs
    │                     ├── click/type ──► content script (executeScript)
    │                     ├── screenshot ──► chrome.debugger
    │                     └── read_page ──► content script
    │                     │
    │                     ▼
    │                Tool Result ──► Provider Layer (continue chat)
    │                                   │
    └───────────────────────────────────┘
                                           │
                                           ▼
                                    Final response ──► SP render
```

---

## API Definitions

### Chat Message Format

```typescript
interface ChatPayload {
  model: string;
  messages: {
    role: 'user' | 'assistant' | 'system';
    content: string | ContentBlock[];
  }[];
  tools?: ToolDef[];
  maxTokens?: number;
  tabId: number;
  abortSignal?: AbortSignal;
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };
```

### Tool Result Format

```typescript
interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  screenshot?: string; // base64 data URL
}
```

---

## Error Handling Strategy

```
Layer            Error              → Action
─────────────────────────────────────────────────
Provider         Network timeout    → Retry 1x, then error to user
Provider         Invalid API key    → Error flagged in model selector
Provider         4xx/5xx response   → Parsed error message to chat
Tool Executor    Tab closed         → "Tab no longer exists"
Tool Executor    Permission denied  → "User denied permission for {action}"
Tool Executor    Element not found  → "Target element not found on page"
Content Script   CSP block          → Fallback to executeScript
Side Panel       Disconnected SW    → "Reconnecting..." banner
Service Worker   Idle wake          → Restore state from storage
```
