# Design — File Tools

**Feature ID:** `file-tools`
**Baseado no spec:** `spec.md`

---

## 1. Visão Geral da Arquitetura

```
┌──────────────────┐     ┌───────────────────┐     ┌──────────────────────┐
│  Provider (LLM)  │ ──► │  Service Worker   │ ──► │  chrome.downloads   │
│  chama tool      │     │  (tools.ts)       │     │  (download tool +   │
│                  │     │                   │     │   create_file via   │
│                  │     │                   │     │   Blob URL)         │
└──────────────────┘     └───────┬───────────┘     └──────────────────────┘
                                │
                                │ chrome.tabs.sendMessage('file:pick_and_read')
                                ▼
                        ┌──────────────────┐     ┌──────────────────────┐
                        │  Content Script  │ ──► │  <input type="file"> │
                        │  (file-bridge)   │     │  (read_file +        │
                        │                  │     │   edit_file read     │
                        │                  │     │   phase)             │
                        └──────────────────┘     └──────────────────────┘
```

### Porquê esta abordagem?

A **File System Access API** (`showOpenFilePicker()` / `showSaveFilePicker()`) requer um **user gesture** (clique do utilizador) para ser chamada. Em extensões Chrome, o `chrome.runtime.onMessage` callback **não tem** um user gesture associado, o que faz com que estas APIs falhem silenciosamente.

A nova abordagem resolve isto:

| Operação | Mecanismo | Porquê funciona |
|----------|-----------|-----------------|
| **read_file** | `<input type="file">` + `.click()` programático | Extensões Chrome podem fazer `click()` programático em `<input type="file">` — é uma permissão especial da extensão |
| **create_file** | `Blob` → `URL.createObjectURL()` → `chrome.downloads.download()` | Blob URLs criados no contexto da extensão são válidos para `chrome.downloads.download()`. Não precisa de user gesture. |
| **edit_file (leitura)** | `<input type="file">` | Mesmo que read_file |
| **edit_file (escrita)** | `Blob` → `URL.createObjectURL()` → `chrome.downloads.download()` | Mesmo que create_file |
| **download** | `chrome.downloads.download(url)` | Direto, sem user gesture |

**Vantagens:**
- Sem dependência de File System Access API (inconsistente em MV3)
- `download` + `create_file` funcionam 100% no SW — sem necessidade de content script
- `read_file` usa API de browser standard que funciona em todas as páginas
- O utilizador vê o file picker nativo do Chrome para leitura

---

## 2. Tool Definitions

### 2.1 `download`

**Schema (Anthropic format):**
```json
{
  "name": "download",
  "description": "Download a file from a URL to the user's Downloads folder",
  "input_schema": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "description": "URL of the file to download"
      },
      "filename": {
        "type": "string",
        "description": "Optional filename (default: derived from URL)"
      }
    },
    "required": ["url"]
  }
}
```

### 2.2 `read_file`

**Schema (Anthropic format):**
```json
{
  "name": "read_file",
  "description": "Read the contents of a text file. Opens a file picker for the user to select the file. The 'path' argument is used as display/reference only — the actual file is chosen by the user for security reasons.",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Reference path or filename to read (user selects actual file via picker)"
      },
      "encoding": {
        "type": "string",
        "enum": ["utf-8", "base64"],
        "description": "File encoding (default: utf-8)"
      }
    },
    "required": ["path"]
  }
}
```

### 2.3 `create_file`

**Schema (Anthropic format):**
```json
{
  "name": "create_file",
  "description": "Create a new file with the specified content. The file is saved to the user's Downloads folder via the browser's download mechanism.",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Suggested filename or path"
      },
      "content": {
        "type": "string",
        "description": "File content (text)"
      }
    },
    "required": ["path", "content"]
  }
}
```

### 2.4 `edit_file`

**Schema (Anthropic format):**
```json
{
  "name": "edit_file",
  "description": "Edit an existing file by replacing text. Opens a file picker to select the file, then saves the modified version to Downloads.",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Reference path or filename to edit"
      },
      "oldText": {
        "type": "string",
        "description": "The exact text to find and replace"
      },
      "newText": {
        "type": "string",
        "description": "The replacement text"
      }
    },
    "required": ["path", "oldText", "newText"]
  }
}
```

---

## 3. Conversão Provider-Specific

### Anthropic → OpenAI

