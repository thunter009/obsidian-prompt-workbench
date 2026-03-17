# CLAUDE.md

Instructions for Claude Code on Obsidian Prompt Workbench plugin.

## Project Overview

Obsidian plugin for prompt template editing with Raycast snippet sync. Migrated from a Next.js web app — see `context/shaping/obsidian-migration-spike.md` for background.

## Quick Reference

### Commands
```bash
npm run build         # Production build (esbuild → main.js)
npm run dev           # Watch mode (rebuilds on change)
```

### Key Locations
| What | Where |
|------|-------|
| Plugin entry | `src/main.ts` |
| CM6 extensions | `src/placeholders/cm-extension.ts` |
| Placeholder parser | `src/placeholders/parser.ts` |
| Reading view | `src/placeholders/reading-view.ts` |
| LLM adapters | `src/llm/` |
| Improve modal | `src/improve/modal.ts` |
| Strategies | `src/improve/strategies.ts` |
| Playground panel | `src/playground/view.ts` |
| Raycast export | `src/raycast/export.ts` |
| Settings | `src/settings.ts` |
| Styles | `styles.css` |
| Shaping docs | `context/shaping/` |

### Vault Location
The Obsidian vault is at `~/obsidian/prompts/`. The plugin is symlinked into `.obsidian/plugins/prompt-workbench`.

### Architecture
- Obsidian plugin API (not React/Next.js)
- CM6 extensions registered via `registerEditorExtension()`
- Reading view via `registerMarkdownPostProcessor()`
- Settings via `this.loadData()` / `this.saveData()` → `data.json`
- LLM adapters: Ollama, OpenAI-compatible, Anthropic (streaming via fetch)
- `@codemirror/merge` bundled (not external — Obsidian doesn't ship it)
- All other `@codemirror/*` packages are external (provided by Obsidian)

### Critical Rules
- `main.js` must be a single bundled file
- CM6 packages (`@codemirror/state`, `@codemirror/view`) are external in esbuild
- `@codemirror/merge` is NOT external (must be bundled)
- Access CM6 EditorView via `leaf.view?.editor?.cm` with `@ts-expect-error`
- Use Obsidian CSS variables (`var(--text-normal)`, etc.) for theme compatibility
- Files prefixed with `_` are excluded from Raycast export
