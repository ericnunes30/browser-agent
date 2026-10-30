# MCP Bridge — SPEC (mcp-host/)

Contrato central: **a extensão fica no Chrome e só disca WebSocket para fora.
TUDO que executa mora no daemon Go** (`mcp-host/`): MCP stdio + MCP HTTP,
pareamento por token, fila, logs, upgrade e `install-skill`.
A extensão nunca escuta porta, nunca expõe HTTP, nunca lê token de disco —
só abre `ws://127.0.0.1:<porta>/ws` com `Authorization: Bearer <token>`.

## 1. Layout `mcp-host/`

```text
mcp-host/
  SPEC.md                  # este arquivo (único da fase)
  go.mod                   # module browseragent/mcp-host, go >= 1.22
  cmd/daemon/main.go       # entrypoint: flags, bind, serve /status+/ws+/mcp, stdio
  internal/
    bridge/hub.go          # registro extensão, fila por tab, correlação por id
    bridge/protocol.go     # structs + validação do framing JSONL/WS (seção 4)
    mcp/server.go          # MCP tools/list + tools/call (stdio e POST /mcp)
    auth/token.go          # load/geração do token em %APPDATA%/BrowserAgent/token
    queue/queue.go         # 1 fila FIFO por tabId; 1 in-flight por tab
    config/ports.go        # regra primary/client por porta (seção 6)
    logs/logs.go           # JSONL em %APPDATA%/BrowserAgent/logs/daemon-*.log
    upgrade/upgrade.go     # `daemon upgrade` (baixa binário, troca atômica)
    skill/skill.go         # `daemon install-skill --client <claude|opencode|...>`
```

Nada fora de `mcp-host/` nesta fase. Lado extensão = só o cliente WS
(bridge-client, ~150 linhas) + reuso de `executeTool` — sem servidor novo.

## 2. Daemon Go — responsabilidades (tudo aqui, nada na extensão)

| Área | Comportamento |
|---|---|
| MCP stdio | `daemon --stdio`: ciclo de vida on-demand (padrão). O agente spawna o daemon ao abrir a conexão MCP; stdin EOF encerra a sessão e o daemon sai por completo (HTTP+WS junto). Nada fica residente. `daemon start` existe só para instância persistente explícita. |
| MCP HTTP | `POST http://127.0.0.1:<porta>/mcp` Streamable HTTP (`"type":"streamableHttp"`). `tools/list` dinâmico (seção 7) + `tools/call` com validação de forma no daemon antes de enviar à extensão. |
| Pareamento/token | Na 1ª boot gera 32 bytes `crypto/rand` hex em `%APPDATA%/BrowserAgent/token` (0600). **Zero clique (TOFU por slot vazio)**: loopback SEM token é aceito sempre que ninguém estiver conectado; o daemon entrega o token no 1º frame `welcome` e a extensão guarda para os reconnects. Com extensão conectada, sem token → `403`; com token válido, o dono retoma o slot. `paired` trava só o `POST /pair`. `daemon --reset-token` regenera tudo. |
| Fila | `queue/queue.go`: FIFO por `tabId`, 1 request in-flight por tab; tabs diferentes em paralelo. `browser_batch` continua sequencial dentro da extensão (`tools.ts:1721-1734`, sem aninhar). |
| Logs | JSONL `{ts,level,msg,tool,tabId,latencyMs}` em `%APPDATA%/BrowserAgent/logs/`. `GET /status` expõe `lastError` + `uptime`. Sem PII de página (só url domain). |
| Upgrade | `daemon upgrade [--check]`: compara versão local × endpoint release, baixa `.exe`, valida sha256, troca atômica, reinicia. Nunca auto-upgrada sem comando. |
| install-skill | `daemon install-skill --client <claude-code\|opencode\|claude-desktop>`: escreve bloco MCP **stdio** (`command:<daemon> args:[--stdio]`, opencode `type:local`) no config do cliente. Idempotente. O agente spawna o daemon por sessão; sem residente. |

Flows herdados que o daemon absorve: `/status` aberto sem auth + `/ws` com token (padrão Kimi, fluxo 6–8); bridge em 2 saltos WS-na-borda / JSONL-no-loopback (fluxo 13); `register` global do binário (fluxo 14). Não copiar: exposição fora de `127.0.0.1` nem porta fixa sem config (fluxo 15) — bind sempre em loopback, porta via config/flag.

## 3. Endpoints do daemon (só loopback)

Bind: `127.0.0.1` apenas. Se o bind falhar por `EADDRINUSE`, aplicar seção 6
(primary/client) — nunca `0.0.0.0`, nunca fallback para outra interface.

