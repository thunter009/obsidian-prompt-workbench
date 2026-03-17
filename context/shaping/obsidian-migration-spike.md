---
shaping: true
type: spike
---

# Obsidian Migration — Architecture Spike

## Thesis

Replace the Next.js web app with a single Obsidian plugin. Prompts become markdown files in a vault. Organization becomes folders. The plugin provides the two capabilities Obsidian lacks: **Raycast placeholder system** and **AI improve-prompt flow**.

---

## What Dies (good riddance)

| Current layer | Lines of code (est) | Why it dies |
|---|---|---|
| Next.js App Router, API routes | ~2000 | Obsidian IS the app |
| SQLite + Drizzle schema + migrations | ~800 | Vault = filesystem |
| Zustand stores (snippet, folder, settings) | ~1500 | Obsidian workspace state + plugin `data.json` |
| Sidebar components (tree, search, filter) | ~1200 | Obsidian's native sidebar |
| React wrapper components (panels, modals) | ~1000 | Obsidian Modal/ItemView classes |
| Sync engine + Raycast export | ~600 | Plugin command: read vault → write Raycast JSON |
| Version history store | ~400 | Git plugin or Obsidian File Recovery |
| JD Spine (not yet built) | 0 | Just name your folders `10-19 Writing/11 Email/` |

**Total eliminated: ~7500 lines.** What remains is the ~1500 lines of actual logic.

---

## What Transfers (nearly verbatim)

### 1. LLM Adapter Layer → `src/llm/`

`src/lib/llm/index.ts` + adapters (ollama.ts, openai.ts, anthropic.ts) are pure TypeScript with zero React/Next.js dependencies. The interface:

```ts
interface LLMAdapter {
  generate(input: LLMGenerateInput): AsyncIterable<string>
}
```

**Transfer:** Copy as-is. The only change is how config is loaded (from `plugin.loadData()` instead of Zustand/SQLite).

### 2. Placeholder Parser → `src/placeholders/`

`src/lib/raycast/placeholder-parser.ts` is ~320 lines of pure functions: `parsePlaceholder()`, `findPlaceholders()`, `getPlaceholderPreviewValue()`. Zero framework deps.

**Transfer:** Copy as-is.

### 3. CM6 Editor Extensions → `src/editor/`

`src/components/editor/raycast-placeholder-language.ts` is already pure CM6 code:
- `raycastPlaceholderPlugin` — ViewPlugin with MatchDecorator for type-colored highlights
- `previewWidgetPlugin` — StateField + ViewPlugin for inline ghost-text previews
- `errorDecorationPlugin` — ViewPlugin for invalid/unclosed placeholder warnings
- `snippetHoverTooltip` — hoverTooltip for `{snippet name="..."}` references
- `raycastPlaceholderTheme` — EditorView.baseTheme with all CSS

**Transfer:** Register via `this.registerEditorExtension(raycastPlaceholderExtension)` in `onload()`. The only change: replace `useSnippetStore.getState()` in snippet hover/click with vault file lookups.

### 4. Diff computation → `src/diff/`

`src/lib/diff.ts` (line diff algorithm) is pure. The CM6 MergeView wrapper (`DiffMergeView.tsx`) has React around it but the core is `@codemirror/merge` which works in raw DOM.

**Transfer:** Diff logic copies. MergeView gets mounted into Modal's `contentEl` instead of React.

---

## Plugin Architecture

### File structure

```
obsidian-prompt-workbench/
├── manifest.json
├── main.ts                    # Plugin class: onload/onunload
├── styles.css                 # Placeholder colors, diff theme
├── src/
│   ├── llm/                   # Copied from current project
│   │   ├── index.ts
│   │   ├── ollama.ts
│   │   ├── openai.ts
│   │   └── anthropic.ts
│   ├── placeholders/
│   │   ├── parser.ts          # Copied from placeholder-parser.ts
│   │   └── cm-extension.ts    # Adapted from raycast-placeholder-language.ts
│   ├── improve/
│   │   ├── modal.ts           # ImprovePromptModal (streaming → diff → accept)
│   │   ├── strategy.ts        # Strategy presets + custom instruction
│   │   └── version-stack.ts   # In-memory version array for iterate loop
│   ├── raycast/
│   │   └── export.ts          # Vault → Raycast JSON export command
│   ├── settings.ts            # PluginSettingTab (provider config, meta prompt)
│   └── types.ts
```

### Registration surface (`main.ts`)

