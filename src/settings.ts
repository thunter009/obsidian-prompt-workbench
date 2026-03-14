import { App, PluginSettingTab, Setting } from 'obsidian'
import type PromptWorkbenchPlugin from './main'

export interface PromptWorkbenchSettings {
  showInlinePreviews: boolean
  raycastExportPath: string
}

export const DEFAULT_SETTINGS: PromptWorkbenchSettings = {
  showInlinePreviews: false,
  raycastExportPath: '~/.prompt-workbench/raycast-snippets.json',
}

export class PromptWorkbenchSettingTab extends PluginSettingTab {
  plugin: PromptWorkbenchPlugin

  constructor(app: App, plugin: PromptWorkbenchPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    containerEl.createEl('h3', { text: 'Editor' })

    new Setting(containerEl)
      .setName('Inline placeholder previews')
      .setDesc('Show ghost-text preview values after placeholders (e.g. {date} → 3/14/2026)')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showInlinePreviews)
        .onChange(async (value) => {
          this.plugin.settings.showInlinePreviews = value
          await this.plugin.saveSettings()
          this.plugin.updatePreviewState(value)
        }))

    containerEl.createEl('h3', { text: 'Raycast Export' })

    new Setting(containerEl)
      .setName('Export path')
      .setDesc('Path to Raycast snippets JSON file. Existing snippets in this file are preserved.')
      .addText(text => text
        .setPlaceholder('~/.prompt-workbench/raycast-snippets.json')
        .setValue(this.plugin.settings.raycastExportPath)
        .onChange(async (value) => {
          this.plugin.settings.raycastExportPath = value
          await this.plugin.saveSettings()
        }))
  }
}
