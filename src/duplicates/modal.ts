/**
 * Duplicate detection and resolution modal.
 * Scans vault for basename collisions, shows diff, lets user pick which to keep.
 */

import { App, Modal, TFile, Notice, ButtonComponent } from 'obsidian'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { unifiedMergeView } from '@codemirror/merge'
import type PromptWorkbenchPlugin from '../main'

interface DuplicateGroup {
  basename: string
  files: TFile[]
  identical: boolean
}

function findDuplicateGroups(app: App): Map<string, TFile[]> {
  const byName = new Map<string, TFile[]>()
  for (const file of app.vault.getMarkdownFiles()) {
    if (file.path.startsWith('_')) continue
    const list = byName.get(file.basename)
    if (list) {
      list.push(file)
    } else {
      byName.set(file.basename, [file])
    }
  }

  // Only keep groups with 2+ files
  for (const [name, files] of byName) {
    if (files.length < 2) byName.delete(name)
  }
  return byName
}

export class DuplicateModal extends Modal {
  private plugin: PromptWorkbenchPlugin
  private groups: DuplicateGroup[] = []
  private mergeViewInstance: EditorView | null = null

  constructor(app: App, plugin: PromptWorkbenchPlugin) {
    super(app)
    this.plugin = plugin
  }

  async onOpen() {
    this.modalEl.addClass('pw-duplicate-modal')
    this.setTitle('Duplicate Detection')
    await this.scan()
  }

  onClose() {
    this.mergeViewInstance?.destroy()
    this.mergeViewInstance = null
    this.contentEl.empty()
  }

  private async scan() {
    this.contentEl.empty()
    this.contentEl.createEl('p', { text: 'Scanning vault...', cls: 'pw-dup-status' })

    const dupeMap = findDuplicateGroups(this.app)

    if (dupeMap.size === 0) {
      this.contentEl.empty()
      this.contentEl.createEl('p', { text: 'No duplicate prompts found.' })
      return
    }

    // Check if each group has identical content
    this.groups = []
    for (const [basename, files] of dupeMap) {
      const contents = await Promise.all(files.map(f => this.app.vault.cachedRead(f)))
      const identical = contents.every(c => c === contents[0])
      this.groups.push({ basename, files, identical })
    }

    this.renderList()
  }

  private renderList() {
    this.contentEl.empty()
    this.mergeViewInstance?.destroy()
    this.mergeViewInstance = null

    const summary = this.contentEl.createEl('p', { cls: 'pw-dup-status' })
    summary.textContent = `${this.groups.length} duplicate${this.groups.length === 1 ? '' : ' sets'} found`

    for (const group of this.groups) {
      const groupEl = this.contentEl.createDiv({ cls: 'pw-dup-group' })

      // Header row: name + badge
      const header = groupEl.createDiv({ cls: 'pw-dup-header' })
      header.createEl('strong', { text: group.basename })
      header.createSpan({
        text: group.identical ? 'Identical' : 'Different',
        cls: group.identical ? 'pw-dup-identical' : 'pw-dup-different',
      })

      // File rows
      for (const file of group.files) {
        const row = groupEl.createDiv({ cls: 'pw-dup-file' })
        row.createSpan({ text: file.path, cls: 'pw-dup-file-path' })

        const meta = row.createSpan({ cls: 'pw-dup-file-meta' })
        const date = new Date(file.stat.mtime)
        meta.textContent = `${formatSize(file.stat.size)} · ${date.toLocaleDateString()}`

        // Keep button
        new ButtonComponent(row)
          .setButtonText('Keep this')
          .onClick(async () => {
            await this.resolve(group, file)
          })
      }

      // Compare button (only if different)
      if (!group.identical) {
        const controls = groupEl.createDiv({ cls: 'pw-dup-controls' })
        new ButtonComponent(controls)
          .setButtonText('Compare')
          .onClick(() => this.renderDiff(group))
      }
    }
  }

  private async renderDiff(group: DuplicateGroup) {
    this.contentEl.empty()
    this.mergeViewInstance?.destroy()
    this.mergeViewInstance = null

    // Header
    this.contentEl.createEl('h4', { text: group.basename })

    // Labels
    const labels = this.contentEl.createDiv({ cls: 'pw-dup-diff-labels' })
    labels.createSpan({ text: group.files[0].path, cls: 'pw-dup-file-path' })
    labels.createSpan({ text: ' vs ', cls: 'pw-dup-vs' })
    labels.createSpan({ text: group.files[1].path, cls: 'pw-dup-file-path' })

    // Read content
    const [contentA, contentB] = await Promise.all([
      this.app.vault.cachedRead(group.files[0]),
      this.app.vault.cachedRead(group.files[1]),
    ])

    // Diff view
    const diffContainer = this.contentEl.createDiv({ cls: 'pw-diff-container' })
    this.mergeViewInstance = new EditorView({
      parent: diffContainer,
      state: EditorState.create({
        doc: contentB,
        extensions: [
          EditorView.editable.of(false),
          EditorState.readOnly.of(true),
          unifiedMergeView({
            original: contentA,
            mergeControls: false,
            gutter: true,
          }),
        ],
      }),
    })

    // Action buttons
    const actions = this.contentEl.createDiv({ cls: 'pw-actions' })

    new ButtonComponent(actions)
      .setButtonText('Back')
      .onClick(() => this.renderList())

    new ButtonComponent(actions)
      .setButtonText(`Keep from ${group.files[0].parent?.name || '/'}`)
      .onClick(async () => {
        await this.resolve(group, group.files[0])
      })

    new ButtonComponent(actions)
      .setButtonText(`Keep from ${group.files[1].parent?.name || '/'}`)
      .setCta()
      .onClick(async () => {
        await this.resolve(group, group.files[1])
      })
  }

  private async resolve(group: DuplicateGroup, keep: TFile) {
    const toTrash = group.files.filter(f => f !== keep)

    for (const file of toTrash) {
      await this.app.vault.trash(file, true) // true = system trash (recoverable)
    }

    new Notice(`Kept ${keep.path}, trashed ${toTrash.length} duplicate${toTrash.length > 1 ? 's' : ''}`)

    // Remove resolved group and re-render
    this.groups = this.groups.filter(g => g !== group)
    if (this.groups.length === 0) {
      this.contentEl.empty()
      this.contentEl.createEl('p', { text: 'All duplicates resolved.' })
    } else {
      this.renderList()
    }
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  return `${(bytes / 1024).toFixed(1)}KB`
}
