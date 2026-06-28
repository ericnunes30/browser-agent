# Melhorias de UI do Chat para o BrowserAgent

> Relatório de pesquisa · baseado em engenharia reversa do **Claude in Chrome** (`fcoeoabgfenejglbffodgkkbkcdhcgfn` v1.0.70) e no baseline atual do **BrowserAgent**.
> Foco: **side panel / chat** (input, lista de mensagens, header, seletor de modelo, anexos, streaming, histórico, estados). **Fora do escopo:** MCP, tab groups, debugger/CDP, native messaging.

---

## Resumo executivo

O BrowserAgent já tem uma fundação sólida (React 19, streaming via Port, seletor de modelo, permissões, comandos `/`, anexos). As melhorias abaixo são **pequenas mudanças de UI** com **alto impacto** sobre percepção de qualidade, confiança e produtividade — sem alterar a arquitetura. Foram priorizadas por impacto no usuário vs. esforço de implementação.

Top 5 (implementar primeiro): **1, 2, 4, 6, 11**.

---

## 1. Auto-scroll inteligente (não pular quando o usuário rolou para cima)

**Claude:** durante streaming, o chat rola automaticamente para a última mensagem **somente se o usuário já está próximo do fim**; quando o usuário rola para cima para ler o histórico, o auto-scroll pausa e exibe um botão flutuante "↓ Jump to latest" (padrão universal de chat).

**BrowserAgent atual:** `ChatWindow.tsx:11-13` faz `bottomRef.current?.scrollIntoView({ behavior: 'smooth' })` em **toda** mudança de `messages`. Durante streaming, isso força a rolagem a cada delta, "puxando" o usuário para baixo mesmo quando ele está lendo algo acima.

**Mudança:**
- Em `ChatWindow.tsx`: detectar se `bottomRef` está dentro de ~80px do final antes de rolar; se não, **não** rolar.
- Renderizar um botão flutuante `position: sticky; bottom: 12px;` no canto inferior direito com ícone de seta para baixo e contador de mensagens não lidas (`+3`), aparecendo só quando o usuário está afastado do fim. Clicar → `scrollIntoView({ behavior: 'smooth' })` e limpar contador.

**Prioridade:** ALTA · **Esforço:** pequeno (1 componente, ~30 linhas, sem refatorar streaming).

---

## 2. Stop vira botão dedicado no input (com hint de atalho `Esc`)

**Claude:** o botão de enviar no canto inferior direito do input **se transforma em um quadrado preto de Stop** durante o streaming, e um tooltip mostra "Stop · Esc" (atalho alternativo).

**BrowserAgent atual:** `ChatInput.tsx:387-410` já faz essa transformação (seta → stop), mas:
- O stop fica também duplicado no header (`Header.tsx:184-200`), competindo com o input.
- Não há dica de atalho `Esc` visível.

**Mudança:**
- Manter **só** o botão de stop no input (remover o do header, ou movê-lo para a direita do seletor de modelo).
- No `title` do botão durante streaming, escrever: "Stop generation (Esc)".
- Adicionar `useEffect` em `ChatInput.tsx` que escuta `keydown` global: `if (e.key === 'Escape' && isStreaming) stopGeneration()`. Não interfere com o textarea (Esc deve fechar comandos/dropdowns primeiro; só age se não houver menu aberto).

**Prioridade:** ALTA · **Esforço:** pequeno (10 linhas + listener global).

---

## 3. Anexos: thumbnails clicáveis, com overlay de remoção e contador

**Claude:** imagens anexadas no input aparecem como **thumbnails 64×64** com:
- Borda sutil arredondada.
- **Botão "×" preto no canto superior direito** sempre visível (não só no hover).
- **Contador `+N` em gradiente** quando há mais de 3 anexos, com clique para abrir um lightbox/grid.

**BrowserAgent atual:** `ChatInput.tsx:236-264` tem o padrão certo (56×56 com `×` no canto), mas:
- O `×` só aparece em hover, é pequeno (16px) e fica meio fora do thumbnail.
- Não há contador para múltiplos anexos.
- Click no thumbnail não faz nada (não dá preview ampliada).

