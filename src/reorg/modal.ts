import { App, ButtonComponent, Modal, Notice, TFile } from 'obsidian'
import type PromptWorkbenchPlugin from '../main'
import { createLLMAdapter } from '../llm'

interface VaultFileSummary {
  file: TFile
  path: string
  name: string
  currentFolder: string
  excerpt: string
}

interface ProposedMove {
  file: TFile
  filePath: string
  currentFolder: string
  proposedFolder: string
  checked: boolean
}

interface RawMove {
  file?: unknown
  currentFolder?: unknown
  proposedFolder?: unknown
}

const REORG_SYSTEM_PROMPT = `You are a vault organization assistant.

Goal: propose better folder placement for markdown files by theme.

Rules:
- Return ONLY JSON.
- Output must be an array of objects with keys: file, currentFolder, proposedFolder.
- file must exactly match input file path.
- Keep folder names short and thematic (examples: prompts/writing, prompts/coding, research/ai).
- Do not propose folders starting with "_".
- Skip files that should remain where they are.
- If unsure, skip the file.
`

export class ReorgModal extends Modal {
  private plugin: PromptWorkbenchPlugin
  private abortController: AbortController | null = null
  private moves: ProposedMove[] = []

  constructor(app: App, plugin: PromptWorkbenchPlugin) {
    super(app)
    this.plugin = plugin
  }

  onOpen() {
    this.modalEl.addClass('pw-reorg-modal')
    this.setTitle('Reorganize vault')
    this.renderLoading('Reading vault files...')
    void this.loadMoves()
  }

  onClose() {
    this.abortController?.abort()
    this.contentEl.empty()
  }

  private renderLoading(message: string) {
    this.contentEl.empty()
    this.contentEl.createEl('p', { text: message })
    const controls = this.contentEl.createDiv({ cls: 'pw-controls' })
    new ButtonComponent(controls)
      .setButtonText('Cancel')
      .onClick(() => this.close())
  }

