# Tasks — File Tools

**Feature ID:** `file-tools`
**Prioridade:** 7 (próxima após visual-indicators-complete)

---

## T1 — Tool Definitions + Types

**Ficheiros:**
- `extension/src/service-worker/tools.ts` — adicionar 4 tool definitions no registry
- `extension/src/service-worker/providers/types.ts` — adicionar interfaces de input

**O quê:**
1. Adicionar `FileDownloadInput`, `ReadFileInput`, `CreateFileInput`, `EditFileInput` em `types.ts`
2. Adicionar tool definitions (`download`, `read_file`, `create_file`, `edit_file`) no registry em `tools.ts` com schemas completos
3. Mapear handlers para `executeFileDownload`, `executeReadFile`, `executeCreateFile`, `executeEditFile`

**Critérios de aceitação:**
- Tools aparecem no registry
- Schemas válidos para Anthropic e OpenAI
- `npx tsc --noEmit` passa

---

## T2 — Download Executor

**Ficheiro:** `extension/src/service-worker/tools.ts`

**O quê:**
1. Implementar `executeFileDownload(input: { url: string; filename?: string }): Promise<ToolResult>`
2. Validar URL (apenas HTTP/HTTPS)
3. Chamar `chrome.downloads.download({ url, filename })`
4. Retornar resultado com ID do download e nome do ficheiro
5. Tratar erros (URL inválida, download falhou)

**Critérios de aceitação:**
- `download` com URL válida → inicia download, retorna ID + nome
- `download` com URL inválida → retorna erro descritivo
- `download` sem filename → deriva da URL

---

## T3 — Content Script File Bridge

**Ficheiro novo:** `extension/src/content-scripts/file-bridge.ts`

**O quê:**
1. Criar content script que regista `chrome.runtime.onMessage` listener
2. Implementar handlers:
   - `file:pick_and_read` → `showOpenFilePicker()` → lê conteúdo → devolve `{ content, name, size }`
   - `file:pick_and_save` → `showSaveFilePicker()` → escreve conteúdo → devolve `{ name, size }`
   - `file:save_edited` → `showSaveFilePicker()` → escreve conteúdo modificado → devolve `{ name, size }`
3. Tratar `AbortError` (utilizador cancela) → devolver `{ error }`

**Nota:** Este script é auto-executável (IIFE) tal como `accessibility-tree.ts` e `agent-indicator.ts`.

**Critérios de aceitação:**
- File picker abre quando recebe mensagem
- Ficheiros de texto lidos corretamente
- Ficheiros criados/guardados corretamente
- Cancelamento retorna erro amigável

---

## T4 — Read File Executor

**Ficheiro:** `extension/src/service-worker/tools.ts`

**O quê:**
1. Implementar `executeReadFile(input: { path: string; encoding?: string }, tabId: number): Promise<ToolResult>`
2. Enviar mensagem `file:pick_and_read` para o content script da tab ativa
3. Aguardar resposta com timeout (30s)
4. Se resposta tem `error` → retornar `tool_result` com erro
5. Se resposta tem `content` → retornar conteúdo como string
6. Opcional: se `encoding === 'base64'`, converter para base64

**Critérios de aceitação:**
- Envia mensagem para content script
- Timeout de 30s se utilizador não responde
- Retorna conteúdo lido ou erro descritivo

---

## T5 — Create File Executor

**Ficheiro:** `extension/src/service-worker/tools.ts`

**O quê:**
1. Implementar `executeCreateFile(input: { path: string; content: string }, tabId: number): Promise<ToolResult>`
2. Enviar mensagem `file:pick_and_save` para content script
3. Aguardar resposta
4. Retornar resultado com nome + tamanho do ficheiro

**Critérios de aceitação:**
- Cria ficheiro no local escolhido pelo utilizador
- Retorna "Created \"{name}\" ({size} bytes)"
- Erro se utilizador cancela ou escrita falha

---

## T6 — Edit File Executor

**Ficheiro:** `extension/src/service-worker/tools.ts`

**O quê:**
1. Implementar `executeEditFile(input: { path: string; oldText: string; newText: string }, tabId: number): Promise<ToolResult>`
2. Enviar `file:pick_and_read` para CS → obter conteúdo
3. Se oldText não encontrado no conteúdo → retornar "String not found in file"
4. Substituir oldText → newText no conteúdo
5. Enviar `file:save_edited` para CS com conteúdo modificado
6. Retornar resultado