| Método | Path | Auth | Uso |
|---|---|---|---|
| `GET` | `/status` | nenhuma | Healthcheck mínimo: `200 {"ok":true,"version":"x.y.z","primary":bool,"port":18765,"tabs":n,"uptime_s":n,"lastError":null\|str}`. A extensão mostra "Connected" a partir daqui (fluxo 8). Sem PII. |
| `GET` | `/ws` → WS | `Authorization: Bearer <token>` (ou `?token=` só no handshake inicial de pareamento) | **Único canal extensão↔daemon.** A extensão disca; o daemon nunca disca de volta. Sem token válido → `403` e fecha (padrão Kimi, fluxo 6). |
| `POST` | `/pair` | nenhuma (só loopback; 403 após pareado) | Pareamento em 1 clique: devolve `{"ok":true,"token"}` enquanto `paired` não existe; o 1º `/ws` válido grava `paired`. |
| `POST` | `/mcp` | mesma do MCP client (localhost implícito; Bearer opcional se `--mcp-auth`) | Streamable HTTP JSON-RPC para clientes MCP com HTTP (fluxo 1). |

Porta: `--port` (default `18765`, fluxo 4) > `~/.config/open-claude-in-chrome/config.json:{port}`-style `config.json` (`%APPDATA%/BrowserAgent/config.json:{port}`) > default. Arquivo de token: `%APPDATA%/BrowserAgent/token` (Windows) / `$HOME/.config/browser-agent/token` (linux/mac).

## 4. Framing extensão↔daemon (WS texto, 1 JSON por mensagem = JSONL lógico)

Request (daemon→extensão):

```json
{"id":"<uuid>","type":"tool_request","tool":"snapshot","args":{"tabId":123},"timeoutMs":60000}
```

Response (extensão→daemon):

```json
{"id":"<uuid>","type":"tool_response","ok":true,"result":{"content":"...","images":["<base64 png>"]}}
{"id":"<uuid>","type":"tool_error","ok":false,"error":{"code":"TIMEOUT|DENIED|TAB_GONE|PROTOCOL|INTERNAL","message":"..."}}
```

Regras:

- `id` (string uuid v4, gerado pelo daemon) correlaciona async; concorrência via `id` + fila por tab (fluxo 12). Respostas fora de ordem são normais.
- `tool` ∈ inventário dinâmico da extensão (seção 7). Nome vazio → `tool_error{PROTOCOL}` sem encaminhar.
- `args.tabId`: se ausente, a extensão resolve para a aba ativa (`chrome.tabs.query({active:true})`) antes de chamar `executeTool` — corrige o `_tabId ?? 0` que hoje quebra file tools (`tools.ts:1713-1719`, falta 13).
- Imagens: `ToolResult.images[]`/`screenshots[]` viajam como base64 puro (sem `data:` URI) dentro de `result` (falta 15). Limite 8 MB por mensagem; acima disso → `tool_error{OVERSIZE}` + drop (fluxo 10).
- Malformado (JSON inválido, `id`/`type` ausentes) → `tool_error{PROTOCOL}` e drop da mensagem; nunca derruba o socket por 1 frame ruim (exceção: abuso — 10 erros/10s → fechar com `4400`).
- Timeout ponta-a-ponta: **60 s** default por call (seção 5). `timeoutMs` pode ser menor por tool, nunca maior que 60 s sem flag explícita.

Lado extensão (reuso, sem reinventar):

- `executeTool(msg.name, msg.input, msg.tabId)` + resposta = espelho exato do padrão `message-router.ts:32-34` (`tool:execute`) e `:173-175` (`test:tool`) (invento 4).
- Permission gate antes de executar: `toolsNeedingPermission` + `permissionManager.check(domain,name)` + `indicator:shield` (`tools.ts:1622-1667`); `executeNavigateTool` `:989-1001` como referência (invento 5). `DENIED` volta como `tool_error`, não como throw.
- Helpers CDP inalterados: `injectAndEval` (`:1752-1763`), `captureScreenshot` (visibleTab→debugger fallback, `:1771-1785`), `waitForPageLoad` (`:1790-1805`) (invento 8).
- `browser_batch` aninhado continua bloqueado (`:1721-1734`, falta 15) — o daemon rejeita `browser_batch` dentro de `browser_batch` com `PROTOCOL`.
- `MAX_TOOL_ITERATIONS=10` + `baRouteState` + `executeTool(tc.name,argsWithTab,tabId)` (`chat-handler.ts:48,100-264`, invento 9) continuam valendo para o loop interno da extensão; o daemon não reimplementa loop agentic — 1 `tools/call` = 1 `executeTool` (servidor stateless, fluxo 12).
- MV3 SW efêmero: `keep-alive.ts:5-7` (`ba-keep-alive` 0.33 min) + `start/stopKeepAlive` (`chat-handler.ts:271,310`, invento 7) devem envolver cada call do bridge; o daemon assume a extensão pode suspender e usa timeout+retry com mesmo `id` (idempotente por `id`).
- Permissões `manifest.json:15-29` + host `http/*,https/*` (`:30-33`, invento 6) já cobrem o piloto; nenhuma permissão nova nesta fase.

