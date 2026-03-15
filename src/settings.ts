import { App, PluginSettingTab, Setting } from 'obsidian'
import type PromptWorkbenchPlugin from './main'
import type { LLMProvider } from './llm/index'

export interface PromptWorkbenchSettings {
  showInlinePreviews: boolean
  raycastExportPath: string
  // LLM
  llmProvider: LLMProvider
  llmModel: string
  ollamaUrl: string
  openaiBaseUrl: string
  openaiApiKey: string
  anthropicBaseUrl: string
  anthropicApiKey: string
  metaSystemPrompt: string
}

export const DEFAULT_SETTINGS: PromptWorkbenchSettings = {
  showInlinePreviews: false,
  raycastExportPath: '~/.prompt-workbench/raycast-snippets.json',
  llmProvider: 'ollama',
  llmModel: 'qwen2.5:14b',
  ollamaUrl: 'http://localhost:11434',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiApiKey: '',
  anthropicBaseUrl: 'https://api.anthropic.com/v1',
  anthropicApiKey: '',
  metaSystemPrompt: '',
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

    // ── Editor ──
    containerEl.createEl('h3', { text: 'Editor' })

    new Setting(containerEl)
      .setName('Inline placeholder previews')
      .setDesc('Show ghost-text preview values after placeholders')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showInlinePreviews)
        .onChange(async (value) => {
          this.plugin.settings.showInlinePreviews = value
          await this.plugin.saveSettings()
          this.plugin.updatePreviewState(value)
        }))

    // ── Raycast Export ──
    containerEl.createEl('h3', { text: 'Raycast Export' })

    new Setting(containerEl)
      .setName('Export path')
      .setDesc('Path to Raycast snippets JSON. Existing snippets are preserved on export.')
      .addText(text => text
        .setPlaceholder('~/.prompt-workbench/raycast-snippets.json')
        .setValue(this.plugin.settings.raycastExportPath)
        .onChange(async (value) => {
          this.plugin.settings.raycastExportPath = value
          await this.plugin.saveSettings()
        }))

    // ── AI / LLM ──
    containerEl.createEl('h3', { text: 'AI Provider' })

    new Setting(containerEl)
      .setName('Provider')
      .addDropdown(drop => drop
        .addOption('ollama', 'Ollama (local)')
        .addOption('openai', 'OpenAI / compatible')
        .addOption('anthropic', 'Anthropic')
        .setValue(this.plugin.settings.llmProvider)
        .onChange(async (value) => {
          this.plugin.settings.llmProvider = value as LLMProvider
          await this.plugin.saveSettings()
          this.display() // re-render to show relevant fields
        }))

    new Setting(containerEl)
      .setName('Model')
      .setDesc('Model name (e.g. llama3.2, gpt-4o, claude-sonnet-4-20250514)')
      .addText(text => text
        .setValue(this.plugin.settings.llmModel)
        .onChange(async (value) => {
          this.plugin.settings.llmModel = value
          await this.plugin.saveSettings()
        }))

    const provider = this.plugin.settings.llmProvider

    if (provider === 'ollama') {
      new Setting(containerEl)
        .setName('Ollama URL')
        .addText(text => text
          .setPlaceholder('http://localhost:11434')
          .setValue(this.plugin.settings.ollamaUrl)
          .onChange(async (value) => {
            this.plugin.settings.ollamaUrl = value
            await this.plugin.saveSettings()
          }))
    }

    if (provider === 'openai') {
      new Setting(containerEl)
        .setName('API key')
        .addText(text => {
          text.inputEl.type = 'password'
          text
            .setPlaceholder('sk-...')
            .setValue(this.plugin.settings.openaiApiKey)
            .onChange(async (value) => {
              this.plugin.settings.openaiApiKey = value
              await this.plugin.saveSettings()
            })
        })

      new Setting(containerEl)
        .setName('Base URL')
        .setDesc('For OpenAI-compatible APIs (OpenRouter, local, etc)')
        .addText(text => text
          .setPlaceholder('https://api.openai.com/v1')
          .setValue(this.plugin.settings.openaiBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.openaiBaseUrl = value
            await this.plugin.saveSettings()
          }))
    }

    if (provider === 'anthropic') {
      new Setting(containerEl)
        .setName('API key')
        .addText(text => {
          text.inputEl.type = 'password'
          text
            .setPlaceholder('sk-ant-...')
            .setValue(this.plugin.settings.anthropicApiKey)
            .onChange(async (value) => {
              this.plugin.settings.anthropicApiKey = value
              await this.plugin.saveSettings()
            })
        })

      new Setting(containerEl)
        .setName('Base URL')
        .addText(text => text
          .setPlaceholder('https://api.anthropic.com/v1')
          .setValue(this.plugin.settings.anthropicBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.anthropicBaseUrl = value
            await this.plugin.saveSettings()
          }))
    }

    // ── Meta System Prompt ──
    containerEl.createEl('h3', { text: 'Meta System Prompt' })

    new Setting(containerEl)
      .setName('Additional system prompt')
      .setDesc('Prepended to all improvement strategies. Use for global context about your prompts.')
      .addTextArea(text => {
        text.inputEl.rows = 4
        text.inputEl.style.width = '100%'
        text
          .setPlaceholder('e.g. "These prompts are used with Raycast snippet expansion..."')
          .setValue(this.plugin.settings.metaSystemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.metaSystemPrompt = value
            await this.plugin.saveSettings()
          })
      })
  }
}
