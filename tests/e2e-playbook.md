# Obsidian Prompt Workbench Manual E2E Playbook

This playbook covers end-to-end checks that require a real Obsidian runtime.

## Preconditions

- Vault path: `~/obsidian/prompts/`
- Plugin enabled: `prompt-workbench`
- Open Developer Console before running checks.
- For Dataview-related checks, install and enable Dataview.

---

## 1) Plugin lifecycle

- [ ] Enable plugin in Community Plugins.
  - Expected: plugin enables without console errors.
- [ ] Disable plugin, then re-enable.
  - Expected: unload/reload is clean, no duplicate commands or view errors.
- [ ] Open settings tab for Prompt Workbench.
  - Expected: all expected settings fields render.
- [ ] Change 1-2 settings, restart Obsidian, reopen settings.
  - Expected: settings values persist after restart.

## 2) Placeholder highlighting (Live Preview)

- [ ] Open a markdown note in Live Preview containing placeholders.
  - Expected: placeholders are syntax-highlighted.
- [ ] Verify `{clipboard}` highlight.
  - Expected: purple style.
- [ ] Verify `{argument name="X"}` highlight.
  - Expected: orange style.
- [ ] Verify `{snippet name="Y"}` highlight.
  - Expected: teal style.
- [ ] Verify `{date}` highlight.
  - Expected: blue style.
- [ ] Verify `{cursor}` highlight.
  - Expected: red style.
- [ ] Add invalid `{foobar}` and unclosed `{clipboard`.
  - Expected: red squiggle/error styling appears for both.
- [ ] Hover valid placeholders.
  - Expected: tooltip shows placeholder type and modifiers.
- [ ] Cmd+Click / Ctrl+Click snippet placeholder.
  - Expected: referenced snippet file opens.

## 3) Placeholder highlighting (Reading view)

- [ ] Switch same note to Reading view.
  - Expected: placeholder colors match Live Preview categories.
- [ ] Click snippet placeholder with Cmd/Ctrl modifier.
  - Expected: referenced snippet opens.
- [ ] Inspect backlinks/graph metadata behavior.
  - Expected: hidden/internal links for snippet refs are injected.

## 4) Preview toggle

- [ ] Run command: `Toggle placeholder previews`.
  - Expected: ghost preview text appears after placeholders.
- [ ] Run command again.
  - Expected: ghost preview text disappears.

## 5) Graph integration

- [ ] Open Graph view for a note that uses `{snippet name="X"}`.
  - Expected: edge appears from referencing file to referenced snippet file.
- [ ] Open referenced snippet and backlinks panel.
  - Expected: referencing files appear in backlinks.
- [ ] Add a new snippet reference in another note.
  - Expected: graph edge appears without restarting Obsidian.
- [ ] Remove a snippet reference and refresh view.
  - Expected: edge/backlink disappears.

## 6) Playground sidebar

- [ ] Run command: `Open playground`.
  - Expected: sidebar opens with placeholder input controls.
- [ ] Verify one field per unique placeholder key.
  - Expected: deduplicated fields for repeated placeholders.
- [ ] Type input values.
  - Expected: preview updates live.
- [ ] Click `Copy` in playground.
  - Expected: clipboard contains resolved output text.
- [ ] Add `test-values` in frontmatter and reopen/switch note.
  - Expected: matching inputs pre-populate.
- [ ] Switch active markdown file.
  - Expected: playground refreshes to that file's placeholders.

## 7) Improve prompt flow

- [ ] Select prompt text and run `Improve prompt`.
  - Expected: strategy picker appears with 4 presets plus custom input.
- [ ] Choose a strategy and start improvement.
  - Expected: streaming modal opens and content streams progressively.
- [ ] Wait for completion.
  - Expected: diff view renders original vs improved output.
- [ ] Click `Improve again`.
  - Expected: iterative run works and version stack updates.
- [ ] Click `Accept`.
  - Expected: editor content is replaced with improved text.
- [ ] Re-run and click `Reject`/close.
  - Expected: no editor changes applied.
- [ ] Remove a placeholder in generated output.
  - Expected: placeholder preservation warning appears.

## 8) Raycast export

- [ ] Run `Export to Raycast` with export path configured.
  - Expected: valid snippets JSON written to configured path.
- [ ] Review notice text.
  - Expected: notice reports added/updated/preserved counts.
- [ ] Confirm backup file in export directory.
  - Expected: timestamped `raycast-snippets-backup-*.json` exists before overwrite.
- [ ] Include `_`-prefixed file and `raycast-export: false` file in vault.
  - Expected: both are excluded from export output.

## 9) Vault reorganization

- [ ] Run `Prompt Workbench: Reorganize vault`.
  - Expected: modal opens with loading state while LLM processes.
- [ ] Wait for move proposals.
  - Expected: grouped checkbox list by target folder appears.
- [ ] Use `Select All` / `Deselect All`.
  - Expected: all checkboxes toggle correctly.
- [ ] Apply selected moves.
  - Expected: files are moved to proposed folders.
- [ ] Check proposals for underscore folders.
  - Expected: `_`-prefixed folders are not proposed as targets.

---

## Logging template

Use this for each section run:

```text
Section: [name]
Date: YYYY-MM-DD
Obsidian version: X.Y.Z
Platform: macOS/iOS/Android/Windows/Linux
Result: PASS / FAIL / PARTIAL
Notes: [details of any failures]
Screenshot: [path or N/A]
```