**Mudança:**
- Aumentar o botão `×` para 18×18, `top: -8, right: -8`, sempre visível (não em hover), com fundo `var(--color-bg-200)` e borda.
- Quando `attachments.length > 3`: mostrar os 2 primeiros thumbnails + um chip `+N` (40×40, mesmo estilo) que abre um popover/list com os nomes e botões de remover.
- Click no thumbnail (não no `×`) abre um overlay simples com a imagem em 90% do painel.

**Prioridade:** MÉDIA · **Esforço:** pequeno (15 linhas + estado de popover).

---

## 4. Estados de erro ricos (não só "Error: <string>")

**Claude:** mostra **chips coloridos** com texto e ação para erros comuns (referência `07-i18n-strings-uteis.md:21-31`):
- `Failed to fetch` → chip vermelho + botão "Retry".
- `We couldn't connect to Claude. Please check your network` → chip amarelo + link "learn more".
- `This model isn't available right now` → chip cinza + dropdown para escolher outro modelo.
- `Claude landed on a blocked site` → chip vermelho + link para gerenciar sites.

**BrowserAgent atual:** `ChatContext.tsx:316` simplesmente faz `updateMessage(assistantMsg.id, \`Error: ${error}\`)`. Tudo vira uma string vermelha, sem ação.

**Mudança:**
- Em `ChatContext.tsx`, tipar `onError` para receber um objeto `{ kind: 'network' | 'auth' | 'model_unavailable' | 'rate_limit' | 'unknown', message, retryable, learnMoreUrl? }`.
- Em `MessageBubble.tsx`, quando `message.role === 'assistant' && message.content.startsWith('Error:')`, renderizar um card de erro estilizado em vez de texto puro:
  - Ícone à esquerda (svg ⚠️ ou 📡 dependendo do `kind`).
  - Mensagem amigável (mapa `kind` → i18n string).
  - Botões à direita: **Retry** (reenvia a última mensagem) e, se houver `learnMoreUrl`, "Learn more" (abre nova aba).
- `retryable: true` só para `network` e `rate_limit` (não tenta retry em `auth`).

**Prioridade:** ALTA · **Esforço:** médio (afeta ChatContext + MessageBubble + ChatStream para repassar tipo).

---

## 5. Stream interrompido: indicador visível e botão "Continue"

**Claude:** quando o stream para antes do fim (por rede, erro, etc.), a mensagem fica com um **subtle dashed border** e um botão "Continue" no rodapé, em vez de `(stopped)` truncado.

**BrowserAgent atual:** `ChatContext.tsx:340` define `content: '(stopped)'` — texto literal confuso.

**Mudança:**
- Não substituir conteúdo por `(stopped)`. Em vez disso, manter o conteúdo parcial e renderizar **uma faixa fina** abaixo do bubble com ícone de pausa + texto "Generation stopped" + botão "Continue" (envia uma mensagem de sistema `"continue"` ao modelo).
- Cor: amarelo discreto (`hsla(45, 100%, 50%, 0.1)`), borda tracejada.
- Adicionar flag `message.stopped: boolean` ao tipo `DisplayMessage`.

**Prioridade:** MÉDIA · **Esforço:** pequeno-médio (5 linhas no contexto + componente inline no MessageBubble).

---

## 6. Header: trilha "modelo › modelo" e status de tool em execução

**Claude:** o header exibe não só o modelo selecionado, mas também **o estado da execução atual** durante tool calls: badge com nome do tool + spinner + label do que o Claude está fazendo ("Reading page…", "Navigating to github.com…"). Quando o tool termina, o badge desaparece.

**BrowserAgent atual:** `Header.tsx:62-78` mostra só logo + nome do modelo. `MessageBubble.tsx:191-217` mostra tool calls inline no bubble, mas o usuário pode estar scrollado para cima e não vê.