**Critérios de aceitação:**
- Lê ficheiro via file picker
- Substitui texto corretamente
- Se oldText não encontrado → erro "String not found in file"
- Salva ficheiro modificado
- Retorna "Edited \"{name}\" ({size} bytes)"

---

## T7 — Manifest + i18n

**Ficheiros:**
- `extension/manifest.json`
- `extension/_locales/en/messages.json`
- `extension/_locales/pt_BR/messages.json`

**O quê:**
1. Adicionar `"downloads.open"` ao manifest (opcional)
2. Adicionar content script `file-bridge.ts` ao manifest (`content_scripts`)
3. Adicionar novas chaves i18n em ambos os locales

**Content scripts no manifest:**
```json
{
  "js": ["src/content-scripts/file-bridge.ts"],
  "matches": ["<all_urls>"],
  "run_at": "document_idle",
  "world": "MAIN"
}
```

**Chaves i18n:**

**en/messages.json:**
```json
"tool_download": { "message": "Download file" },
"tool_read_file": { "message": "Read file" },
"tool_create_file": { "message": "Create file" },
"tool_edit_file": { "message": "Edit file" },
"download_started": { "message": "Download started: $name$ (ID: $id$)",
  "placeholders": { "name": { "content": "$1" }, "id": { "content": "$2" } } },
"download_failed": { "message": "Failed to download: $reason$",
  "placeholders": { "reason": { "content": "$1" } } },
"file_read_ok": { "message": "Read \"$name$\" ($size$ bytes)",
  "placeholders": { "name": { "content": "$1" }, "size": { "content": "$2" } } },
"file_create_ok": { "message": "Created \"$name$\" ($size$ bytes)",
  "placeholders": { "name": { "content": "$1" }, "size": { "content": "$2" } } },
"file_edit_ok": { "message": "Edited \"$name$\" ($size$ bytes)",
  "placeholders": { "name": { "content": "$1" }, "size": { "content": "$2" } } },
"file_cancelled": { "message": "File operation cancelled by user" },
"file_failed": { "message": "File operation failed: $reason$",
  "placeholders": { "reason": { "content": "$1" } } },
"file_binary": { "message": "File is binary ($size$ bytes). Only text files are supported.",
  "placeholders": { "size": { "content": "$1" } } }
```

**pt_BR/messages.json:**
```json
"tool_download": { "message": "Baixar arquivo" },
"tool_read_file": { "message": "Ler arquivo" },
"tool_create_file": { "message": "Criar arquivo" },
"tool_edit_file": { "message": "Editar arquivo" },
"download_started": { "message": "Download iniciado: $name$ (ID: $id$)",
  "placeholders": { "name": { "content": "$1" }, "id": { "content": "$2" } } },
"download_failed": { "message": "Falha ao baixar: $reason$",
  "placeholders": { "reason": { "content": "$1" } } },
"file_read_ok": { "message": "Lido \"$name$\" ($size$ bytes)",
  "placeholders": { "name": { "content": "$1" }, "size": { "content": "$2" } } },
"file_create_ok": { "message": "Criado \"$name$\" ($size$ bytes)",
  "placeholders": { "name": { "content": "$1" }, "size": { "content": "$2" } } },
"file_edit_ok": { "message": "Editado \"$name$\" ($size$ bytes)",
  "placeholders": { "name": { "content": "$1" }, "size": { "content": "$2" } } },
"file_cancelled": { "message": "Operação cancelada pelo utilizador" },
"file_failed": { "message": "Falha na operação: $reason$",
  "placeholders": { "reason": { "content": "$1" } } },
"file_binary": { "message": "Arquivo binário ($size$ bytes). Apenas arquivos de texto são suportados.",
  "placeholders": { "size": { "content": "$1" } } }
```

**Critérios de aceitação:**
- `npx tsc --noEmit` passa
- `npm run build` passa
- Content script carregado nas páginas

---

## Ordem de Implementação

```
T1 (definitions) → T2 (download) → T3 (file bridge) → T4 (read)
→ T5 (create) → T6 (edit) → T7 (manifest + i18n)
```

**Dependências:**
- T3 não depende de T1/T2 (pode ser feito em paralelo com T2)
- T4, T5, T6 dependem de T3
- T7 pode ser feito a qualquer momento
