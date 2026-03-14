import { Plugin } from 'obsidian'
import { placeholderExtension, togglePreviewEffect, previewEnabledField } from './placeholders/cm-extension'
import { placeholderPostProcessor } from './placeholders/reading-view'
import { exportToRaycast } from './raycast/export'
import { StrategyPickerModal } from './improve/modal'
import { PromptWorkbenchSettingTab, DEFAULT_SETTINGS, type PromptWorkbenchSettings } from './settings'

export default class PromptWorkbenchPlugin extends Plugin {
  settings: PromptWorkbenchSettings = DEFAULT_SETTINGS

  async onload() {
    await this.loadSettings()

    // CM6 placeholder highlighting (Live Preview / Source)
    this.registerEditorExtension(placeholderExtension)

    // Reading view placeholder highlighting
    this.registerMarkdownPostProcessor(placeholderPostProcessor)

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

    // Settings tab
    this.addSettingTab(new PromptWorkbenchSettingTab(this.app, this))

    // Apply initial preview state
    this.app.workspace.onLayoutReady(() => {
      this.updatePreviewState(this.settings.showInlinePreviews)
    })
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
      // @ts-expect-error — accessing internal CM6 view
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
