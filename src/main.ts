import { Plugin, Notice } from 'obsidian'
import { createPlaceholderExtension, togglePreviewEffect, previewEnabledField } from './placeholders/cm-extension'
import { createPlaceholderPostProcessor } from './placeholders/reading-view'
import { registerSnippetGraphLinks } from './placeholders/graph-links'
import { exportToRaycast, importFromRaycast } from './raycast/export'
import { resolveSnippets } from './workflow'
import { parseFrontmatter } from './frontmatter'
import { StrategyPickerModal } from './improve/modal'
import { PlaygroundView, PLAYGROUND_VIEW_TYPE } from './playground/view'
import { ReorgModal } from './reorg/modal'
import { DuplicateModal } from './duplicates/modal'
import { PromptWorkbenchSettingTab, DEFAULT_SETTINGS, type PromptWorkbenchSettings } from './settings'

export default class PromptWorkbenchPlugin extends Plugin {
  settings: PromptWorkbenchSettings = DEFAULT_SETTINGS
  private autoSyncTimer: ReturnType<typeof setTimeout> | null = null
  private raycastWatcher: ReturnType<typeof require> | null = null

  async onload() {
    await this.loadSettings()

    // CM6 placeholder highlighting (Live Preview / Source)
    this.registerEditorExtension(createPlaceholderExtension(this.app))

    // Reading view placeholder highlighting
    this.registerMarkdownPostProcessor(createPlaceholderPostProcessor(this.app))

    // Snippet graph/backlinks integration (metadataCache.resolvedLinks)
    registerSnippetGraphLinks(this)

    // Playground sidebar view
    this.registerView(PLAYGROUND_VIEW_TYPE, (leaf) => new PlaygroundView(leaf, this))

    // Commands
    this.addCommand({
      id: 'toggle-placeholder-previews',
      name: 'Toggle inline placeholder previews',
      callback: () => {
        this.settings.showInlinePreviews = !this.settings.showInlinePreviews
        this.saveSettings()
        this.updatePreviewState(this.settings.showInlinePreviews)
      },
    })

    this.addCommand({
      id: 'export-raycast',
      name: 'Export to Raycast snippets',
      callback: async () => {
        this._suppressImportUntil = Date.now() + 10000
        await exportToRaycast(this)
        this._suppressImportUntil = Date.now() + 2000 // brief grace after write completes
      },
    })

    this.addCommand({
      id: 'import-raycast',
      name: 'Import from Raycast snippets',
      callback: () => importFromRaycast(this),
    })

    this.addCommand({
      id: 'improve-prompt',
      name: 'Improve prompt',
      editorCallback: (editor) => {
        new StrategyPickerModal(this.app, this, editor).open()
      },
    })

    this.addCommand({
      id: 'open-playground',
      name: 'Open playground',
      callback: () => this.activatePlayground(),
    })

    this.addCommand({
      id: 'copy-resolved-prompt',
      name: 'Copy resolved prompt',
      callback: async () => {
        const file = this.app.workspace.getActiveFile()
        if (!file || file.extension !== 'md') {
          new Notice('No active markdown file')
          return
        }
        const content = await this.app.vault.cachedRead(file)
        const { body } = parseFrontmatter(content)
        const { resolved, errors } = await resolveSnippets(this.app, body)
        await navigator.clipboard.writeText(resolved)
        const msg = errors.length > 0
          ? `Copied (${errors.length} unresolved: ${errors.join(', ')})`
          : 'Resolved prompt copied'
        new Notice(msg)
      },
    })

    this.addCommand({
      id: 'detect-duplicates',
      name: 'Detect duplicate prompts',
      callback: () => new DuplicateModal(this.app, this).open(),
    })

    this.addCommand({
      id: 'reorganize-vault',
      name: 'Prompt Workbench: Reorganize vault',
      callback: () => {
        new ReorgModal(this.app, this).open()
      },
    })

    // Settings tab
    this.addSettingTab(new PromptWorkbenchSettingTab(this.app, this))

    // Auto-sync: debounced export on vault file changes
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (!this.settings.autoSyncRaycast) return
        if (file.path.startsWith('_')) return
        if (!file.path.endsWith('.md')) return

        // Debounce: wait 2s after last change before syncing
        if (this.autoSyncTimer) clearTimeout(this.autoSyncTimer)
        this.autoSyncTimer = setTimeout(async () => {
          this.autoSyncTimer = null
          this._suppressImportUntil = Date.now() + 10000
          await exportToRaycast(this, { silent: true })
          this._suppressImportUntil = Date.now() + 2000
        }, 2000)
      })
    )

    // Apply initial preview state + start Raycast file watcher
    this.app.workspace.onLayoutReady(() => {
      this.updatePreviewState(this.settings.showInlinePreviews)
      this.startRaycastWatcher()
    })
  }

  // Suppresses import watcher when we just wrote the file ourselves
  private _suppressImportUntil = 0

  /** Watch Raycast JSON for external changes → auto-import new snippets */
  private startRaycastWatcher() {
    this.stopRaycastWatcher()
    if (!this.settings.autoSyncRaycast) return

    const exportPath = this.settings.raycastExportPath
    if (!exportPath) return

    const resolvedPath = exportPath.replace(/^~/, require('os').homedir())
    const fs = require('fs')
    if (!fs.existsSync(resolvedPath)) return

    let importTimer: ReturnType<typeof setTimeout> | null = null

    try {
      this.raycastWatcher = fs.watch(resolvedPath, () => {
        if (!this.settings.autoSyncRaycast) return

        // Skip if we just wrote this file ourselves (export → watch → import loop)
        if (Date.now() < this._suppressImportUntil) return

        // Debounce 3s — Raycast may write multiple times
        if (importTimer) clearTimeout(importTimer)
        importTimer = setTimeout(() => {
          importTimer = null
          importFromRaycast(this, { silent: true })
        }, 3000)
      })
    } catch {
      // File may not exist yet or path invalid
    }
  }

  private stopRaycastWatcher() {
    if (this.raycastWatcher) {
      this.raycastWatcher.close()
      this.raycastWatcher = null
    }
  }

  async activatePlayground() {
    const existing = this.app.workspace.getLeavesOfType(PLAYGROUND_VIEW_TYPE)
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0])
      return
    }

    const leaf = this.app.workspace.getRightLeaf(false)
    if (leaf) {
      await leaf.setViewState({ type: PLAYGROUND_VIEW_TYPE, active: true })
      this.app.workspace.revealLeaf(leaf)
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
    // Restart watcher when settings change (toggle may have flipped)
    this.startRaycastWatcher()
  }

  onunload() {
    this.stopRaycastWatcher()
  }

  updatePreviewState(enabled: boolean) {
    this.app.workspace.iterateAllLeaves((leaf) => {
      // @ts-expect-error — accessing internal CM6 editor
      const editor = leaf.view?.editor
      if (!editor) return
      const cmView = editor.cm
      if (!cmView) return

      try {
        cmView.state.field(previewEnabledField)
        cmView.dispatch({ effects: togglePreviewEffect.of(enabled) })
      } catch {
        // Field not registered in this editor
      }
    })
  }
}