**Mudança:**
- No centro do `Header`, adicionar uma área de status que aparece **só durante tool calls**:
  - Ícone do tool (`navigate`, `click`, `screenshot` etc.) + texto curto: "Reading page…" / "Clicking 'Submit'" / "Navigating to example.com".
  - Spinner ao lado (animação `ba-spin` que já existe no CSS).
- Fonte: nova mensagem do SW `tool:status` enviada a cada `toolStart`/`toolEnd` (já temos o evento; só não exibimos no header).
- Largura: `flex: 1; overflow: hidden; text-overflow: ellipsis;` para truncar URLs longas.

**Prioridade:** ALTA · **Esforço:** pequeno (Header ganha 1 filho condicional + tipos).

---

## 7. Seletor de modelo: busca, "favoritos" e descrição no hover

**Claude:** dropdown do modelo:
- Campo de busca no topo (filtra por nome e por provedor).
- Modelos **recentemente usados** marcados com ícone de relógio.
- Modelos com **tool-use** marcados com ícone de ferramenta (wrench).
- Hover em cada item mostra tooltip com **descrição** (ex: "Best for coding — 200K context").

**BrowserAgent atual:** `Header.tsx:108-160` é um dropdown simples, sem busca, sem destaque de capacidade.

**Mudança:**
- Adicionar `<input>` no topo do menu (`Header.tsx:113-114`), filtrar lista por `model.includes(query) || provider.name.includes(query)`.
- Em `ChatContext.tsx:175`, modelo pode ter `meta?: { description?, capabilities?: ('tools' | 'vision' | 'reasoning')[] }`. Renderizar chips pequenos (`🔧 tools`, `👁 vision`) à direita do nome.
- Persistir `lastUsed` por modelo (timestamp da última seleção) em `chrome.storage.local`; ordenar seção "Recent" antes da lista completa.

**Prioridade:** MÉDIA · **Esforço:** médio (envolve extensão do tipo + storage + novo input).

---

## 8. Histórico de conversas (sidebar lateral com lista + previews)

**Claude:** botão "History" no header abre um **drawer lateral** (sobrepõe o chat, ~80% da largura) com:
- Lista de conversas anteriores, cada item: **título** (auto-gerado da 1ª mensagem), **preview de 1 linha** da última mensagem, **timestamp relativo** ("2h ago", "Yesterday").
- Busca no topo.
- Botão "New chat" sempre visível no rodapé do drawer.
- Confrinho "Delete" no hover de cada item.

**BrowserAgent atual:** `Header.tsx:228-249` tem um botão "History (coming soon)" que **não faz nada** (`onClick={() => {}}`). Não há persistência de conversas.

**Mudança:**
- Persistir cada conversa em `chrome.storage.local` com chave `ba-conversations`:
  ```ts
  type Conversation = { id: string; title: string; preview: string; updatedAt: number; messages: DisplayMessage[] }
  ```
- Auto-título: primeiras 6 palavras da 1ª mensagem do usuário (ou "New chat" se vazia).
- Auto-preview: primeiros 80 chars da última mensagem (user ou assistant).
- Componente `HistoryDrawer.tsx`: abre da esquerda, lista virtualizada se > 30 itens, busca por título/conteúdo, click carrega, hover mostra `🗑 Delete`.
- Botão do header agora é funcional e abre o drawer.

**Prioridade:** MÉDIA · **Esforço:** médio-grande (novo componente + storage + migração do estado atual).

---

## 9. Mensagens: timestamps relativos + ações de hover

**Claude:** cada bubble tem:
- **Timestamp relativo** abaixo do conteúdo ("2 min ago", "Just now") — atualiza a cada minuto.
- Em hover, aparecem **botões de ação** alinhados à direita abaixo do bubble: 📋 Copy, 🔄 Regenerate (só em mensagens do assistant), 👍 / 👎.
- Em code blocks: botão "Copy" dedicado no canto.