  private async loadMoves() {
    const files = await this.collectFiles()
    if (files.length === 0) {
      this.renderEmpty('No eligible markdown files found.')
      return
    }

    this.renderLoading(`Sending ${files.length} files to LLM...`)
    this.abortController = new AbortController()

    try {
      const settings = this.plugin.settings
      const adapter = createLLMAdapter({
        provider: settings.llmProvider,
        ollamaUrl: settings.ollamaUrl,
        openaiBaseUrl: settings.openaiBaseUrl,
        openaiApiKey: settings.openaiApiKey,
        anthropicBaseUrl: settings.anthropicBaseUrl,
        anthropicApiKey: settings.anthropicApiKey,
      })

      const stream = adapter.generate({
        prompt: this.buildPrompt(files),
        systemPrompt: REORG_SYSTEM_PROMPT,
        model: settings.llmModel,
        signal: this.abortController.signal,
      })

      let response = ''
      for await (const chunk of stream) {
        response += chunk
      }

      this.moves = this.parseMoves(response, files)
      this.renderMoves()
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      new Notice(`Reorganize failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      this.close()
    }
  }

  private async collectFiles(): Promise<VaultFileSummary[]> {
    const candidates = this.app.vault.getMarkdownFiles().filter((file) => !this.isExcludedPath(file.path))

    const summaries = await Promise.all(candidates.map(async (file) => {
      const content = await this.app.vault.cachedRead(file)
      return {
        file,
        path: file.path,
        name: file.name,
        currentFolder: file.parent?.path ?? '',
        excerpt: content.replace(/\s+/g, ' ').trim().slice(0, 200),
      }
    }))

    return summaries
  }

  private isExcludedPath(path: string): boolean {
    if (path.startsWith('_templates/') || path.startsWith('_config/')) {
      return true
    }
    const topSegment = path.split('/')[0] ?? ''
    return topSegment.startsWith('_')
  }

  private buildPrompt(files: VaultFileSummary[]): string {
    const payload = files.map((file) => ({
      file: file.path,
      currentFolder: file.currentFolder,
      contentExcerpt: file.excerpt,
    }))

    return `Analyze these markdown files and propose folder moves grouped by theme.\n\n${JSON.stringify(payload)}`
  }

  private parseMoves(rawText: string, files: VaultFileSummary[]): ProposedMove[] {
    const filesByPath = new Map(files.map((file) => [file.path, file]))
    const jsonCandidate = this.extractJson(rawText)
    const parsed: unknown = JSON.parse(jsonCandidate)
    const rawMoves = Array.isArray(parsed)
      ? parsed
      : (typeof parsed === 'object' && parsed && Array.isArray((parsed as { moves?: unknown }).moves)
          ? (parsed as { moves: unknown[] }).moves
          : [])

    const moves: ProposedMove[] = []
    for (const rawMove of rawMoves as RawMove[]) {
      if (typeof rawMove.file !== 'string' || typeof rawMove.proposedFolder !== 'string') {
        continue
      }
      const fileSummary = filesByPath.get(rawMove.file)
      if (!fileSummary) continue

      const proposedFolder = this.normalizeFolder(rawMove.proposedFolder)
      if (proposedFolder.startsWith('_')) continue
      if (proposedFolder === fileSummary.currentFolder) continue

      moves.push({
        file: fileSummary.file,
        filePath: fileSummary.path,
        currentFolder: fileSummary.currentFolder,
        proposedFolder,
        checked: true,
      })
    }

    return moves.sort((a, b) => {
      if (a.proposedFolder === b.proposedFolder) {
        return a.filePath.localeCompare(b.filePath)
      }
      return a.proposedFolder.localeCompare(b.proposedFolder)
    })
  }

  private extractJson(rawText: string): string {
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i)
    return (fenceMatch?.[1] ?? rawText).trim()
  }

  private normalizeFolder(folder: string): string {
    return folder.trim().replace(/^\/+|\/+$/g, '')
  }

  private renderEmpty(message: string) {
    this.contentEl.empty()
    this.contentEl.createEl('p', { text: message })
    const controls = this.contentEl.createDiv({ cls: 'pw-controls' })
    new ButtonComponent(controls)
      .setButtonText('Close')
      .setCta()
      .onClick(() => this.close())
  }

  private renderMoves() {
    if (this.moves.length === 0) {
      this.renderEmpty('No reorganization moves suggested.')
      return
    }

    this.contentEl.empty()
    this.setTitle('Reorganize vault: review moves')

    const byFolder = new Map<string, ProposedMove[]>()
    for (const move of this.moves) {
      const key = move.proposedFolder || '/'
      const list = byFolder.get(key)
      if (list) {
        list.push(move)
      } else {
        byFolder.set(key, [move])
      }
    }

    const topControls = this.contentEl.createDiv({ cls: 'pw-controls' })
    new ButtonComponent(topControls)
      .setButtonText('Select all')
      .onClick(() => {
        for (const move of this.moves) move.checked = true
        this.renderMoves()
      })
    new ButtonComponent(topControls)
      .setButtonText('Deselect all')
      .onClick(() => {
        for (const move of this.moves) move.checked = false
        this.renderMoves()
      })

    for (const [targetFolder, moves] of byFolder) {
      const groupEl = this.contentEl.createDiv({ cls: 'pw-reorg-group' })
      groupEl.createEl('h3', { text: targetFolder })

      for (const move of moves) {
        const row = groupEl.createEl('label', { cls: 'pw-reorg-row' })
        const checkbox = row.createEl('input', { type: 'checkbox' })
        checkbox.checked = move.checked
        checkbox.addEventListener('change', () => {
          move.checked = checkbox.checked
        })

        const detail = row.createSpan({ cls: 'pw-reorg-row-detail' })
        detail.createEl('strong', { text: move.file.name })
        detail.createEl('small', { text: ` ${move.currentFolder || '/'} -> ${move.proposedFolder || '/'}` })
      }
    }

    const bottomControls = this.contentEl.createDiv({ cls: 'pw-controls' })
    new ButtonComponent(bottomControls)
      .setButtonText('Cancel')
      .onClick(() => this.close())

    new ButtonComponent(bottomControls)
      .setButtonText('Apply')
      .setCta()
      .onClick(() => {
        void this.applyCheckedMoves()
      })
  }

  private async applyCheckedMoves() {
    const selected = this.moves.filter((move) => move.checked)
    if (selected.length === 0) {
      new Notice('No moves selected')
      return
    }

    this.renderLoading(`Applying ${selected.length} moves...`)

    let applied = 0
    for (const move of selected) {
      try {
        await this.ensureFolder(move.proposedFolder)
        const destination = move.proposedFolder ? `${move.proposedFolder}/${move.file.name}` : move.file.name
        if (move.file.path === destination) continue
        await this.app.vault.rename(move.file, destination)
        applied += 1
      } catch (error) {
        new Notice(`Failed move for ${move.file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    new Notice(`Reorganized ${applied} files`)
    this.close()
  }

  private async ensureFolder(folderPath: string) {
    if (!folderPath) return

    const parts = folderPath.split('/').filter(Boolean)
    let currentPath = ''
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      if (!this.app.vault.getAbstractFileByPath(currentPath)) {
        await this.app.vault.createFolder(currentPath)
      }
    }
  }
}
