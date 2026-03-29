# AGENTS.md: Obsidian Prompt Workbench

> Guidelines for AI coding agents working in this codebase.

---

## Safety Rules

### Human Override

The user's instructions take precedence over everything in this file. If the user explicitly asks you to do something that contradicts a rule below, follow the user's instructions.

### No File Deletion

Never delete files or directories without explicit permission from the user in the current session. If something should be removed, ask first.

### No Destructive Git

The following commands are forbidden unless the user provides the exact command and explicit approval:

- `git reset --hard`
- `git clean -fd`
- `rm -rf`
- Any command that can delete or overwrite uncommitted work

Prefer safe alternatives: `git status`, `git diff`, `git stash`, copying to backups.

### No File Proliferation

Never create variant files (`main_v2.ts`, `modal_backup.ts`, `parser_improved.ts`). Edit existing files in place. New files are only for genuinely new functionality.

### Multi-Agent Awareness

Never stash, revert, or overwrite another agent's uncommitted changes. If you see unexpected modifications, investigate before touching them.

---

## Toolchain

- **Runtime:** Node.js (ES2022 target, runs inside Obsidian's Electron shell)
- **Package manager:** npm (`npm install`, `npm ci`). Lockfile: `package-lock.json`
- **Build:** esbuild via `node esbuild.config.mjs` (not invoked directly)
- **Language:** TypeScript 5.7+ with `strictNullChecks`, `noImplicitAny`
- **No test runner yet** (vitest planned, see beads epic `prompt-workbench-vnvr`)

### Key Dependencies

| Dependency | Purpose | Bundle rule |
|------------|---------|-------------|
| `obsidian` | Plugin API, workspace, vault, modals | **External** (provided by Obsidian) |
| `@codemirror/state` | CM6 state management | **External** (provided by Obsidian) |
| `@codemirror/view` | CM6 editor views, decorations | **External** (provided by Obsidian) |
| `@codemirror/merge` | Side-by-side diff view | **Bundled** (Obsidian does NOT ship it) |
| `esbuild` | Build toolchain | Dev only |

### Build Commands

```bash
npm run build         # Production build (esbuild -> main.js, minified)
npm run dev           # Watch mode (rebuilds on change, inline sourcemap)
```

---

## Architecture

Obsidian plugin for prompt template editing with Raycast snippet sync. Features: placeholder highlighting, LLM-powered improvement, interactive playground, graph integration, and Raycast export.

### Repo Layout

```
obsidian-prompt-workbench/
├── src/
│   ├── main.ts                     # Plugin entry (registers commands, extensions, views)
│   ├── settings.ts                 # Settings tab + DEFAULT_SETTINGS
│   ├── placeholders/
│   │   ├── parser.ts               # Pure: placeholder regex, parsing, preview values
│   │   ├── cm-extension.ts         # CM6 ViewPlugins: highlighting, previews, errors, tooltips
│   │   ├── reading-view.ts         # MarkdownPostProcessor for Reading view
│   │   └── graph-links.ts          # Injects {snippet} refs into Obsidian graph/backlinks
│   ├── llm/
│   │   ├── index.ts                # LLMAdapter interface + factory
│   │   ├── ollama.ts               # Ollama streaming adapter
│   │   ├── openai.ts               # OpenAI-compatible SSE adapter
│   │   └── anthropic.ts            # Anthropic SSE adapter
│   ├── improve/
│   │   ├── strategies.ts           # 4 preset improvement strategies
│   │   └── modal.ts                # Strategy picker + streaming diff modal
│   ├── playground/
│   │   └── view.ts                 # Sidebar: per-placeholder inputs, live preview
│   ├── raycast/
│   │   └── export.ts               # Vault -> Raycast snippets JSON with merge
│   └── reorg/
│       └── modal.ts                # LLM-assisted vault folder reorganization
├── styles.css                       # Theme-aware CSS (Obsidian variables)
├── esbuild.config.mjs               # Build config
├── manifest.json                    # Obsidian plugin metadata
├── data.json                        # Persisted settings (gitignored)
├── templates/                       # Dataview + Canvas templates for users
├── context/shaping/                 # Design docs and PRDs
├── .beads/                          # Issue tracking (beads_rust)
└── main.js                          # Bundled output (gitignored)
```

### Critical Build Rules

1. **`main.js` must be a single bundled file.** Obsidian loads plugins from one JS file.
2. **CM6 packages are external** (`@codemirror/state`, `@codemirror/view`); Obsidian provides them at runtime
3. **`@codemirror/merge` is NOT external.** Must be bundled; Obsidian doesn't ship it
4. **Access CM6 EditorView** via `leaf.view?.editor?.cm` with `@ts-expect-error`
5. **Use Obsidian CSS variables** (`var(--text-normal)`, `var(--background-primary)`) for theme compat

### Vault Location

The Obsidian vault is at `~/obsidian/prompts/`. The plugin is symlinked into `.obsidian/plugins/prompt-workbench`.

---

## Code Discipline

### Editing Rules

- Read sufficient context before editing. Understand the code first.
- Keep changes minimal: fix what's asked, don't refactor surroundings.
- No docstrings, comments, or type annotations on unchanged code.

### Backwards Compatibility

Early stage (v0.1.0). No backwards compatibility needed. Do things the right way with no tech debt.

### Styling

- Use Obsidian CSS variables for all colors, fonts, borders. Never hardcode values.
- Theme must work in both light and dark mode (`.theme-dark` overrides in styles.css)
- Files prefixed with `_` are excluded from Raycast export (convention, not config)

---

## Quality Gates

**Run after any code changes, before committing:**

```bash
npm run build                                    # Must succeed (single bundled main.js)
ubs $(git diff --name-only HEAD -- 'src/*.ts')   # Bug scanner on changed files
```

No linter or test runner configured yet. When vitest is added (bead T1), the gate becomes:

```bash
npm run build && npm test && ubs $(git diff --name-only HEAD -- 'src/*.ts')
```

---

## Issue Tracking

Uses `br` (beads_rust) for AI-native issue tracking. Issues stored in `.beads/`, tracked in git.

```bash
# Work selection
bv --robot-triage                     # Ranked recommendations (PageRank + betweenness)
bv --robot-next                       # Single top pick + claim command
br ready                              # Simple: unblocked issues

# Issue management
br show <id>                          # Full details + deps
br update <id> --status in_progress   # Claim work
br close <id>                         # Complete work

# After changes
br sync --flush-only                  # Export DB to JSONL
git add .beads/ && git commit -m "sync beads"  # Must commit manually
```

Priority: P0=critical, P1=high, P2=medium, P3=low, P4=backlog.
Types: task, bug, feature, epic, chore, docs, question.

---

## Git Workflow

- **Default branch:** `main`
- **Remote:** `git@github.com:thunter009/obsidian-prompt-workbench.git`
- **Commit style:** Conventional commits (`feat:`, `fix:`, `chore:`) with optional scope and bead ID
- **Merge strategy:** Rebase (`git merge --ff-only` or `git rebase`, never `git merge`)
- **Atomic commits:** Each commit is a single logical change. Don't bundle unrelated work.

---

## Landing the Plane

When ending a work session, agents must complete every step:

1. **Run quality gates.** `npm run build` must succeed. `ubs` on changed files.
2. **Close finished beads:** `br close <id>` for completed work.
3. **Create issues** for discovered work: `br create --title="..."`.
4. **Sync beads:** `br sync --flush-only && git add .beads/ && git commit -m "sync beads"`.
5. **Commit code changes** with conventional commit messages.
6. **Push only when explicitly required** (PR, branch handoff, release). Otherwise leave unpushed with handoff notes.
7. **Verify:** `git status` shows clean working tree.

Work is NOT done until beads are synced and code is committed. Unpushed is OK if handoff notes explain what to do next.

<!-- bv-agent-instructions-v2 -->

---

## Beads Workflow Integration

This project uses [beads_rust](https://github.com/Dicklesworthstone/beads_rust) (`br`) for issue tracking and [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) (`bv`) for graph-aware triage. Issues are stored in `.beads/` and tracked in git.

### Using bv as an AI sidecar

bv is a graph-aware triage engine for Beads projects (.beads/beads.jsonl). Instead of parsing JSONL or hallucinating graph traversal, use robot flags for deterministic, dependency-aware outputs with precomputed metrics (PageRank, betweenness, critical path, cycles, HITS, eigenvector, k-core).

**Scope boundary:** bv handles *what to work on* (triage, priority, planning). `br` handles creating, modifying, and closing beads.

**CRITICAL: Use ONLY --robot-* flags. Bare bv launches an interactive TUI that blocks your session.**

#### The Workflow: Start With Triage

**`bv --robot-triage` is your single entry point.** It returns everything you need in one call:
- `quick_ref`: at-a-glance counts + top 3 picks
- `recommendations`: ranked actionable items with scores, reasons, unblock info
- `quick_wins`: low-effort high-impact items
- `blockers_to_clear`: items that unblock the most downstream work
- `project_health`: status/type/priority distributions, graph metrics
- `commands`: copy-paste shell commands for next steps

```bash
bv --robot-triage        # THE MEGA-COMMAND: start here
bv --robot-next          # Minimal: just the single top pick + claim command

# Token-optimized output (TOON) for lower LLM context usage:
bv --robot-triage --format toon
```

#### Other bv Commands

| Command | Returns |
|---------|---------|
| `--robot-plan` | Parallel execution tracks with unblocks lists |
| `--robot-priority` | Priority misalignment detection with confidence |
| `--robot-insights` | Full metrics: PageRank, betweenness, HITS, eigenvector, critical path, cycles, k-core |
| `--robot-alerts` | Stale issues, blocking cascades, priority mismatches |
| `--robot-suggest` | Hygiene: duplicates, missing deps, label suggestions, cycle breaks |
| `--robot-diff --diff-since <ref>` | Changes since ref: new/closed/modified issues |
| `--robot-graph [--graph-format=json\|dot\|mermaid]` | Dependency graph export |

#### Scoping & Filtering

```bash
bv --robot-plan --label backend              # Scope to label's subgraph
bv --robot-insights --as-of HEAD~30          # Historical point-in-time
bv --recipe actionable --robot-plan          # Pre-filter: ready to work (no blockers)
bv --recipe high-impact --robot-triage       # Pre-filter: top PageRank scores
```

### br Commands for Issue Management

```bash
br ready              # Show issues ready to work (no blockers)
br list --status=open # All open issues
br show <id>          # Full issue details with dependencies
br create --title="..." --type=task --priority=2
br update <id> --status=in_progress
br close <id> --reason="Completed"
br close <id1> <id2>  # Close multiple issues at once
br sync --flush-only  # Export DB to JSONL
```

### Workflow Pattern

1. **Triage**: Run `bv --robot-triage` to find the highest-impact actionable work
2. **Claim**: Use `br update <id> --status=in_progress`
3. **Work**: Implement the task
4. **Complete**: Use `br close <id>`
5. **Sync**: Always run `br sync --flush-only` at session end

### Key Concepts

- **Dependencies**: Issues can block other issues. `br ready` shows only unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers 0-4, not words)
- **Types**: task, bug, feature, epic, chore, docs, question
- **Blocking**: `br dep add <issue> <depends-on>` to add dependencies

### Session Protocol

```bash
git status              # Check what changed
git add <files>         # Stage code changes
br sync --flush-only    # Export beads changes to JSONL
git commit -m "..."     # Commit everything
git push                # Push to remote
```

<!-- end-bv-agent-instructions -->
