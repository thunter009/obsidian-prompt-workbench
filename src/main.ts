import { Plugin } from 'obsidian'
import { placeholderExtension, togglePreviewEffect, previewEnabledField } from './placeholders/cm-extension'
import { placeholderPostProcessor } from './placeholders/reading-view'
import { exportToRaycast } from './raycast/export'
import { PromptWorkbenchSettingTab, DEFAULT_SETTINGS, type PromptWorkbenchSettings } from './settings'

export default class PromptWorkbenchPlugin extends Plugin {
  settings: PromptWorkbenchSettings = DEFAULT_SETTINGS

  async onload() {
    await this.loadSettings()

    // Register CM6 placeholder highlighting + previews + error decorations (Live Preview / Source)
    this.registerEditorExtension(placeholderExtension)

    // Register post-processor for placeholder highlighting in Reading view
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

    // Settings tab
    this.addSettingTab(new PromptWorkbenchSettingTab(this.app, this))

    // Apply initial preview state after a short delay (editor needs to be ready)
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
    // Dispatch toggle effect to all open editors
    this.app.workspace.iterateAllLeaves((leaf) => {
      // @ts-expect-error — accessing internal CM6 editor
      const editor = leaf.view?.editor
      if (!editor) return
      // @ts-expect-error — accessing internal CM6 view
      const cmView = editor.cm
      if (!cmView) return

      try {
        // Only dispatch if the field is registered
        cmView.state.field(previewEnabledField)
        cmView.dispatch({ effects: togglePreviewEffect.of(enabled) })
      } catch {
        // Field not registered in this editor — skip
      }
    })
  }
}