```ts
export default class PromptWorkbenchPlugin extends Plugin {
  settings: PluginSettings

  async onload() {
    await this.loadSettings()

    // CM6 placeholder highlighting + preview + errors
    this.registerEditorExtension(placeholderExtension(this))

    // Commands
    this.addCommand({
      id: 'improve-prompt',
      name: 'Improve prompt',
      editorCallback: (editor, view) => {
        new ImprovePromptModal(this.app, this, editor).open()
      }
    })

    this.addCommand({
      id: 'improve-prompt-strategy',
      name: 'Improve prompt (pick strategy)',
      editorCallback: (editor, view) => {
        new StrategyPickerModal(this.app, this, editor).open()
      }
    })

    this.addCommand({
      id: 'export-raycast',
      name: 'Export vault to Raycast snippets',
      callback: () => exportToRaycast(this)
    })

    this.addCommand({
      id: 'fill-placeholders',
      name: 'Fill placeholders in current note',
      editorCallback: (editor) => fillPlaceholders(this, editor)
    })

    // Settings tab
    this.addSettingTab(new PromptWorkbenchSettingTab(this.app, this))
  }
}
```

---

## Feature Mapping: Current → Obsidian

### Placeholder System

| Current | Obsidian plugin |
|---|---|
| CM6 ViewPlugin highlights `{clipboard}`, `{argument}` etc | Same extension, registered via `registerEditorExtension()` |
| Inline preview widgets (ghost text) | Same ViewPlugin, same WidgetType `toDOM()` |
| Error squiggles for invalid/unclosed | Same ViewPlugin |
| Snippet hover tooltip with `⌘+Click` to jump | Adapted: `vault.getMarkdownFiles()` instead of Zustand store |
| Placeholder autocomplete | Same CM6 autocompletion source |

**Adaptation cost: ~2 hours.** Replace store references with vault API calls.

### AI Improve Prompt

| Current | Obsidian plugin |
|---|---|
| Sparkle button → triggers improve | Command palette: `Improve prompt` (or ribbon icon) |
| Strategy picker popover | `FuzzySuggestModal` with strategy list |
| Streaming view (`<pre>` + spinner) | Modal with `contentEl` showing streaming text |
| Deferred diff (MergeView on completion) | Same Modal, swap content to CM6 MergeView |
| Accept/Reject buttons | Modal buttons, `editor.replaceRange()` on accept |
| Version stack + "Improve again" | In-memory array, navigate within modal |
| Placeholder preservation check | Same regex comparison, warning banner in modal |

**This is the big build.** The `ImprovePromptModal` needs to manage 3 states:

```
[Strategy Pick] → [Streaming] → [Diff Review + Iterate]
```

The modal lifecycle:

```ts
class ImprovePromptModal extends Modal {
  private state: 'streaming' | 'review' = 'streaming'
  private versionStack: { text: string, instruction?: string }[] = []
  private abortController: AbortController

  async onOpen() {
    this.renderStreaming()
    await this.runImprove()
  }

  private renderStreaming() {
    // Plain text area + cancel button
    // Tokens append to textContent as they arrive
  }

  private renderDiffReview(original: string, improved: string) {
    // Clear contentEl
    // Mount @codemirror/merge MergeView into contentEl
    // Add Accept / Reject / Improve Again buttons
    // Add version nav if stack.length > 1
  }

  private async runImprove(instruction?: string) {
    const adapter = createLLMAdapter(this.plugin.settings)
    const stream = adapter.generate({ ... })
    for await (const chunk of stream) {
      // append to streaming view
    }
    // flip to diff review
    this.renderDiffReview(original, accumulated)
  }
}
```

**Estimated effort: 2-3 days** for the full flow with streaming, diff, and iteration.

### Raycast Sync

| Current | Obsidian plugin |
|---|---|
| Chokidar watcher + interval + conflict UI | Single command: `Export vault to Raycast snippets` |
| SQLite → Raycast JSON | `vault.getMarkdownFiles()` → filter by tag/folder → write JSON |
| Bi-directional sync with conflict resolution | One-way export (vault is source of truth) |

**Massive simplification.** The current sync engine is ~600 lines for conflict detection/resolution. In Obsidian, the vault IS the source of truth and Raycast gets a one-way export.

```ts
async function exportToRaycast(plugin: PromptWorkbenchPlugin) {
  const files = plugin.app.vault.getMarkdownFiles()
  const snippets = await Promise.all(
    files.filter(f => /* tag or folder filter */)
         .map(async f => ({
           name: f.basename,
           text: await plugin.app.vault.cachedRead(f),
           // parse frontmatter for keyword, etc
         }))
  )
  // Write to Raycast snippets directory
}
```

