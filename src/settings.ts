import { App, PluginSettingTab, Setting } from 'obsidian'
import type PromptWorkbenchPlugin from './main'

export interface PromptWorkbenchSettings {
  showInlinePreviews: boolean
}

export const DEFAULT_SETTINGS: PromptWorkbenchSettings = {
  showInlinePreviews: false,
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
  }
}
