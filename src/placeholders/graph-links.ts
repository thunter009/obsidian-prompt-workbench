import { type App, Plugin, TAbstractFile, TFile } from 'obsidian'
import { findPlaceholders } from './parser'

type ResolvedLinksMap = Record<string, Record<string, number>>

export function resolveSnippetFile(app: App, snippetRef: string): TFile | null {
  const direct = app.vault.getAbstractFileByPath(`${snippetRef}.md`)
  if (direct instanceof TFile) return direct

  const byBasename = app.vault.getMarkdownFiles().find((file) => file.basename === snippetRef)
  return byBasename ?? null
}

async function computeSnippetLinks(app: App, file: TFile): Promise<Record<string, number>> {
  const text = await app.vault.cachedRead(file)
  const links: Record<string, number> = {}

  for (const match of findPlaceholders(text)) {
    const ref = match.placeholder.snippetRef
    if (!ref) continue

    const target = resolveSnippetFile(app, ref)
    if (!target || target.path === file.path) continue

    links[target.path] = (links[target.path] ?? 0) + 1
  }

  return links
}

function removePreviousSnippetLinks(
  resolvedLinks: ResolvedLinksMap,
  sourcePath: string,
  previous: Record<string, number>,
) {
  const row = resolvedLinks[sourcePath]
  if (!row) return

  for (const [targetPath, count] of Object.entries(previous)) {
    if (row[targetPath] == null) continue
    const nextCount = row[targetPath] - count
    if (nextCount <= 0) {
      delete row[targetPath]
      continue
    }
    row[targetPath] = nextCount
  }
}

function applySnippetLinks(
  resolvedLinks: ResolvedLinksMap,
  sourcePath: string,
  links: Record<string, number>,
) {
  if (!resolvedLinks[sourcePath]) {
    resolvedLinks[sourcePath] = {}
  }

  const row = resolvedLinks[sourcePath]
  for (const [targetPath, count] of Object.entries(links)) {
    row[targetPath] = (row[targetPath] ?? 0) + count
  }
}

export function registerSnippetGraphLinks(plugin: Plugin) {
  const { app } = plugin
  const snippetLinksBySource = new Map<string, Record<string, number>>()

  async function refreshFile(file: TFile) {
    if (file.extension !== 'md') return

    const resolvedLinks = app.metadataCache.resolvedLinks as ResolvedLinksMap
    const previous = snippetLinksBySource.get(file.path) ?? {}
    removePreviousSnippetLinks(resolvedLinks, file.path, previous)

    const next = await computeSnippetLinks(app, file)
    applySnippetLinks(resolvedLinks, file.path, next)
    snippetLinksBySource.set(file.path, next)
  }

  async function refreshAll() {
    const files = app.vault.getMarkdownFiles()
    // Process in chunks to avoid freezing UI on large vaults
    const CHUNK = 50
    for (let i = 0; i < files.length; i += CHUNK) {
      await Promise.all(files.slice(i, i + CHUNK).map((file) => refreshFile(file)))
    }
  }

  function clearDeletedFile(file: TAbstractFile) {
    if (!(file instanceof TFile) || file.extension !== 'md') return

    const resolvedLinks = app.metadataCache.resolvedLinks as ResolvedLinksMap
    const previous = snippetLinksBySource.get(file.path)
    if (!previous) return

    removePreviousSnippetLinks(resolvedLinks, file.path, previous)
    snippetLinksBySource.delete(file.path)
  }

  // Debounce to prevent rapid-fire refreshes from racing
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let pendingFiles = new Set<TFile>()

  function scheduleRefresh(file?: TFile) {
    if (file) pendingFiles.add(file)
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(async () => {
      refreshTimer = null
      if (pendingFiles.size > 0) {
        const files = [...pendingFiles]
        pendingFiles = new Set()
        for (const f of files) await refreshFile(f)
      } else {
        await refreshAll()
      }
    }, 500)
  }

  plugin.registerEvent(app.vault.on('modify', (file) => {
    if (file instanceof TFile) scheduleRefresh(file)
  }))
  plugin.registerEvent(app.vault.on('create', (file) => {
    if (file instanceof TFile) scheduleRefresh(file)
  }))
  plugin.registerEvent(app.vault.on('rename', () => { scheduleRefresh() }))
  plugin.registerEvent(app.vault.on('delete', clearDeletedFile))

  plugin.registerEvent(app.metadataCache.on('resolved', () => { scheduleRefresh() }))

  void refreshAll()
}