### JD Spine / Organization

**This feature disappears as a code concern.** Users just create folders:

```
Prompts/
├── 00 Inbox/
├── 10-19 Writing/
│   ├── 11 Email/
│   │   ├── cold-outreach.md
│   │   └── follow-up.md
│   └── 12 Content/
├── 20-29 Code/
│   ├── 21 Review/
│   └── 22 Generation/
└── 30-39 Analysis/
```

The "LLM-assisted wizard" becomes a command that reads all files, calls the LLM to propose a JD structure, then creates the folders and moves files. No database tables, no migration flow, no tree rendering.

### Playground / Test Values

| Current | Obsidian plugin |
|---|---|
| PlaygroundPanel with variable inputs + rendered output | ItemView in right sidebar |
| Test value sets stored in Zustand/SQLite | Frontmatter `test-values:` in each note, or a `_test-values.md` file |

This becomes a custom `ItemView` panel. When active note has placeholders, the panel shows input fields. Fill them → see rendered output.

Can use React inside the ItemView (mount via `createRoot(this.contentEl)`) if the raw DOM approach gets unwieldy.

---

## What Obsidian Adds (new capabilities for free)

| Capability | Value |
|---|---|
| **Graph view** | Visualize `{snippet name="..."}` references as a link graph |
| **Backlinks** | "Which prompts include this snippet?" for free |
| **Dataview** | Query prompts by frontmatter metadata (tags, model, strategy) |
| **Templater** | Complements placeholders — date/time variables, user scripts |
| **Git plugin** | Full version history with diff, no custom version store needed |
| **Mobile** | Edit prompts on phone/tablet (plugin works on mobile if no Node deps) |
| **Community** | Other people can use and contribute to the plugin |
| **Publish** | Optional: share prompt library as a website |
| **Canvas** | Visual prompt chain design (connect prompts as nodes) |

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| MergeView in Modal is janky | Medium | Test early. Fallback: dedicated ItemView tab instead of Modal |
| Plugin API changes break things | Low | Obsidian plugin API is stable; breaking changes are rare |
| No React in CM6 extensions | Low | Already pure CM6 — no React dependency |
| Mobile compatibility (no Node `fetch` quirks) | Low | Use Obsidian's `requestUrl()` instead of `fetch` for LLM calls |
| Raycast placeholder syntax `{type}` conflicts with other plugins | Medium | Only activate extension on files with frontmatter tag `prompt: true` |
| Plugin review/approval for community directory | Low | Optional; can distribute via GitHub/BRAT |

---

## Migration Path

### Phase 0: Validate (1 day)
- Scaffold Obsidian plugin with sample plugin template
- Register the existing CM6 placeholder extension → confirm highlighting works in Obsidian's editor
- If this works, everything else follows

### Phase 1: Core plugin (3-4 days)
- Placeholder highlighting + preview + errors (port CM6 extensions)
- LLM adapter layer (copy + adapt settings loading)
- ImprovePromptModal with streaming → diff → accept/reject
- Settings tab (provider config, meta system prompt)

### Phase 2: Full feature parity (2-3 days)
- Strategy picker modal
- Version stack + iterate loop
- Placeholder preservation warnings
- Fill-placeholders command (prompt for values, replace in note)
- Export to Raycast command

### Phase 3: Obsidian-native enhancements (ongoing)
- Playground sidebar panel (ItemView)
- `{snippet name="..."}` as Obsidian wiki-link (graph view integration)
- Dataview queries for prompt metadata
- Canvas integration for prompt chains
- Batch reorg command (LLM suggests folder moves)

### Data migration
- Export all snippets from SQLite → individual `.md` files with frontmatter
- Map existing folders → filesystem directories
- One-time script, ~50 lines

---

## Decision

The question isn't whether this is *possible* — it clearly is, and every feature maps cleanly. The question is whether the value of Obsidian's ecosystem (graph, backlinks, mobile, community, canvas, git) outweighs the cost of rebuilding the UI layer (~1 week of focused work).

Given that:
1. JD Spine (next big feature) becomes free
2. ~70% of current code is infrastructure Obsidian eliminates
3. The core logic (LLM adapters, CM6 extensions, placeholder parser) transfers verbatim
4. You get mobile, graph view, community, and canvas as bonuses

**Recommendation: Do it.** Start with Phase 0 (validate CM6 extension works in Obsidian). If that takes <1 hour, commit to Phase 1.
