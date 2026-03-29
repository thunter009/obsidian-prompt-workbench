import { App, PluginSettingTab, Setting } from 'obsidian'
import type PromptWorkbenchPlugin from './main'
import type { LLMProvider } from './llm/index'
import { checkClaudeCodeAuth } from './llm/claude-code'

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
  includeWorkflowHeader: boolean
  autoSyncRaycast: boolean
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
  includeWorkflowHeader: false,
  autoSyncRaycast: false,
}

function isClaudeCompatibleModel(model: string): boolean {
  const m = model.toLowerCase()
  return m === 'haiku' || m === 'sonnet' || m === 'opus' || m.startsWith('claude-')
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

    new Setting(containerEl)
      .setName('Auto-sync on save')
      .setDesc('Auto-export on vault save + auto-import new Raycast snippets. Vault is source of truth — edits made directly in Raycast are overwritten on next sync.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoSyncRaycast)
        .onChange(async (value) => {
          this.plugin.settings.autoSyncRaycast = value
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Include workflow header')
      .setDesc('Prepend workflow context (phase, use-when, steps) to exported snippets')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeWorkflowHeader)
        .onChange(async (value) => {
          this.plugin.settings.includeWorkflowHeader = value
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
        .addOption('claude-code', 'Claude Code (subscription)')
        .setValue(this.plugin.settings.llmProvider)
        .onChange(async (value) => {
          this.plugin.settings.llmProvider = value as LLMProvider

          // Auto-set model when switching to claude-code if current model is incompatible
          if (value === 'claude-code' && !isClaudeCompatibleModel(this.plugin.settings.llmModel)) {
            this.plugin.settings.llmModel = 'sonnet'
          }

          await this.plugin.saveSettings()
          this.display()
        }))

    const provider = this.plugin.settings.llmProvider

    new Setting(containerEl)
      .setName('Model')
      .setDesc(provider === 'claude-code'
        ? 'Model alias (sonnet, opus, haiku) or full ID'
        : 'Model name (e.g. llama3.2, gpt-4o, claude-sonnet-4-20250514)')
      .addText(text => text
        .setPlaceholder(provider === 'claude-code' ? 'sonnet' : '')
        .setValue(this.plugin.settings.llmModel)
        .onChange(async (value) => {
          this.plugin.settings.llmModel = value
          await this.plugin.saveSettings()
        }))

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

    if (provider === 'claude-code') {
      const authEl = containerEl.createDiv({ cls: 'pw-auth-status' })
      authEl.textContent = 'Checking auth...'
      const authCheckId = Symbol()
      ;(this as unknown as { _authCheckId: symbol })._authCheckId = authCheckId
      checkClaudeCodeAuth().then((result) => {
        // Ignore stale result if provider changed during check
        if ((this as unknown as { _authCheckId: symbol })._authCheckId !== authCheckId) return
        switch (result.status) {
          case 'authenticated':
            authEl.textContent = `Signed in as ${result.email}${result.plan ? ` (${result.plan})` : ''}`
            authEl.className = 'pw-auth-status pw-auth-ok'
            break
          case 'not-authenticated':
            authEl.textContent = "Not signed in \u2014 run 'claude auth login' in terminal"
            authEl.className = 'pw-auth-status pw-auth-warn'
            break
          case 'not-installed':
            authEl.textContent = 'Claude Code not found \u2014 install from claude.com/code'
            authEl.className = 'pw-auth-status pw-auth-error'
            break
          case 'error':
            authEl.textContent = `Could not check auth: ${result.message}`
            authEl.className = 'pw-auth-status pw-auth-muted'
            break
        }
      })
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
