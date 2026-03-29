import { ItemView, WorkspaceLeaf, MarkdownRenderer } from 'obsidian'
import type PromptWorkbenchPlugin from '../main'
import { findPlaceholders, type ParsedPlaceholder } from '../placeholders/parser'
import { parseFrontmatter } from '../frontmatter'
import { extractWorkflowMetadata, type WorkflowMetadata } from '../workflow'

export const PLAYGROUND_VIEW_TYPE = 'prompt-workbench-playground'

interface PlaceholderField {
  raw: string
  type: string
  name: string  // display name (argumentName, type, or raw)
  key: string   // unique key for deduplication
}

function getFieldName(p: ParsedPlaceholder): string {
  if (p.argumentName) return p.argumentName
  if (p.snippetRef) return `snippet: ${p.snippetRef}`
  return p.type
}

function getFieldKey(p: ParsedPlaceholder): string {
  if (p.argumentName) return `argument:${p.argumentName}`
  if (p.snippetRef) return `snippet:${p.snippetRef}`
  return `type:${p.type}`
}

export class PlaygroundView extends ItemView {
  plugin: PromptWorkbenchPlugin
  private values: Map<string, string> = new Map()
  private fields: PlaceholderField[] = []
  private workflowContainer: HTMLElement | null = null
  private inputContainer: HTMLElement | null = null
  private previewContainer: HTMLElement | null = null
  private activeFilePath: string | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null

  constructor(leaf: WorkspaceLeaf, plugin: PromptWorkbenchPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string {
    return PLAYGROUND_VIEW_TYPE
  }

  getDisplayText(): string {
    return 'Playground'
  }

  getIcon(): string {
    return 'play'
  }

  async onOpen() {
    const container = this.contentEl
    container.empty()
    container.addClass('pw-playground')

    // Header
    const header = container.createDiv({ cls: 'pw-playground-header' })
    header.createEl('h4', { text: 'Playground' })

    // Workflow info (populated on refresh)
    this.workflowContainer = container.createDiv({ cls: 'pw-workflow-info' })

    // Input fields
    this.inputContainer = container.createDiv({ cls: 'pw-playground-inputs' })

    // Preview
    const previewHeader = container.createDiv({ cls: 'pw-playground-preview-header' })
    previewHeader.createEl('h5', { text: 'Preview' })
    const copyBtn = previewHeader.createEl('button', { text: 'Copy', cls: 'pw-copy-btn' })
    copyBtn.addEventListener('click', () => this.copyRendered())

    this.previewContainer = container.createDiv({ cls: 'pw-playground-preview' })

    // Listen for active file changes (immediate)
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => this.refresh())
    )

    // Listen for editor changes (debounced — fires on every keystroke)
    this.registerEvent(
      this.app.workspace.on('editor-change', () => this.debouncedRefresh())
    )

