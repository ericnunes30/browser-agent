# Capacidades e Features do Claude em Chrome

## 1. 🤖 Automação do Navegador (Browser Automation)

O Claude pode executar ações diretamente no navegador via tools:

| Ação | Descrição |
|------|-----------|
| **Navegar** | Ir para URLs, seguir links |
| **Clicar** | Cliques em elementos (coordenadas + seletor) |
| **Digitar** | Preencher campos de texto, formulários |
| **Scroll** | Rolagem vertical/horizontal |
| **Screenshot** | Capturar tela da página |
| **Ler página** | Extrair texto completo ou interativamente |
| **Executar JavaScript** | Rodar scripts arbitrários |
| **Ler console** | Acessar mensagens do console |
| **Requisições de rede** | Monitorar/inspecionar tráfego |
| **Acessibilidade** | Ler árvore de acessibilidade da página |

---

## 2. 🎯 Gerenciamento de Abas e Grupos (Tab Groups)

- Claude gerencia **grupos de abas** (tab groups)
- Pode criar grupos, adotar abas órfãs, fechar grupos
- `TabGroupManager` (objeto `t` no service worker)
- Permite Claude trabalhar em várias abas simultaneamente
- Suporte a **multi-tab tasks** (pesquisar em vários sites)

---

## 3. 🔒 Sistema de Permissões

### Modos de Permissão
| Modo | Descrição |
|------|-----------|
| **Ask before acting** | Claude pergunta antes de cada ação |
| **Act without asking** | Claude age sem pedir permissão (alto risco) |
| **Skip permissions** | Pular permissões para sessão atual |

### Site-level Permissions
- **Approved sites** — sites onde Claude pode agir livremente
- **Always allow** — salvar permissão para um site
- **Allow once** — permitir apenas uma vez
- **Allow for all chats** — persistente entre conversas
- **Domain transitions** — Claude pausa quando navega entre domínios

### Shield System
- `lightshield-Dx3kyqnQ.svg` (modo claro)
- `darkshield-C5QZAT-q.svg` (modo escuro)
- Indicador visual quando Claude está protegido/restrito

---

## 4. 🎙️ Gravação de Workflows (Record Workflow)

- Claude pode aprender **workflows** gravados pelo usuário
- **Voice narration**: microfone para narrar enquanto demonstra
- Gera passos que Claude pode repetir automaticamente
- Suporte a GIFs animados com indicadores de ação

---

## 5. 📋 Shortcuts e Tarefas Agendadas

### Shortcuts
- Comandos rápidos digitando `/` no chat
- Podem ser executados manualmente ou em schedule
- Placeholders: `{{modelName}}`, `{{currentDate}}`, `{{platform}}`

### Tarefas Agendadas
- Execução automática em **horários específicos**
- Repetição: **once, daily, weekly, monthly, annually**
- Notificação ao completar
- Task Manager integrado

---

## 6. 🔌 Integrações e Conectores

| Integração | Status |
|------------|--------|
| **Google Workspace** | APIs estruturadas para Docs, Sheets, Slides, Gmail, Calendar |
| **Slack** | Conector via bridge |
| **Outlook** | Conector via bridge |
| **Google Drive** | Busca e leitura de arquivos |
| **Desktop App** | Native messaging host |
| **Claude Code** | Native messaging para Claude Code |

---

## 7. 🎨 Artefatos (Artifacts)

Claude pode criar e exibir artefatos ricos:
- **Documentos**, planilhas, código, diagramas
- **Gráficos Mermaid** (flowchart, sequence, class, state, ER, Gantt, etc.)
- **Fórmulas KaTeX** (matemática)
- **Cytoscape** para grafos
- **GIFs animados** do workflow
- Download de arquivos

---

## 8. 🖱️ Indicadores Visuais em Tempo Real

Quando Claude está agindo na página:
- **Cursor fantasma** (`#claude-phantom-cursor`) — ícone laranja do Claude
- **Transição suave** (180ms cubic-bezier) entre posições
- **Círculo de clique** laranja com glow
- **Labels de ação** (descrição do que Claude está fazendo)
- **Drag paths** (setas vermelhas indicando arrasto)
- **Progress bar** na geração de GIFs
- **Watermark** do Claude nos GIFs

---

## 9. 🔐 Segurança e Privacidade

- **Blocked URL patterns**: organizações podem bloquear sites
- **Force login org UUID**: restringe uso a organizações específicas
- **Password field filtering**: campos de senha são ocultados da árvore de acessibilidade
- **Warning** para modos de alto risco
- **Domínios bloqueados** exibem `blocked.html`
- **Prompt injection warnings** para sites maliciosos
- Relatório de violações de política

---

## 10. 🛠️ Tools do Claude (Identificadas)

Baseado nas strings de i18n e código:

| Tool | Descrição |
|------|-----------|
| `browse` | Navegar para URL |
| `click` | Clicar em elemento |
| `type` | Digitar texto |
| `scroll` | Rolar página |
| `screenshot` | Capturar tela |
| `read_page` | Extrair texto |
| `execute_javascript` | Rodar JS |
| `read_console` | Ler console |
| `read_network` | Ler requisições |
| `find_element` | Encontrar elemento no DOM |
| `set_form_value` | Definir valor de campo |
| `hover` | Passar mouse sobre elemento |
| `wait` | Aguardar tempo |
| `press_key` | Pressionar tecla |
| `hold_key` | Segurar tecla |
| `web_search` | Pesquisar na web |
| `web_fetch` | Buscar conteúdo de URL |
| `read_file` | Ler arquivo |
| `edit_file` | Editar arquivo |
| `create_file` | Criar arquivo |
| `download` | Baixar arquivo |

---

## 11. 📱 Modos de Exibição

- **Side Panel** (padrão) — painel lateral do Chrome
- **Popup Window** — janela popul-up separada (500x768)
- **Full screen mode** — modo tela cheia

---

## 12. 🧪 Recursos Experimentais

- "Quick mode" — navegação experimental mais rápida
- "Beta" features identificadas
- "Sessions API" — nova experiência de chat
- "Cowork" — modo além do navegador (integração com sistema de arquivos)
- Debug settings para desenvolvimento
