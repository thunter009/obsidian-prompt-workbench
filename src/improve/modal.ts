import { App, Editor, Modal, Setting, Notice, ButtonComponent } from 'obsidian'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { unifiedMergeView } from '@codemirror/merge'
import type PromptWorkbenchPlugin from '../main'
import { createLLMAdapter } from '../llm/index'
import { STRATEGIES, type Strategy } from './strategies'
import { findPlaceholders } from '../placeholders/parser'

interface VersionEntry {
  text: string
  instruction?: string
}

export class StrategyPickerModal extends Modal {
  private plugin: PromptWorkbenchPlugin
  private editor: Editor

  constructor(app: App, plugin: PromptWorkbenchPlugin, editor: Editor) {
    super(app)
    this.plugin = plugin
    this.editor = editor
  }

  onOpen() {
    const { contentEl } = this
    this.setTitle('Improve prompt')

    // Strategy buttons
    for (const strategy of STRATEGIES) {
      new Setting(contentEl)
        .setName(strategy.name)
        .setDesc(strategy.description)
        .addButton(btn => btn
          .setButtonText('Go')
          .setCta()
          .onClick(() => {
            this.close()
            new ImprovePromptModal(this.app, this.plugin, this.editor, strategy).open()
          }))
    }

    // Custom instruction
    contentEl.createEl('hr')
    const customContainer = contentEl.createDiv({ cls: 'pw-custom-instruction' })
    customContainer.createEl('label', { text: 'Custom instruction', cls: 'pw-label' })
    const inputEl = customContainer.createEl('input', {
      type: 'text',
      placeholder: 'e.g. "make it friendlier" or "add error handling guidance"',
      cls: 'pw-input',
    })
    inputEl.style.width = '100%'
    inputEl.style.marginTop = '8px'

    const goBtn = customContainer.createEl('button', { text: 'Improve', cls: 'mod-cta pw-custom-go' })
    goBtn.style.marginTop = '8px'
    goBtn.addEventListener('click', () => {
      const instruction = inputEl.value.trim()
      if (!instruction) return
      this.close()
      const customStrategy: Strategy = {
        id: 'custom',
        name: 'Custom',
        description: instruction,
        systemPrompt: `You are a prompt engineering expert. Improve the given prompt according to this instruction: "${instruction}". Keep all placeholders intact. Return ONLY the improved prompt text, no explanation.`,
      }
      new ImprovePromptModal(this.app, this.plugin, this.editor, customStrategy).open()
    })

    // Enter key triggers custom improve
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        goBtn.click()
      }
    })

    inputEl.focus()
  }

  onClose() {
    this.contentEl.empty()
  }
}

export class ImprovePromptModal extends Modal {
  private plugin: PromptWorkbenchPlugin
  private editor: Editor
  private strategy: Strategy
  private originalText: string
  private versionStack: VersionEntry[] = []
  private currentVersionIndex = 0
  private abortController: AbortController | null = null
  private mergeViewInstance: EditorView | null = null

  constructor(app: App, plugin: PromptWorkbenchPlugin, editor: Editor, strategy: Strategy) {
    super(app)
    this.plugin = plugin
    this.editor = editor
    this.strategy = strategy
    this.originalText = editor.getValue()
  }

  onOpen() {
    this.modalEl.addClass('pw-improve-modal')
    this.setTitle(`Improving: ${this.strategy.name}`)
    this.renderStreaming()
    this.runImprove()
  }

  onClose() {
    this.abortController?.abort()
    this.mergeViewInstance?.destroy()
    this.mergeViewInstance = null
    this.contentEl.empty()
  }

  private renderStreaming() {
    const { contentEl } = this
    contentEl.empty()

    const streamContainer = contentEl.createDiv({ cls: 'pw-stream-container' })
    const pre = streamContainer.createEl('pre', { cls: 'pw-stream-output' })
    pre.textContent = ''

    const controls = contentEl.createDiv({ cls: 'pw-controls' })
    new ButtonComponent(controls)
      .setButtonText('Cancel')
      .onClick(() => {
        this.abortController?.abort()
        this.close()
      })
  }