```typescript
// tools.ts — registry
{
  type: "function",
  function: {
    name: "download",
    description: "...",
    parameters: { /* input_schema */ }
  }
}
```

### OpenAI → Anthropic

Já está no formato Anthropic no registry — a conversão é feita no provider layer.

---

## 4. Executor — `executeFileTool()`

### 4.1 `download`

```typescript
async function executeDownload(
  input: { url: string; filename?: string },
): Promise<ToolResult> {
  try {
    // Validate URL
    const parsed = new URL(input.url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return {
        type: 'tool_result',
        content: `Failed to download: only HTTP(S) URLs are supported, got "${parsed.protocol}"`,
      };
    }

    const filename = input.filename || parsed.pathname.split('/').pop() || 'download';
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
    return {
      type: 'tool_result',
      content: `Failed to download: ${err?.message || String(err)}`,
    };
  }
}
```

### 4.2 `read_file`

**Fluxo:**

```
SW (tools.ts)                              Content Script (file-bridge.ts)
│                                              │
├─ read_file({path, encoding})                 │
│  └─ chrome.tabs.sendMessage(tabId, {         │
│       type: 'file:pick_and_read'             │
│     }) ─────────────────────────────────►    │
│                                              ├─ <input type="file">
│                                              ├─ .click() programático
│                                              ├─ FileReader.readAsText()
│                                              ├─ returns { content, name, size }
│  ◄───────────────────────────────────────┤   │
│  └─ returns ToolResult                      │
```

```typescript
async function executeReadFile(
  input: ReadFileInput,
  tabId: number,
): Promise<ToolResult> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'file:pick_and_read',
    });

    const result = response as {
      content?: string;
      name?: string;
      size?: number;
      error?: string;
    };

    if (result.error) {
      if (result.error === 'User cancelled file selection') {
        return {
          type: 'tool_result',
          content: 'File operation cancelled by user.',
        };
      }
      return {
        type: 'tool_result',
        content: `Failed to read file: ${result.error}`,
      };
    }

    if (!result.content && result.size && result.size > 0) {
      // Binary file detection — if FileReader returned empty but file has size
      return {
        type: 'tool_result',
        content: `File is binary (${result.size} bytes). Only text files are supported.`,
      };
    }

    return {
      type: 'tool_result',
      content: `Read "${result.name}" (${result.size} bytes):\n\n${result.content}`,
    };
  } catch (err: any) {
    return {
      type: 'tool_result',
      content: `Failed to read file: ${err?.message || String(err)}`,
    };
  }
}
```

### 4.3 `create_file`

**Fluxo:**

```
SW (tools.ts)
│
├─ create_file({path, content})
│  ├─ Cria Blob([content], { type: 'text/plain' })
│  ├─ Cria blobUrl = URL.createObjectURL(blob)
│  ├─ chrome.downloads.download({ url: blobUrl, filename: path })
│  └─ returns ToolResult
│
│  Nota: Blob URLs criados no contexto da SW são válidos
│  para chrome.downloads.download(). O Chrome faz o download
│  do Blob para a pasta Downloads do utilizador.
```

```typescript
async function executeCreateFile(
  input: CreateFileInput,
): Promise<ToolResult> {
  try {
    const blob = new Blob([input.content], { type: 'text/plain;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    const filename = input.path.split('/').pop() || 'file.txt';

    const downloadId = await chrome.downloads.download({
      url: blobUrl,
      filename: filename,
      saveAs: false,
    });

    // Revoke blob URL after download starts
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

    return {
      type: 'tool_result',
      content: `Created "${filename}" (${blob.size} bytes, download ID: ${downloadId})`,
    };
  } catch (err: any) {
    return {
      type: 'tool_result',
      content: `Failed to create file: ${err?.message || String(err)}`,
    };
  }
}
```

### 4.4 `edit_file`

**Fluxo:**

```
SW (tools.ts)                              Content Script
│                                              │
├─ edit_file({path, oldText, newText})         │
│  └─ chrome.tabs.sendMessage(tabId, {         │
│       type: 'file:pick_and_read'             │
│     }) ─────────────────────────────────►    │
│                                              ├─ <input type="file">
│                                              ├─ .click() programático
│                                              ├─ FileReader.readAsText()
│                                              ├─ returns { content, name, size }
│  ◄───────────────────────────────────────┤   │
│                                              │
│  ├─ Verifica se oldText existe no conteúdo   │
│  ├─ Se não: retorna "String not found"       │
│  ├─ Se sim: substitui oldText → newText      │
│  ├─ Cria Blob com conteúdo modificado        │
│  ├─ Cria blobUrl = URL.createObjectURL(blob) │
│  ├─ chrome.downloads.download({              │
│  │    url: blobUrl,                          │
│  │    filename: originalName                 │
│  │  })                                       │
│  └─ returns ToolResult                       │
```

