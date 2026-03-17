---
shaping: true
---

# Obsidian Plugin Phase 3 — Shaping

## Source

> Phase 3 of Obsidian migration. Plugin has placeholder highlighting, Raycast export, improve-prompt modal, playground sidebar. Need Obsidian-native enhancements: snippet graph integration, Dataview queries, Canvas integration, batch reorg.

---

## Problem

The plugin works as a prompt editor but doesn't leverage Obsidian's unique capabilities — graph view, backlinks, Dataview, Canvas. `{snippet name="X"}` references exist (13 refs to "fenced markdown" alone) but are invisible to Obsidian's link engine. No way to query prompts by metadata. No visual prompt chain design. No LLM-assisted organization (the old batch reorg was in the Next.js app).

## Outcome

Prompts are first-class Obsidian citizens — visible in graph view, queryable via Dataview, chainable in Canvas, and organizable via LLM-assisted commands.

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | `{snippet name="X"}` references visible in graph view as edges | Core goal |
| R1 | Backlinks panel shows "which prompts include this snippet?" | Core goal |
| R2 | Query prompts by frontmatter metadata (tags, keyword, folder) without code | Must-have |
| R3 | Visual prompt chain design — connect prompts as nodes, see data flow | Nice-to-have |
| R4 | LLM-assisted folder reorganization via command palette | Must-have |
| R5 | Batch reorg suggests based on content similarity, not just names | Must-have |
| R6 | Graph/backlinks work without modifying prompt text | Must-have |
| R7 | Dataview queries work with existing frontmatter — no schema migration | Must-have |

---

## CURRENT

| Part | Mechanism |
|------|-----------|
| **C1** | `{snippet name="X"}` rendered as colored text in editor (CM6 extension) |
| **C2** | Hover tooltip shows snippet content (needs vault API fix for Obsidian) |
| **C3** | No graph view integration — Obsidian doesn't see `{snippet}` as a link |
| **C4** | No Dataview integration — frontmatter exists but no query templates |
| **C5** | No Canvas integration |
| **C6** | No batch reorg — old FolderReorgModal was in the Next.js app |

---

## A: Obsidian-Native Phase 3 (selected)

| Part | Mechanism |
|------|-----------|
| **A1** | **Snippet→link resolver** — `resolveLinks` hook or `registerMarkdownPostProcessor` injects hidden `[[X]]` link into DOM for each `{snippet name="X"}`, feeding Obsidian's graph + backlink engine. Prompt text unchanged. |
| **A2** | **Dataview query templates** — `_config/dataview-queries.md` with ready-to-use DQL blocks: prompts by tag, by keyword prefix, recently modified, snippet dependency tree. Requires Dataview plugin. |
| **A3** | **Canvas prompt chain template** — `_templates/prompt-chain.canvas` with example nodes + edges showing how to chain prompts. Each node links to a prompt file. No plugin code — just a `.canvas` file. |
| **A4** | **Batch reorg command** — plugin command reads vault files, sends names + truncated content to LLM, gets proposed folder structure, shows confirmation modal. |
| **A5** | **Reorg confirmation modal** — lists proposed moves grouped by target folder, checkbox per move, Apply moves files via `vault.rename()`. |

---

## Fit Check: R × A

| Req | Requirement | Status | A |
|-----|-------------|--------|---|
| R0 | `{snippet name="X"}` references visible in graph view as edges | Core goal | ✅ |
| R1 | Backlinks panel shows "which prompts include this snippet?" | Core goal | ✅ |
| R2 | Query prompts by frontmatter metadata without code | Must-have | ✅ |
| R3 | Visual prompt chain design — connect prompts as nodes | Nice-to-have | ✅ |
| R4 | LLM-assisted folder reorganization via command palette | Must-have | ✅ |
| R5 | Batch reorg suggests based on content, not just names | Must-have | ✅ |
| R6 | Graph/backlinks work without modifying prompt text | Must-have | ✅ |
| R7 | Dataview queries work with existing frontmatter | Must-have | ✅ |

---

## Slices

| # | Slice | Parts | Demo |
|---|-------|-------|------|
| V1 | Snippet graph integration | A1 | Graph view shows edges from prompts using `{snippet name="fenced markdown"}` to the fenced markdown note |
| V2 | Dataview query templates | A2 | Open `_config/dataview-queries.md` → live tables of prompts by tag, keyword, dependencies |
| V3 | Canvas prompt chain template | A3 | Open `prompt-chain.canvas` → example chain with linked prompt nodes |
| V4 | Batch reorg command | A4, A5 | `Cmd+P` → "Reorganize vault" → LLM proposes folders → review checkboxes → apply |
