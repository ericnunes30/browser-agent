---
phase: plan
task: T1
feature: browser-extension
timestamp: 2026-05-07T14:50:56.451Z
attempt: 1
---

## T1 Planner Evaluation

**needsResearch: false**

T1 is a greenfield scaffold with all requirements fully specified in design.md, spec.md, and tasks.md. No external API docs or existing code patterns need investigation.

### Recommended: @crxjs/vite-plugin
Best Vite + MV3 plugin (2.4k+ stars), first-class React support, HMR for SW + HTML pages, auto-injects content scripts and web-accessible resources.

### Key files to create:
- manifest.json (MV3, 12 permissions, side_panel, CSP with connect-src for LLM APIs)
- vite.config.ts (@crxjs/vite-plugin with React plugin)
- tsconfig.json (strict mode)
- package.json (React 19, Vite, TypeScript, @crxjs/vite-plugin)
- HTML shells (sidepanel, options, offscreen)
- Placeholder icons (simple colored circle 16/32/48/128)
- Empty module stubs with placeholder exports
- config/models.default.json (empty providers object)