    // Initial render
    this.refresh()
  }

  async onClose() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.contentEl.empty()
  }

  private debouncedRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null
      this.refresh()
    }, 300)
  }

  private async refresh() {
    const file = this.app.workspace.getActiveFile()
    if (!file || file.extension !== 'md') {
      this.renderEmpty('Open a prompt file to see its placeholders')
      return
    }

    // Skip template files
    if (file.path.startsWith('_')) {
      this.renderEmpty('Template files are not playable')
      return
    }

    const content = await this.app.vault.cachedRead(file)
    const { frontmatter, body } = parseFrontmatter(content)

    // Render workflow info if present
    this.renderWorkflowInfo(extractWorkflowMetadata(frontmatter))

    // Find placeholders in body only (not frontmatter)
    const matches = findPlaceholders(body)
    if (matches.length === 0) {
      this.renderEmpty('No placeholders found in this note')
      return
    }

    // Deduplicate fields
    const seen = new Set<string>()
    const fields: PlaceholderField[] = []
    for (const m of matches) {
      const key = getFieldKey(m.placeholder)
      if (seen.has(key)) continue
      seen.add(key)
      fields.push({
        raw: m.placeholder.raw,
        type: m.placeholder.type,
        name: getFieldName(m.placeholder),
        key,
      })
    }

    // Load test values from frontmatter if file changed
    if (file.path !== this.activeFilePath) {
      this.activeFilePath = file.path
      this.values.clear()
      const testValues = frontmatter['test-values'] as Record<string, string> | undefined
      if (testValues && typeof testValues === 'object') {
        for (const [k, v] of Object.entries(testValues)) {
          this.values.set(`argument:${k}`, String(v))
        }
      }
    }

    this.fields = fields
    this.renderInputs()
    this.renderPreview(body)
  }

  private renderEmpty(message: string) {
    if (this.workflowContainer) this.workflowContainer.empty()
    if (this.inputContainer) {
      this.inputContainer.empty()
      this.inputContainer.createEl('p', { text: message, cls: 'pw-playground-empty' })
    }
    if (this.previewContainer) {
      this.previewContainer.empty()
    }
    this.fields = []
  }

  private renderInputs() {
    if (!this.inputContainer) return
    this.inputContainer.empty()

    for (const field of this.fields) {
      const row = this.inputContainer.createDiv({ cls: 'pw-field-row' })

      const label = row.createEl('label', { cls: 'pw-field-label' })
      const badge = label.createSpan({ text: field.type, cls: `pw-field-badge pw-badge-${field.type}` })
      label.createSpan({ text: ` ${field.name}` })

      const input = row.createEl('input', {
        type: 'text',
        cls: 'pw-field-input',
        placeholder: field.raw,
      })
      input.value = this.values.get(field.key) || ''
      input.addEventListener('input', () => {
        this.values.set(field.key, input.value)
        // Re-render preview
        const file = this.app.workspace.getActiveFile()
        if (file) {
          this.app.vault.cachedRead(file).then(content => {
            const { body } = parseFrontmatter(content)
            this.renderPreview(body)
          }).catch(() => {})
        }
      })
    }
  }

  private renderPreview(body: string) {
    if (!this.previewContainer) return
    this.previewContainer.empty()

    // Replace placeholders with values
    let rendered = body
    for (const field of this.fields) {
      const value = this.values.get(field.key)
      if (value) {
        // Escape regex special chars in the raw placeholder
        const escaped = field.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        rendered = rendered.replace(new RegExp(escaped, 'g'), () => value)
      }
    }

    // Render markdown
    const file = this.app.workspace.getActiveFile()
    MarkdownRenderer.render(
      this.app,
      rendered,
      this.previewContainer,
      file?.path || '',
      this,
    )
  }

  private async copyRendered() {
    const file = this.app.workspace.getActiveFile()
    if (!file) return

    const content = await this.app.vault.cachedRead(file)
    const { body } = parseFrontmatter(content)

    let rendered = body
    for (const field of this.fields) {
      const value = this.values.get(field.key)
      if (value) {
        const escaped = field.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        rendered = rendered.replace(new RegExp(escaped, 'g'), () => value)
      }
    }

    await navigator.clipboard.writeText(rendered)
    const { Notice } = await import('obsidian')
    new Notice('Copied to clipboard')
  }

  private renderWorkflowInfo(meta: WorkflowMetadata | null) {
    if (!this.workflowContainer) return
    this.workflowContainer.empty()
    if (!meta) return

    if (meta.phase) {
      this.workflowContainer.createSpan({
        text: meta.phase,
        cls: `pw-phase-badge pw-phase-${meta.phase}`,
      })
    }
    if (meta.useWhen) {
      this.workflowContainer.createEl('p', {
        text: meta.useWhen,
        cls: 'pw-workflow-use-when',
      })
    }
    if (meta.workflowSteps && meta.workflowSteps.length > 0) {
      const ol = this.workflowContainer.createEl('ol', { cls: 'pw-workflow-steps' })
      for (const step of meta.workflowSteps) {
        ol.createEl('li', { text: step })
      }
    }
  }
}