## 5. Timeouts e erros

| Caso | Valor / mapeamento |
|---|---|
| Default por tool | **60 000 ms** no daemon (do `tools/call` ao `tool_response`). Cobre CDP lento; substitui os únicos timeouts existentes hoje (web_search 15 s `:1189`, web_fetch 30 s `:1288`, invento 12) como teto. |
| Piloto | `navigate` 20 s; `computer` 30 s; leituras (`take_snapshot`, `get_page_text`, `tabs_context`, consoles, network) 15 s; resto, teto de 60 s. Qualquer estouro → `tool_error{TIMEOUT}`. |
| Erros | `DENIED` (permission gate), `TAB_GONE` (aba fechada), `TIMEOUT`, `PROTOCOL` (schema/nome inválido), `INTERNAL` (exceção). `result.error` da extensão vira `tool_error` com `code` + `message=content` — nunca stack cru. |
| Reconnect | Só a extensão disca (contrato). Backoff 500 ms × 60 tentativas (30 s, fluxo 9); após 60 falhas a extensão marca Disconnected e para. `stdin end` no modo `--stdio` encerra o daemon por completo (on-demand, sem zumbi); no modo `daemon start` (persistente) só fecha o stdio-client. |

## 6. Regra primary/client por porta (default 18765)

Duas instâncias (ex.: 2 perfis, 2 versões) não podem dividir o bind:

1. `daemon --port P` tenta `listen 127.0.0.1:P`. Sucesso → **primary**: serve `/status`, `/ws`, `/mcp`, detém o token e a fila.
2. Falha `EADDRINUSE` → o candidato faz `GET 127.0.0.1:P/status`. `200` com `browser-agent` → vira **client**: não serve nada, imprime `{"primary":false,"port":P}` e (se `--stdio`/`--mcp`) encaminha seu MCP para `POST 127.0.0.1:P/mcp`. Qualquer outro `200`/erro → porta ocupada por terceiros: aborta com mensagem, nunca sequestra.
3. `--port 0` = porta efêmera só para teste; nesse modo o daemon sempre é primary e imprime a porta real no stdout.
4. `install-skill` sempre aponta para a porta do primary (`config.json:{port}`).

## 7. Tools dinâmicas — MCP `tools/list` ⇄ `executeTool`

A extensão é dona do inventário (`ALL_TOOLS`, 18 tools). O daemon não tem
allowlist nem mapa de nomes: em `tools/list` envia o frame `list_tools`,
recebe `tools_response` e repassa `{name,description,inputSchema}` direto.
`tools/call` valida só forma (nome não vazio, tabId numérico, url http(s),
sem aninhar `browser_batch`) e encaminha; nome desconhecido recebe o erro
`INTERNAL` da extensão. `tabId` ausente → aba ativa (seção 4), nunca `0`.
Texto acima de 50 000 chars é truncado com marcador; imagens saem como
`image/jpeg`.

## 8. Segurança (localhost + token, sem exceção)

- Bind só `127.0.0.1` (fluxo 15). Nenhuma flag expõe para LAN; `--host` não existe.
- `/status` aberto (healthcheck, fluxo 8); tudo o resto exige Bearer do arquivo token (fluxo 6–7). Token nunca em log, nunca em URL após pareamento, nunca commitado.
- Allowlist de origens MCP client: loopback por padrão; `--allow-mcp-from` só aceita CIDRs `127/8` nesta fase (falta 12 adiada para pós-piloto junto com timeout por tool fino).
- Permission prompts continuam na extensão (gate da seção 4). O daemon não auto-aprova `DENIED`.
- Oversize/JSONL inválido: drop + `tool_error` (fluxo 10); frame sem `id` nunca recebe resposta.

## 9. Critérios de aceite (piloto implementável e testável)

1. `go build ./...` gera um binário; `daemon --port 18765` serve `/status` 200 sem auth e rejeita `/ws` sem Bearer com 403.
2. Extensão disca `/ws` com o token pareado; `POST /mcp tools/call{take_snapshot}` retorna árvore com `uid_`; `tools/call{computer,action:screenshot}` retorna JPEG base64 válido (só `[A-Za-z0-9+/=]`); `tools/list` espelha as 18 do `ALL_TOOLS`.
3. `navigate` para domínio bloqueado retorna `DENIED`; `tabId` omitido usa a aba ativa; segunda instância na mesma porta vira client (seção 6).
4. Round-trip `tools/call→executeTool→ToolResult` coberto por teste Go (`internal/mcp` + `internal/bridge` com hub fake) — falta 16, escopo mínimo: 5 pilotos × ok/erro + timeout 60 s simulado.
5. `daemon install-skill --client claude-code` escreve config e é idempotente; `daemon upgrade --check` não altera nada. Doc de host por OS (Win/mac/linux: path do token, porta, `register`) sai do `install-skill --help`, não de wiki externa.