**BrowserAgent atual:** `MessageBubble.tsx` não exibe timestamp, nem ações. A string `timestamp: number` existe em `DisplayMessage` (ChatContext.tsx:18) mas é ignorada.

**Mudança:**
- Abaixo do bubble (linha discreta, `font-size: 11, color: text-400`), renderizar `formatDistanceToNow(message.timestamp, { addSuffix: true })`. Re-render a cada 60s com `setInterval`.
- Em hover do bubble (`:hover` com CSS ou estado React), revelar 2-3 ícones 24×24 à direita:
  - **Copy** (sempre): copia `message.content` para clipboard, troca ícone por ✓ por 1.5s.
  - **Regenerate** (só assistant, não streaming): reenvia o último `user` message antes desta.
  - **Feedback** (só assistant): 👍/👎 → envia `chat:feedback` ao SW (futuro).
- Usar CSS group-hover em vez de estado React para performance.

**Prioridade:** MÉDIA · **Esforço:** médio (precisa lib de datas, ex: `date-fns`, ou implementação leve de "X min ago").

---

## 10. "Chat paused" + banner de modelo indisponível

**Claude:** quando o usuário fica ocioso ou o modelo falha, o Claude pode **pausar** a conversa. O header mostra um **chip amarelo "Chat paused · Resume"** (string i18n `bL7dVUkHa0` em `07-i18n-strings-uteis.md:11`).

**BrowserAgent atual:** nada. O estado de "modelo sumiu da lista" (`hasNewModels`) é tratado como "New" badge, mas se o **modelo atual** deixa de existir, o usuário clica Send e recebe `Error: ...` sem pista do que aconteceu.

**Mudança:**
- Ao montar e ao `checkForNewModels`, se `activeModel` não está mais em `providers[activeProvider].models`, mostrar **banner persistente** no topo (entre Header e ChatWindow):
  - Texto: "Model 'gpt-4o' is no longer available. Pick another:"
  - Botão "Choose model" que abre o dropdown do header já aberto.
- Adicionar i18n: `chat_model_unavailable`, `chat_choose_model`.
- Cor de fundo: amarelo suave (mesmo `hsla(45, 100%, 50%, 0.08)` que já existe no host warning).

**Prioridade:** MÉDIA · **Esforço:** pequeno (8 linhas em App.tsx, condicional).

---

## 11. Botão "Stop" do header com label e estado "thinking"

**Claude:** o header tem um botão **"Stop"** com label visível (não só ícone) que aparece durante streaming, e quando o modelo está só "thinking" (sem tokens ainda) mostra um indicador "Thinking…" à esquerda do botão.

**BrowserAgent atual:** `Header.tsx:184-200` já tem o botão de stop no header, mas com label `t('chat_abort')` (provavelmente "Stop" — confirmar) e sem distinção entre "thinking" e "streaming".

**Mudança:**
- Adicionar estado `isThinking` (true enquanto streaming mas `lastMessage.content === '' && !lastMessage.tool_calls`).
- Quando `isThinking`, mostrar ao lado do botão "Stop": `● Thinking…` (com dot pulsando).
- Garantir que o label "Stop" esteja traduzido em pt-BR ("Parar").

**Prioridade:** BAIXA · **Esforço:** pequeno (3 linhas).

---

## 12. Prompt de permissão: modal inline (não overlay) + atalho de teclado

**Claude:** o prompt de permissão (`04-capacidades-features.md:48-66` e `07-i18n-strings-uteis.md:36-44`) é um **card inline flutuante** preso à parte de baixo do chat, com:
- Lista de **sites aprovados** (allowlist) visível.
- Opção "Always allow" / "Allow once" / "Deny" como radio chips.
- **Teclas de atalho**: `A` = allow, `D` = deny, `O` = allow once (sem precisar do mouse).
- Frase clara: "Claude wants to {action} on {domain}" — não jargão "Permission required".

**BrowserAgent atual:** `PermissionPrompt.tsx:91-122` é um modal overlay centralizado com copy técnica ("Permission required", "The agent wants to..."). Sem atalhos. Checkbox "Allow for all chats" confuso.