  private renderDiffReview(original: string, improved: string) {
    const { contentEl } = this
    contentEl.empty()
    this.mergeViewInstance?.destroy()
    this.mergeViewInstance = null

    // Placeholder preservation check
    const origPlaceholders = findPlaceholders(original).map(m => m.placeholder.raw)
    const improvedPlaceholders = findPlaceholders(improved).map(m => m.placeholder.raw)
    const missing = origPlaceholders.filter(p => !improvedPlaceholders.includes(p))

    if (missing.length > 0) {
      const warning = contentEl.createDiv({ cls: 'pw-placeholder-warning' })
      warning.createEl('strong', { text: 'Missing placeholders: ' })
      warning.createSpan({ text: missing.join(', ') })
    }

    // Diff view
    const diffContainer = contentEl.createDiv({ cls: 'pw-diff-container' })

    const mergeView = new EditorView({
      parent: diffContainer,
      state: EditorState.create({
        doc: improved,
        extensions: [
          EditorView.editable.of(false),
          EditorState.readOnly.of(true),
          unifiedMergeView({
            original,
            mergeControls: false,
            gutter: true,
          }),
        ],
      }),
    })
    this.mergeViewInstance = mergeView

    // Version nav (if stack has multiple versions)
    if (this.versionStack.length > 1) {
      const versionNav = contentEl.createDiv({ cls: 'pw-version-nav' })
      const label = versionNav.createSpan({
        text: `Version ${this.currentVersionIndex + 1} of ${this.versionStack.length}`,
        cls: 'pw-version-label',
      })

      if (this.currentVersionIndex > 0) {
        new ButtonComponent(versionNav)
          .setButtonText('< Prev')
          .onClick(() => {
            this.currentVersionIndex--
            const prev = this.versionStack[this.currentVersionIndex]
            this.renderDiffReview(original, prev.text)
          })
      }
      if (this.currentVersionIndex < this.versionStack.length - 1) {
        new ButtonComponent(versionNav)
          .setButtonText('Next >')
          .onClick(() => {
            this.currentVersionIndex++
            const next = this.versionStack[this.currentVersionIndex]
            this.renderDiffReview(original, next.text)
          })
      }
    }

    // Controls
    const controls = contentEl.createDiv({ cls: 'pw-controls' })

    // Iterate: instruction input + improve again
    const iterateContainer = controls.createDiv({ cls: 'pw-iterate' })
    const iterateInput = iterateContainer.createEl('input', {
      type: 'text',
      placeholder: 'Refine: "make it shorter", "keep bullets"...',
      cls: 'pw-input',
    })
    new ButtonComponent(iterateContainer)
      .setButtonText('Improve again')
      .onClick(() => {
        const instruction = iterateInput.value.trim() || undefined
        this.improveAgain(improved, instruction)
      })

    iterateInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const instruction = iterateInput.value.trim() || undefined
        this.improveAgain(improved, instruction)
      }
    })

    // Accept / Reject
    const actionButtons = controls.createDiv({ cls: 'pw-actions' })
    new ButtonComponent(actionButtons)
      .setButtonText('Reject')
      .onClick(() => this.close())

    new ButtonComponent(actionButtons)
      .setButtonText('Accept')
      .setCta()
      .onClick(() => {
        this.editor.setValue(improved)
        new Notice('Prompt updated')
        this.close()
      })

    // Keyboard shortcuts
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        this.close()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        this.editor.setValue(improved)
        new Notice('Prompt updated')
        this.close()
      }
    }
    document.addEventListener('keydown', handler)
    // Cleanup on close
    const origOnClose = this.onClose.bind(this)
    this.onClose = () => {
      document.removeEventListener('keydown', handler)
      origOnClose()
    }
  }

  private async runImprove(text?: string, instruction?: string) {
    const promptText = text || this.originalText
    const settings = this.plugin.settings

    let systemPrompt = this.strategy.systemPrompt
    if (instruction) {
      systemPrompt += `\n\nAdditional instruction: ${instruction}`
    }

    // Add meta system prompt if configured
    if (settings.metaSystemPrompt) {
      systemPrompt = settings.metaSystemPrompt + '\n\n' + systemPrompt
    }

    this.abortController = new AbortController()

    try {
      const adapter = createLLMAdapter({
        provider: settings.llmProvider,
        ollamaUrl: settings.ollamaUrl,
        openaiBaseUrl: settings.openaiBaseUrl,
        openaiApiKey: settings.openaiApiKey,
        anthropicBaseUrl: settings.anthropicBaseUrl,
        anthropicApiKey: settings.anthropicApiKey,
      })

      const stream = adapter.generate({
        prompt: promptText,
        systemPrompt,
        model: settings.llmModel,
        signal: this.abortController.signal,
      })

      let accumulated = ''
      const pre = this.contentEl.querySelector('.pw-stream-output')

      for await (const chunk of stream) {
        accumulated += chunk
        if (pre) pre.textContent = accumulated
      }

      // Push to version stack and show diff
      this.versionStack.push({ text: accumulated, instruction })
      this.currentVersionIndex = this.versionStack.length - 1
      this.renderDiffReview(this.originalText, accumulated)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      new Notice(`Improve failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      this.close()
    }
  }

  private improveAgain(currentText: string, instruction?: string) {
    this.setTitle(instruction ? `Improving: ${instruction}` : `Improving: ${this.strategy.name}`)
    this.mergeViewInstance?.destroy()
    this.mergeViewInstance = null
    this.renderStreaming()
    this.runImprove(currentText, instruction)
  }
}
