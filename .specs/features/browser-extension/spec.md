# Spec — Browser Extension

> Feature: `browser-extension`  
> Status: Planned  
> Base: PRD.md + Engenharia reversa do Claude em Chrome

---

## User Stories

### P0: Foundation ⭐ MVP

#### US-01 — Extensão Carregável
**As a** developer, **I want** to load the extension in Chrome dev mode **so that** I can verify the scaffold works.

**Acceptance Criteria:**
1. WHEN I load `dist/` in `chrome://extensions` THEN the extension SHALL appear without errors
2. WHEN the extension is loaded THEN the service worker SHALL log `[SW] browser-agent loaded`
3. WHEN I click the extension icon THEN the side panel SHALL open

#### US-02 — Chat com Modelo
**As a** user, **I want** to chat with any LLM from the side panel **so that** I can ask questions and get AI assistance.

**Acceptance Criteria:**
1. WHEN I type a message and press Enter THEN the message SHALL appear in the chat
2. WHEN the model responds THEN text SHALL stream incrementally (word-by-word)
3. WHEN I select a different model from the dropdown THEN subsequent messages SHALL use that model
4. WHEN the model API returns an error THEN an error banner SHALL display (not crash)

#### US-03 — Navegação e Leitura
**As a** user, **I want** the agent to navigate between pages and read content **so that** I can extract web data.

**Acceptance Criteria:**
1. WHEN the agent calls `navigate` with a valid URL THEN the active tab SHALL load that URL
2. WHEN the agent calls `read_page` THEN the page's visible text content SHALL be returned
3. WHEN the page has interactive elements THEN `read_page_interactive` SHALL return them with positions

#### US-04 — Interação com Páginas
**As a** user, **I want** the agent to click, type, and screenshot pages **so that** it can perform actions on my behalf.

**Acceptance Criteria:**
1. WHEN the agent clicks an element THEN the page SHALL react to the click event
2. WHEN the agent types in an input THEN the input's `.value` SHALL match the typed text
3. WHEN the agent takes a screenshot THEN a valid PNG dataURL SHALL be returned
4. WHEN the agent scrolls THEN `window.scrollY` SHALL update

---

### P1: Core Experience

#### US-05 — Multi-Modelo Configurável
**As a** user, **I want** to configure any LLM provider **so that** I'm not locked into one vendor.

**Acceptance Criteria:**
1. WHEN I add a provider via Options Page THEN it SHALL appear in the model selector
2. WHEN I sync from `~/.pi/agent/models.json` THEN pi models SHALL merge with custom config
3. WHEN I remove a provider THEN its models SHALL disappear from the selector
4. WHEN a provider has invalid API key THEN the selector SHALL flag it

#### US-06 — Controle de Permissões
**As a** user, **I want** to control what actions the agent can perform on each site **so that** I stay in control.

**Acceptance Criteria:**
1. WHEN the agent tries its first action on a new site THEN a permission prompt SHALL appear
2. WHEN I click "Allow" THEN subsequent actions on that site SHALL NOT prompt again
3. WHEN I click "Deny" THEN the action SHALL NOT execute and the agent SHALL be informed
4. WHEN I set mode to "auto" THEN allowed sites SHALL skip all permission prompts
5. WHEN I view Options THEN I SHALL see all granted/denied permissions

#### US-07 — Feedback Visual
**As a** user, **I want** to see what the agent is doing on the page **so that** I can follow its actions.

**Acceptance Criteria:**
1. WHEN the agent clicks an element THEN a ripple animation SHALL appear at click position
2. WHEN the agent targets an element THEN a highlight border SHALL appear around it
3. WHEN the agent types in a field THEN a blinking cursor SHALL indicate the target
4. WHEN visual indicators are active THEN the page's normal interaction SHALL NOT be blocked

---

### P2: Convenience

#### US-08 — Scheduled Tasks
**As a** user, **I want** to schedule browser actions **so that** they run automatically.

**Acceptance Criteria:**
1. WHEN I create a task "navigate to X at time Y" THEN it SHALL appear in the task list
2. WHEN the scheduled time arrives THEN the task SHALL execute
3. WHEN a task fails THEN a Chrome notification SHALL alert me
4. WHEN I remove a task THEN the alarm SHALL be cancelled

#### US-09 — Áudio e GIF
**As a** user, **I want** the agent to speak responses and record GIFs **so that** I can consume content differently.

**Acceptance Criteria:**
1. WHEN audio playback is triggered THEN sound SHALL play through speakers
2. WHEN stop is called THEN playback SHALL stop immediately
3. WHEN GIF recording is triggered THEN a valid animated GIF SHALL be saved

#### US-10 — i18n
**As a** brazilian user, **I want** the extension in Portuguese **so that** I can use it in my native language.

**Acceptance Criteria:**
1. WHEN Chrome language is pt-BR THEN all UI text SHALL be in Portuguese
2. WHEN Chrome language is en-US THEN all UI text SHALL be in English
3. WHEN a translation key is missing THEN the system SHALL fallback to English

---

### P3: Future

#### US-11 — MCP Server
**As a** developer, **I want** to connect my coding agent to the browser extension via MCP **so that** it can use browser tools.

**Acceptance Criteria (future):**
1. WHEN a native messaging host connects THEN the extension SHALL register MCP tools
2. WHEN the coding agent sends a tool_request THEN the extension SHALL execute and respond
3. WHEN the MCP connection drops THEN pending tools SHALL be notified

---

## Out of Scope (v1)

- Chrome Web Store publication
- Multi-browser support (Firefox, Safari)
- Real-time collaboration (cowork feature)
- Analytics/telemetry (Segment, Sentry, Honeycomb)
- Enterprise managed storage policies
- Custom User-Agent spoofing (DNR header modification)
- URL category checking (api.anthropic.com/web/url_hash_check)