**Mudança:**
- Trocar overlay centralizado por **bottom sheet** (igual ao `TaskManager.tsx`, `position: fixed; bottom: 0; left/right: 0`), com copy mais clara:
  - Título: "Allow Claude to {action} on **{domain}**?"
  - Sub: "Using {toolName}" + ícone do tool.
- 3 botões grandes lado a lado: **Allow** (primário), **Allow once**, **Deny** (secundário). Substituir o checkbox "Allow for all chats" por **toggle separado** ao lado do botão "Allow" (`forAllChats: ☐ Save for all chats`).
- Adicionar listener `keydown` global enquanto o prompt está aberto: `A` → handleAllow, `O` → handleAllowOnce, `D` → handleDeny, `Esc` → handleDeny.
- `focus` automático no botão "Allow" ao abrir.

**Prioridade:** ALTA · **Esforço:** médio (refator de layout + 4 listeners de teclado).

---

## 13. Modo "first run": empty state com sugestões de prompts

**Claude:** o **empty state** do chat (sem mensagens) mostra 3-4 **suggested prompt cards** clicáveis, cada um com ícone e label curto:
- "Summarize this page"
- "Find the cheapest flight to Lisbon"
- "Draft a reply to this email"
- "Extract all links from the current tab"

**BrowserAgent atual:** `ChatWindow.tsx:23-66` é um empty state simples: só logo + título + descrição.

**Mudança:**
- Em `ChatWindow.tsx:48`, abaixo do "chat_empty_desc", renderizar 2-3 cards de sugestões (4 sugestões se houver páginas com frequência alta). Cada card: `padding: 10px 12px; background: var(--color-bg-200); border-radius: 10px;` com ícone à esquerda + texto à direita; click preenche o textarea (não envia direto — usuário ainda revisa).
- Lista de sugestões pode ficar em `ChatContext.tsx` (constante) ou vir do SW com base no contexto da aba ativa (`chrome.tabs.query({ active: true })` → heurística: e-commerce → "Find the best deal", documentação → "Summarize this doc").
- Sugestões devem ser i18n: `chat_suggest_summarize`, `chat_suggest_find`, etc.

**Prioridade:** MÉDIA · **Esforço:** pequeno (10 linhas + 3-4 strings i18n).

---

## 14. Atalhos de teclado globais (Cmd/Ctrl+K, Cmd/Ctrl+Shift+S, etc.)

**Claude:** documentação i18n `07-i18n-strings-uteis.md:65-67` mostra "Configure the keyboard shortcut used to open Claude in Chrome". Além do atalho de abrir o side panel, há atalhos **dentro** do chat:
- `Cmd/Ctrl+K` → foca o input.
- `Cmd/Ctrl+Shift+S` → tira screenshot da aba e anexa.
- `Cmd/Ctrl+/` → abre commands menu.
- `Up arrow` no input vazio → edita a última mensagem do usuário.

**BrowserAgent atual:** nenhum atalho in-app. O `manifest.json` deve ter `commands` para o side panel, mas não foi verificado.

**Mudança:**
- Adicionar `useEffect` em `App.tsx` com listener global `keydown`:
  - `Cmd/Ctrl+K` → `textareaRef.current?.focus()` (passar ref do ChatInput para cima via context).
  - `Cmd/Ctrl+Shift+S` → chama `handleScreenshot` direto.
  - `Cmd/Ctrl+/` → foca input e prepende `/`.
- `Up` em input vazio → carrega `messages[messages.length - 2]?.content` no textarea (se for do usuário).
- Adicionar hint sutil no placeholder: "Press ⌘K to focus" ou um footer com `?` que abre um popover listando atalhos.

**Prioridade:** MÉDIA · **Esforço:** médio (ref + listeners + teste de cross-platform).

---

## 15. Acessibilidade: foco visível, ARIA, navegação por teclado em dropdowns