```typescript
async function executeEditFile(
  input: EditFileInput,
  tabId: number,
): Promise<ToolResult> {
  try {
    // 1. Read the file via content script
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'file:pick_and_read',
    });

    const result = response as {
      content?: string;
      name?: string;
      size?: number;
      error?: string;
    };

    if (result.error) {
      if (result.error === 'User cancelled file selection') {
        return {
          type: 'tool_result',
          content: 'File operation cancelled by user.',
        };
      }
      return {
        type: 'tool_result',
        content: `Failed to read file: ${result.error}`,
      };
    }

    if (!result.content) {
      return {
        type: 'tool_result',
        content: 'File is empty or binary. Only text files are supported.',
      };
    }

    // 2. Apply text replacement
    const content = result.content;
    const { oldText, newText } = input;

    if (!content.includes(oldText)) {
      return {
        type: 'tool_result',
        content: `String not found in file. The text "${oldText}" was not found in "${result.name}".`,
      };
    }

    const modifiedContent = content.replaceAll(oldText, newText);

    // 3. Save modified file via Blob + chrome.downloads
    const blob = new Blob([modifiedContent], { type: 'text/plain;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const filename = result.name || 'edited-file.txt';

    await chrome.downloads.download({
      url: blobUrl,
      filename: filename,
      saveAs: false,
    });

    // Revoke blob URL after download starts
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

    return {
      type: 'tool_result',
      content: `Edited "${filename}" (${blob.size} bytes). Replaced "${oldText}" with "${newText}".`,
    };
  } catch (err: any) {
    return {
      type: 'tool_result',
      content: `Failed to edit file: ${err?.message || String(err)}`,
    };
  }
}
```

---

## 5. Content Script — File Bridge

**Ficheiro:** `extension/src/content-scripts/file-bridge.ts`

A única mensagem tratada pelo content script é `file:pick_and_read`. As operações de escrita (`create_file`, `edit_file` save) são feitas diretamente no Service Worker via `chrome.downloads.download()` com Blob URLs.

### Mensagens

| Tipo | Direção | Payload | Resposta |
|------|---------|---------|----------|
| `file:pick_and_read` | SW → CS | `{}` | `{ content, name, size }` ou `{ error }` |

### Implementação

```typescript
/* ------------------------------------------------------------------ */
/*  File Bridge — handles file read operations via <input type="file"> */
/*  in the content script. Create/save uses chrome.downloads directly  */
/*  in the service worker.                                            */
/* ------------------------------------------------------------------ */

(function () {
  // Guard: prevent double injection
  if ((window as any).__baFileBridgeReady) return;
  (window as any).__baFileBridgeReady = true;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'file:pick_and_read') {
      handlePickAndRead()
        .then(sendResponse)
        .catch((err) => sendResponse({ error: err.message || String(err) }));
      return true; // keep channel open for async
    }
  });

  async function handlePickAndRead(): Promise<{
    content: string;
    name: string;
    size: number;
    error?: string;
  }> {
    try {
      const result = await readFileViaInput();
      return result;
    } catch (err: any) {
      if (
        err.name === 'AbortError' ||
        err.message?.includes('cancel') ||
        err.message === 'User cancelled'
      ) {
        return { content: '', name: '', size: 0, error: 'User cancelled file selection' };
      }
      return { content: '', name: '', size: 0, error: `Failed to read file: ${err.message || String(err)}` };
    }
  }

  function readFileViaInput(): Promise<{
    content: string;
    name: string;
    size: number;
  }> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept =
        '.txt,.md,.json,.js,.ts,.html,.css,.csv,.xml,.yaml,.yml,' +
        '.env,.sh,.py,.rb,.go,.rs,.java,.c,.cpp,.h,.toml,.ini,.cfg,.log';
      input.style.cssText = 'display:none !important';

      const cleanup = () => {
        if (input.parentNode) document.body.removeChild(input);
      };

      input.addEventListener('change', () => {
        cleanup();
        const file = input.files?.[0];
        if (!file) {
          reject(new Error('User cancelled'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () =>
          resolve({
            content: reader.result as string,
            name: file.name,
            size: file.size,
          });
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });

      // Handle cancellation (modern Chrome fires 'cancel' event)
      input.addEventListener('cancel', () => {
        cleanup();
        reject(new Error('User cancelled'));
      });

      document.body.appendChild(input);
      // Programmatic click on <input type="file"> WORKS in Chrome extensions
      input.click();
    });
  }
})();
```

