import { ItemView, WorkspaceLeaf, MarkdownRenderer } from 'obsidian'
import type PromptWorkbenchPlugin from '../main'
import { findPlaceholders, type ParsedPlaceholder } from '../placeholders/parser'

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
  private inputContainer: HTMLElement | null = null
  private previewContainer: HTMLElement | null = null
  private activeFilePath: string | null = null

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

    // Input fields
    this.inputContainer = container.createDiv({ cls: 'pw-playground-inputs' })

    // Preview
    const previewHeader = container.createDiv({ cls: 'pw-playground-preview-header' })
    previewHeader.createEl('h5', { text: 'Preview' })
    const copyBtn = previewHeader.createEl('button', { text: 'Copy', cls: 'pw-copy-btn' })
    copyBtn.addEventListener('click', () => this.copyRendered())

    this.previewContainer = container.createDiv({ cls: 'pw-playground-preview' })

    // Listen for active file changes
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => this.refresh())
    )

    // Listen for editor changes
    this.registerEvent(
      this.app.workspace.on('editor-change', () => this.refresh())
    )

    // Initial render
    this.refresh()
  }

  async onClose() {
    this.contentEl.empty()
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
    const { frontmatter, body } = this.parseFrontmatter(content)

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
            const { body } = this.parseFrontmatter(content)
            this.renderPreview(body)
          })
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
        rendered = rendered.replace(new RegExp(escaped, 'g'), value)
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
    const { body } = this.parseFrontmatter(content)

    let rendered = body
    for (const field of this.fields) {
      const value = this.values.get(field.key)
      if (value) {
        const escaped = field.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        rendered = rendered.replace(new RegExp(escaped, 'g'), value)
      }
    }

    await navigator.clipboard.writeText(rendered)
    const { Notice } = await import('obsidian')
    new Notice('Copied to clipboard')
  }

  private parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    if (!match) return { frontmatter: {}, body: content }

    const frontmatter: Record<string, unknown> = {}
    const lines = match[1].split('\n')
    let currentKey: string | null = null
    let currentObj: Record<string, string> | null = null

    for (const line of lines) {
      // Nested key-value (test-values)
      if (currentKey && line.startsWith('  ')) {
        const colonIdx = line.indexOf(':')
        if (colonIdx !== -1 && currentObj) {
          const k = line.slice(0, colonIdx).trim()
          const v = line.slice(colonIdx + 1).trim()
          currentObj[k] = v
        }
        continue
      }

      // Flush current nested object
      if (currentKey && currentObj) {
        frontmatter[currentKey] = currentObj
        currentKey = null
        currentObj = null
      }

      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const key = line.slice(0, colonIdx).trim()
      let value: unknown = line.slice(colonIdx + 1).trim()

      if (value === '') {
        // Could be start of nested object
        currentKey = key
        currentObj = {}
        continue
      }

      // Parse arrays
      if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
      }
      frontmatter[key] = value
    }

    // Flush final nested object
    if (currentKey && currentObj) {
      frontmatter[currentKey] = currentObj
    }

    return { frontmatter, body: match[2].trim() }
  }
}
