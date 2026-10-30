# Feature: File Tools

**Feature ID:** `file-tools`
**Prioridade:** 7

*Agrupa os itens: `read_file`, `edit_file`, `create_file`, `download`*

---

## Descrição

Adicionar ferramentas de sistema de ficheiros que permitem ao agente ler, editar, criar e descarregar ficheiros. Estas tools expandem a capacidade do agente para além do navegador, permitindo interagir com o sistema de ficheiros local e descarregar ficheiros da web.

---

## User Stories

### P1: Download Tool ⭐ MVP

**Como** utilizador,
**Quero** que o agente descarregue ficheiros da web
**Para** guardar imagens, documentos e outros ficheiros.

**Critérios de Aceitação:**

1. WHEN o LLM chama `download` com uma URL THEN o service worker SHALL descarregar via `chrome.downloads.download()`
2. WHEN o download é iniciado THEN SHALL retornar o ID do download e o nome do ficheiro
3. WHEN a URL é inválida THEN a tool SHALL retornar "Failed to download: {reason}"
4. WHEN o ficheiro já existe THEN o Chrome SHALL decidir o comportamento (sobrescrever ou renomear — comportamento nativo)

### P2: Create File

**Critérios de Aceitação:**

1. WHEN o LLM chama `create_file` com path e conteúdo THEN o service worker SHALL criar o ficheiro via `FileSystem Access API` ou `chrome.downloads.download()` com blob
2. WHEN o path não tem permissão THEN a tool SHALL pedir permissão ao utilizador
3. WHEN o ficheiro é criado com sucesso THEN SHALL retornar "Created {path} ({size} bytes)"

### P2: Read File

**Critérios de Aceitação:**

1. WHEN o LLM chama `read_file` com um path THEN o service worker SHALL tentar ler o ficheiro
2. WHEN o ficheiro é texto THEN SHALL retornar o conteúdo como string
3. WHEN o ficheiro é binário THEN SHALL retornar "File is binary ({size} bytes)"
4. WHEN o ficheiro não existe THEN SHALL retornar "File not found: {path}"

### P3: Edit File

**Critérios de Aceitação:**

1. WHEN o LLM chama `edit_file` com path, oldText e newText THEN o service worker SHALL substituir no ficheiro
2. WHEN oldText não é encontrado THEN SHALL retornar "String not found in file"
3. WHEN o ficheiro não existe THEN SHALL retornar "File not found"

---

## Design

### APIs Chrome

Para ler/editar/criar ficheiros locais, o Chrome Extension MV3 tem opções limitadas:

1. **`chrome.downloads.download()`** — apenas download (já no manifest)
2. **`chrome.fileSystem`** — (apenas Chrome Apps, não extensions)
3. **`chrome.offscreen`** + **`showDirectoryPicker()`** / **`showOpenFilePicker()`** — File System Access API (requer user gesture)

### Solução v1

Para MVP, usar `chrome.downloads.download()` para `download` tool, e para `read_file`/`edit_file`/`create_file`, usar uma abordagem baseada em content script que pede permissão ao utilizador via file picker.

```typescript
// download.ts
async function downloadFile(url: string, filename?: string): Promise<ToolResult> {
  const id = await chrome.downloads.download({
    url,
    filename: filename || url.split('/').pop() || 'download',
    saveAs: false,
  });
  return { type: 'tool_result', content: `Download started (ID: ${id})` };
}

// read_file via content script + File System Access
async function readFile(path: string): Promise<ToolResult> {
  // Por agora, retornar que precisa de implementação do File System Access
  return {
    type: 'tool_result',
    content: 'File system access requires user interaction (file picker). Please upload files via the chat input.',
  };
}
```

### Alternativa Futura: Native Messaging Host

Para acesso completo ao sistema de ficheiros, a solução correta é implementar um **Native Messaging Host** (como o Claude Code faz). Adiado para v2.

---

## Ficheiros

| Ficheiro | Ação |
|----------|------|
| `extension/src/service-worker/tools.ts` | Adicionar tool definitions + `executeFileDownload()` |
| `extension/src/service-worker/download.ts` | **Criar** — lógica de download |
| `extension/src/service-worker/providers/types.ts` | Adicionar `FileDownloadInput`, `CreateFileInput`, `ReadFileInput`, `EditFileInput` |
| `extension/_locales/*/messages.json` | Novas chaves |

## Fora de Escopo (v1)

- Acesso completo ao sistema de ficheiros local (Native Messaging Host)
- Edição de ficheiros binários
- Drag-and-drop de ficheiros do sistema
- Watcher de diretórios