### Porquê `<input type="file">` em vez de `showOpenFilePicker()`?

| Abordagem | Problema |
|-----------|----------|
| `showOpenFilePicker()` | Requer user gesture. Chrome bloqueia se chamado fora de um event handler de clique do utilizador. O `chrome.runtime.onMessage` callback NÃO tem user gesture. |
| `<input type="file">` + `.click()` | **Funciona em extensões Chrome.** A API de extensões permite `click()` programático em `<input type="file">` como uma permissão especial. O Chrome trata o `click()` como se fosse do utilizador para efeitos de file picker. |

---

## 6. Integração no Tool Executor

Em `tools.ts`, os handlers de file tools estão implementados como funções separadas e registadas no `executeTool()` switch:

```typescript
// Tools.ts — file tool handlers registados
case 'download':
  return executeFileDownload(input as unknown as FileDownloadInput);

case 'read_file':
  return executeReadFile(input as unknown as ReadFileInput, _tabId ?? 0);

case 'create_file':
  return executeCreateFile(input as unknown as CreateFileInput);

case 'edit_file':
  return executeEditFile(input as unknown as EditFileInput, _tabId ?? 0);
```

**Nota:** `executeCreateFile` não precisa de `tabId` porque usa `chrome.downloads.download()` diretamente. `executeReadFile` e `executeEditFile` precisam de `tabId` para enviar mensagem ao content script.

---

## 7. Permissões

**Manifest** (`extension/manifest.json`):
- `"downloads"` — necessário para `chrome.downloads.download()` ✅ (já presente)
- `"downloads.open"` — opcional, para abrir ficheiros após download
- `"storage"` — já presente ✅
- `"scripting"` — já presente ✅

**Content script** (`file-bridge.ts`):
- Corre em `<all_urls>` com `"world": "MAIN"` 
- Não precisa de permissões extra — `<input type="file">` é DOM standard

---

## 8. Limitações v1

| Limitação | Razão | Solução Futura |
|-----------|-------|----------------|
| `read_file` não aceita path arbitrário | Segurança — browser não permite acesso direto ao filesystem | Native Messaging Host |
| `edit_file` precisa de file picker para ler + download para salvar | Duas operações separadas | File handle persistente (OPFS) + `showSaveFilePicker()` com user gesture |
| `create_file` e `edit_file` guardam sempre para Downloads | `chrome.downloads.download()` só permite Downloads folder | `chrome.downloads.download({ saveAs: true })` para mostrar save dialog |
| Apenas ficheiros de texto (UTF-8) | Simplicidade v1 | Base64 + binary na v2 |
| `edit_file` pode perder o ficheiro original se o download falhar | O conteúdo original está em memória apenas | Guardar backup temporário |
| Sem suporte para `base64` encoding na v1 do file-bridge | FileReader.readAsDataURL() requer lógica extra | Adicionar na próxima iteracão |

---

## 9. i18n Keys

```json
{
  "tool_download": "Download file",
  "tool_read_file": "Read file",
  "tool_create_file": "Create file",
  "tool_edit_file": "Edit file",
  "download_started": "Download started: {name} (ID: {id})",
  "download_failed": "Failed to download: {reason}",
  "file_read_ok": "Read \"{name}\" ({size} bytes)",
  "file_create_ok": "Created \"{name}\" ({size} bytes)",
  "file_edit_ok": "Edited \"{name}\" ({size} bytes)",
  "file_edit_not_found": "String not found in file: \"{text}\"",
  "file_cancelled": "File operation cancelled by user",
  "file_failed": "File operation failed: {reason}",
  "file_binary": "File is binary ({size} bytes). Only text files are supported.",
  "file_empty": "File is empty or binary. Only text files are supported."
}
```
