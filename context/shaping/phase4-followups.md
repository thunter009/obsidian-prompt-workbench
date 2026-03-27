---
shaping: true
---

# Obsidian Plugin Phase 4 — Follow-up Work

## Source

> Follow-ups from Phase 3 completion. Mix of QA verification (ralph's shipped code), content migration, new feature, and release prep.

---

## V1: Verify graph-links integration

### Problem

Ralph shipped `src/placeholders/graph-links.ts` which injects snippet references into `metadataCache.resolvedLinks` so `{snippet name="X"}` shows as graph edges. Nobody has visually verified this works in Obsidian's graph view or backlinks panel.

### Outcome

Confirmed that graph view shows edges between prompts that reference each other via `{snippet}`, and backlinks panel shows "used by" relationships.

### Scope

Manual QA only — no code changes expected unless bugs found.

### Acceptance Criteria

- [ ] Open Obsidian graph view with prompts vault
- [ ] Find a prompt that uses `{snippet name="X"}` (e.g. references to "fenced markdown")
- [ ] Confirm an edge exists between the referencing file and the referenced file
- [ ] Open the referenced file → confirm backlinks panel lists the referencing files
- [ ] If edges don't appear: check console for errors, file a bug with details

### Exit Conditions

- Graph edges verified working OR bug filed with repro steps
- Screenshot of graph view showing snippet edges (paste in bead comment or session journal)

---

## V2: Verify Dataview query templates

### Problem

Ralph shipped `templates/dataview-queries.md` with 5 DQL queries (by tag, by keyword prefix, recently modified, snippet dependencies, missing keywords). Requires Dataview community plugin installed in the vault. Not yet tested.

### Outcome

Dataview plugin installed, queries verified rendering live tables from vault frontmatter.

### Scope

Manual setup + QA. No plugin code changes.

### Acceptance Criteria

- [ ] Install Dataview community plugin in `~/obsidian/prompts/` vault
- [ ] Copy `templates/dataview-queries.md` to `~/obsidian/prompts/_config/dataview-queries.md`
- [ ] Open the file in Obsidian reading view
- [ ] "Prompts by tag" query renders a table (change tag to one that exists in vault)
- [ ] "Recently modified" query renders the 25 most recent files
- [ ] "Missing keywords" query shows prompts without a `keyword` frontmatter field
- [ ] If queries error: check Dataview version compatibility, fix DQL syntax, commit fix

### Exit Conditions

- All 5 queries render tables with real data OR bugs filed per query
- Note which queries need frontmatter fields that most prompts don't have yet (e.g. `tags`)

---

## V3: Batch bracket→argument conversion

### Problem

~122 prompt files in `~/obsidian/prompts/`. Many older prompts use `[placeholder name]` bracket syntax instead of the Raycast-compatible `{argument name="placeholder name"}` syntax. The CM6 extension only highlights `{...}` placeholders, so bracket prompts get no highlighting, no graph integration, and export to Raycast without working placeholders.

### Outcome

All bracket-style placeholders in the vault converted to `{argument name="..."}` syntax where appropriate. Prompts that use brackets as literal content (markdown links, lists) are left alone.

### Scope

Content migration in the vault. No plugin code changes.

### Requirements

| ID | Requirement |
|----|-------------|
| R0 | Only convert brackets that are clearly placeholders, not markdown links `[text](url)` or list references |
| R1 | `[Some Input]` → `{argument name="Some Input"}` |
| R2 | Preserve original file if ambiguous — flag for manual review |
| R3 | No frontmatter changes |
| R4 | Backup vault before batch operation |

### Known patterns from vault scan

| Pattern | Example file | Convert? |
|---------|-------------|----------|
| `[Generate a unique identifier]` | Create .ics Calendar Invite.md | Yes → `{argument name="Generate a unique identifier"}` |
| `[Data Source Name]` | airflow DAG documentation template.md | Yes |
| `[Data Integrity Team]` | Application Bug.md | Context-dependent — appears in example text, not as placeholder |
| `[Pipeline Name]` | airflow DAG documentation template.md | Yes |

### Acceptance Criteria

- [ ] Script or manual pass identifies all `[Bracket]` patterns in vault
- [ ] Each converted to `{argument name="..."}` or flagged as non-placeholder
- [ ] Spot-check 5 converted files — placeholders highlight in CM6 editor
- [ ] Raycast export produces working `{argument}` placeholders in exported JSON

### Exit Conditions

- All convertible brackets migrated, ambiguous ones flagged in a list
- At least one converted prompt verified highlighting + Raycast export

---

## V4: Snippet resolution at copy/export

### Problem

`{snippet name="X"}` references appear in prompt text but are never resolved — they export as literal `{snippet name="X"}` strings. When copying a prompt or exporting to Raycast, the user expects snippet content to be inlined.

### Outcome

Copy-to-clipboard and Raycast export resolve `{snippet name="X"}` by reading the referenced file from the vault and substituting its body text inline.

### Current State

- `parser.ts` already parses `{snippet name="X"}` and exposes `snippetRef` on `ParsedPlaceholder`
- `graph-links.ts` already resolves snippet refs to `TFile` via `resolveSnippetFile(app, snippetRef)`
- `export.ts` reads vault files and writes Raycast JSON — currently exports `{snippet}` as literal text
- No copy-to-clipboard command exists yet

### Requirements

| ID | Requirement |
|----|-------------|
| R0 | Resolve `{snippet name="X"}` → file body text (strip frontmatter) at export/copy time |
| R1 | Recursive resolution: if snippet A includes `{snippet name="B"}`, resolve B too |
| R2 | Cycle detection: A→B→A should error gracefully, not infinite loop |
| R3 | Missing snippet: leave placeholder as-is, show Notice with missing name |
| R4 | Other placeholder types (`{argument}`, `{clipboard}`, etc.) pass through unchanged |
| R5 | Resolution happens in `export.ts` before writing JSON |
| R6 | Add "Copy resolved prompt" command — resolves snippets, copies to clipboard |

### Parts

| Part | Mechanism |
|------|-----------|
| **A1** | `resolveSnippets(app, text)` function — finds all `{snippet}` placeholders, reads referenced files, substitutes body text. Handles recursion + cycle detection. |
| **A2** | Integrate A1 into `export.ts` `readVaultSnippets()` — resolve snippet refs in body before export |
| **A3** | "Copy resolved prompt" command — reads active file, resolves snippets, writes to clipboard via `navigator.clipboard.writeText()` |

### Fit Check: R × A

| Req | Requirement | A1 | A2 | A3 |
|-----|-------------|----|----|-----|
| R0 | Resolve snippet → body text | ✅ core | — | — |
| R1 | Recursive resolution | ✅ recursion in resolver | — | — |
| R2 | Cycle detection | ✅ visited set | — | — |
| R3 | Missing snippet → Notice | ✅ returns unresolved + list | ✅ shows Notice | ✅ shows Notice |
| R4 | Other placeholders pass through | ✅ only matches snippet type | — | — |
| R5 | Resolution in export | — | ✅ calls A1 | — |
| R6 | Copy resolved command | — | — | ✅ calls A1 |

No gaps — all requirements covered.

### Acceptance Criteria

- [ ] Prompt with `{snippet name="X"}` exports to Raycast with X's content inlined
- [ ] Recursive snippet (A refs B refs C) resolves fully
- [ ] Circular reference (A refs B refs A) shows error Notice, doesn't hang
- [ ] Missing snippet shows Notice, placeholder left as literal
- [ ] "Copy resolved prompt" command copies fully resolved text
- [ ] Other placeholders (`{argument}`, `{clipboard}`) unchanged in output

### Exit Conditions

- Export + copy both resolve snippets correctly
- Edge cases (recursion, cycles, missing) handled gracefully

---

## V5: Mobile testing

### Problem

Plugin has only been tested on desktop Obsidian (macOS). Obsidian runs on iOS and Android with the same plugin API, but CM6 extensions, touch interactions, and Node.js APIs (`require('fs')`, `require('path')`) may not work on mobile.

### Outcome

Plugin verified working on at least one mobile platform, or bugs filed for mobile-specific issues.

### Known Risks

| Risk | Affected Code | Severity |
|------|--------------|----------|
| `require('fs')` / `require('path')` | `export.ts` (Raycast export) | High — Node.js APIs unavailable on mobile |
| CM6 touch interactions | `cm-extension.ts` | Medium — decorations may not render or tap targets may be wrong |
| `navigator.clipboard` | Future copy command | Medium — may need Obsidian API fallback |
| File system paths | `export.ts` (resolved export path) | High — `~/` expansion via `require('os')` won't work |

### Acceptance Criteria

- [ ] Install plugin on iOS or Android Obsidian
- [ ] Open a prompt with `{argument}` and `{snippet}` placeholders
- [ ] Confirm placeholders highlight in editor (CM6 extension loads)
- [ ] Open reading view — confirm placeholders render
- [ ] Try "Improve prompt" command — modal opens, LLM streaming works
- [ ] Try Raycast export — expect failure, document error
- [ ] Check Obsidian console for errors on plugin load

### Exit Conditions

- Core features (highlighting, reading view) verified on mobile
- Known failures documented as bugs with platform + Obsidian version
- Raycast export failure expected and acceptable (desktop-only feature)

---

## V6: Community plugin release

### Problem

Plugin is currently local-only, symlinked into the vault. To distribute to other users, it needs to be published to the Obsidian community plugins directory.

### Outcome

Plugin listed in the Obsidian community plugins directory, installable by anyone.

### Requirements

| ID | Requirement |
|----|-------------|
| R0 | `manifest.json` has correct `id`, `name`, `version`, `minAppVersion`, `author`, `description` |
| R1 | `versions.json` maps plugin version → minimum Obsidian version |
| R2 | GitHub repo is public with tagged release (e.g. `1.0.0`) |
| R3 | Release includes `main.js`, `manifest.json`, `styles.css` as assets |
| R4 | README.md with installation instructions, feature list, screenshots |
| R5 | Submit PR to `obsidianmd/obsidian-releases` repo adding plugin to `community-plugins.json` |
| R6 | Pass Obsidian plugin review (no banned APIs, no remote code loading, etc.) |

### Pre-release Checklist

- [ ] Remove any `console.log` debug statements
- [ ] Verify no hardcoded paths (vault path, Raycast export path)
- [ ] Verify settings UI covers all configurable values
- [ ] Verify plugin loads cleanly with empty vault (no prompts)
- [ ] Test on minimum supported Obsidian version
- [ ] License file in repo

### Dependencies

- V5 (mobile testing) should complete first — community plugins should work on mobile
- V1, V2 verified — don't ship broken features

### Exit Conditions

- PR merged to `obsidian-releases`, plugin searchable in Obsidian community plugins browser
