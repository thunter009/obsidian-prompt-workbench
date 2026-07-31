# AGENTS.md: Obsidian Prompt Workbench

> Contract: durable rules only, 150-line budget. Dated lessons → session journal; task specifics → beads tracker; adding when full means deleting something weaker.

## Safety Rules

- **Human override**: the user's instructions take precedence over everything in this file.
- **No file deletion** without explicit permission in the current session.
- **No destructive git** (`git reset --hard`, `git clean -fd`, `rm -rf`, anything that can destroy uncommitted work) unless the user provides the exact command and explicit approval. Prefer `git status` / `git diff` / `git stash`.
- **No file proliferation**: no `_v2` / `_backup` / `_improved` variants; edit files in place.
- **Multi-agent awareness**: never stash, revert, or overwrite another agent's uncommitted changes; investigate unexpected modifications first.

## Toolchain

- Node.js (ES2022, runs inside Obsidian's Electron shell); npm with `package-lock.json`
- TypeScript 5.7+ (`strictNullChecks`, `noImplicitAny`); esbuild via `node esbuild.config.mjs`
- Tests: vitest (`npm test`, `npm run test:watch`, `npm run test:coverage`); happy-dom + stubs in `src/test-support/`
- Build: `npm run build` (production, minified `main.js`) / `npm run dev` (watch, inline sourcemap)

### Critical Build Rules

1. `main.js` must be a single bundled file — Obsidian loads plugins from one JS file.
2. `obsidian`, `@codemirror/state`, `@codemirror/view` are **external** (Obsidian provides them at runtime).
3. `@codemirror/merge` must be **bundled** — Obsidian does not ship it.
4. Access the CM6 EditorView via `leaf.view?.editor?.cm` with `@ts-expect-error`.
5. Use Obsidian CSS variables (`var(--text-normal)`, `var(--background-primary)`); never hardcode colors; support `.theme-dark` overrides in `styles.css`.

## Architecture

Obsidian plugin for prompt template editing with Raycast snippet sync: placeholder highlighting, LLM-powered improvement, interactive playground, graph integration, Raycast export.

| Area | Path |
|------|------|
| Plugin entry, settings | `src/main.ts`, `src/settings.ts` |
| Placeholders: parser, CM6 extension, reading view, graph links | `src/placeholders/` |
| LLM adapters: ollama, openai, anthropic, claude-code | `src/llm/` |
| Improvement strategies + streaming diff modal | `src/improve/` |
| Playground sidebar | `src/playground/` |
| Raycast export | `src/raycast/` |
| Vault reorg + duplicates modals | `src/reorg/`, `src/duplicates/` |
| Frontmatter + workflow helpers | `src/frontmatter.ts`, `src/workflow.ts` |
| User templates, design docs/PRDs | `templates/`, `context/shaping/` |
| E2E playbook, helper scripts | `tests/`, `scripts/` |

Vault: `~/obsidian/prompts/`; the repo is symlinked at `.obsidian/plugins/prompt-workbench`. `data.json` (settings) and `main.js` (bundle) are gitignored.

## Code Discipline

- Read sufficient context before editing; keep changes minimal — fix what's asked, don't refactor surroundings or annotate unchanged code.
- Early stage (v0.1.x): no backwards-compatibility burden. Do things right, no tech debt.
- Files prefixed with `_` are excluded from Raycast export (convention, not config).

## Quality Gates

Run after any code change, before committing:

```bash
npm run build && npm test && ubs $(git diff --name-only HEAD -- 'src/*.ts')
```

## Issue Tracking

`br` (beads_rust); issues in `.beads/`, tracked in git. Priorities P0–P4 as numbers; types: task, bug, feature, epic, chore, docs, question.

- Select work: `bv --robot-triage` (or `--robot-next`); fallback `br ready`
- Claim: `br update <id> --status in_progress`; finish: `br close <id>`; deps: `br dep add <issue> <depends-on>`
- Sync: `br sync --flush-only && git add .beads/ && git commit -m "sync beads"` — br never runs git.

## Git Workflow

- Default branch `main`; remote `git@github.com:thunter009/obsidian-prompt-workbench.git`
- Conventional commits (`feat:`, `fix:`, `chore:`) with optional scope + bead ID; atomic commits
- Rebase / `--ff-only` only; never merge commits
- Push only when explicitly required (PR, branch handoff, release); otherwise leave unpushed with handoff notes

## Landing the Plane

1. Quality gates (build + test + ubs on changed files)
2. Close finished beads; `br create` issues for discovered work
3. Sync beads, commit code with conventional messages, verify `git status` is clean

Work is NOT done until beads are synced and code is committed.

<!-- bv-agent-instructions-v2 -->

## bv Sidecar

bv is graph-aware triage over `.beads/issues.jsonl`. **Use ONLY `--robot-*` flags — bare `bv` launches an interactive TUI that blocks the session.** Scope boundary: bv decides *what to work on*; `br` creates/modifies/closes beads.

- `bv --robot-triage` — single entry point: ranked recommendations, quick wins, blockers to clear, project health, copy-paste next commands. Add `--format toon` for lower token use.
- `bv --robot-next` — single top pick + claim command.
- Others: `--robot-plan` (parallel tracks), `--robot-priority`, `--robot-insights` (PageRank, betweenness, critical path, cycles), `--robot-alerts`, `--robot-suggest`, `--robot-diff --diff-since <ref>`, `--robot-graph [--graph-format=json|dot|mermaid]`.
- Scoping: `--label <l>`, `--as-of <ref>`, `--recipe actionable|high-impact`.

<!-- end-bv-agent-instructions -->