**Claude:** i18n menciona "Accessibility" e toda a UI é keyboard-navigable: dropdowns fecham com `Esc`, abrem com `Enter`/`Space` no trigger, items navegam com `↑/↓`, ARIA `role="menu"`, `aria-expanded`, `aria-selected`. Foco visível com outline laranja (`outline: 2px solid var(--color-brand)`).

**BrowserAgent atual:** tudo é `<div onClick={...}>` com `cursor: pointer` — não há roles ARIA, navegação por teclado nos dropdowns é parcial (apenas CommandsMenu tem `↑/↓/Enter/Esc`), e o foco visível é o default do Chrome (azul, fácil de perder no tema escuro).

**Mudança:**
- Adicionar regra global em `style.css`:
  ```css
  :focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; border-radius: 6px; }
  button:focus-visible, [role="menuitem"]:focus-visible { background: var(--color-border-100); }
  ```
- No `Header.tsx` (dropdown de modelo): adicionar `role="menu"`, `aria-haspopup="menu"`, `aria-expanded={modelMenuOpen}`. Itens: `role="menuitem"`, `aria-selected` no ativo. Navegação `↑/↓` + `Enter` + `Esc` (espelhar CommandsMenu).
- No `ChatInput.tsx` (Permission toggle, Actions menu): mesma coisa.
- Substituir `<div onClick>` por `<button type="button">` onde for interativo (boa prática de a11y; evita `tabindex=0` manual).
- Mensagens: `role="article"` no bubble, `aria-live="polite"` no container (screen reader anuncia novas mensagens sem interromper).

**Prioridade:** MÉDIA · **Esforço:** médio (refator de dropdowns, vale agrupar com #14).

---

## Resumo priorizado

| # | Tema | Prioridade | Esforço | Localização principal |
|---|------|-----------|---------|----------------------|
| 1 | Auto-scroll inteligente + jump-to-latest | ALTA | pequeno | `ChatWindow.tsx` |
| 2 | Stop no input com hint `Esc` | ALTA | pequeno | `ChatInput.tsx` + `Header.tsx` |
| 3 | Thumbnails de anexo polidos | MÉDIA | pequeno | `ChatInput.tsx` |
| 4 | Estados de erro ricos (retry, learn more) | ALTA | médio | `ChatContext.tsx` + `MessageBubble.tsx` |
| 5 | Stream interrompido com "Continue" | MÉDIA | pequeno-médio | `ChatContext.tsx` + `MessageBubble.tsx` |
| 6 | Status de tool em execução no header | ALTA | pequeno | `Header.tsx` + novo `tool:status` |
| 7 | Seletor de modelo com busca + capabilities | MÉDIA | médio | `Header.tsx` + `ChatContext.tsx` |
| 8 | Histórico de conversas (drawer) | MÉDIA | médio-grande | novo `HistoryDrawer.tsx` |
| 9 | Timestamps relativos + ações de hover | MÉDIA | médio | `MessageBubble.tsx` |
| 10 | Banner de modelo indisponível | MÉDIA | pequeno | `App.tsx` |
| 11 | Header com "Thinking…" + label Stop | BAIXA | pequeno | `Header.tsx` |
| 12 | Permission prompt: bottom sheet + atalhos | ALTA | médio | `PermissionPrompt.tsx` |
| 13 | Empty state com sugestões de prompts | MÉDIA | pequeno | `ChatWindow.tsx` |
| 14 | Atalhos de teclado globais (⌘K, ⌘⇧S) | MÉDIA | médio | `App.tsx` + `ChatInput.tsx` |
| 15 | Acessibilidade: ARIA + foco visível | MÉDIA | médio | `style.css` + dropdowns |

**Sugestão de sequência de implementação:** 1 → 2 → 6 → 12 → 4 → 5 → 3 → 10 → 11 → 13 → 9 → 14 → 15 → 7 → 8. As 5 primeiras (1, 2, 6, 12, 4) resolvem os pontos de fricção mais visíveis durante o uso diário e juntas somam ~1-2 dias de trabalho.
