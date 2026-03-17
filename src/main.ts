import { Plugin } from 'obsidian'
import { createPlaceholderExtension, togglePreviewEffect, previewEnabledField } from './placeholders/cm-extension'
import { createPlaceholderPostProcessor } from './placeholders/reading-view'
import { registerSnippetGraphLinks } from './placeholders/graph-links'
import { exportToRaycast } from './raycast/export'
import { StrategyPickerModal } from './improve/modal'
import { PlaygroundView, PLAYGROUND_VIEW_TYPE } from './playground/view'
import { ReorgModal } from './reorg/modal'
import { PromptWorkbenchSettingTab, DEFAULT_SETTINGS, type PromptWorkbenchSettings } from './settings'

export default class PromptWorkbenchPlugin extends Plugin {
  settings: PromptWorkbenchSettings = DEFAULT_SETTINGS

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
      callback: () => exportToRaycast(this),
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
      id: 'reorganize-vault',
      name: 'Prompt Workbench: Reorganize vault',
      callback: () => {
        new ReorgModal(this.app, this).open()
      },
    })

    // Settings tab
    this.addSettingTab(new PromptWorkbenchSettingTab(this.app, this))

    // Apply initial preview state
    this.app.workspace.onLayoutReady(() => {
      this.updatePreviewState(this.settings.showInlinePreviews)
    })
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
