# BrowserAgent

AI-powered Chrome extension (Manifest V3) — navigate, click, type, and extract data from any webpage via configurable LLM providers.

## Structure

- `extension/` — extension source (side panel, service worker, content scripts, `manifest.json`, `docs/`)
- `mcp-host/` — Go daemon bridging the extension to MCP/Claude (`SPEC.md`)
- `scripts/` — build and diagnostic scripts (`sync-models.js`, `health-check.js`)
- `.docs/` — research, reference docs and internal checklists
- `.specs/` — specs, tasks and execution reviews

## Quick start

```bash
npm install
npm run build        # tsc + vite build -> dist/
npm run sync-models  # sync model catalog
npm run pack         # zip dist/ -> browser-agent.zip
```

Load `dist/` as an unpacked extension in `chrome://extensions` (Developer mode).

## Docs

- Privacy policy: `extension/docs/PRIVACY_POLICY.md`
- MCP bridge: `extension/docs/mcp-bridge.md`
- Web Store checklist: `.docs/CHROME_WEBSTORE_CHECKLIST.md`
- Claude-extension research: `.docs/claude-extension/`
