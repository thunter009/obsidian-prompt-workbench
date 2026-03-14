/**
 * Raycast snippet export.
 * Reads vault markdown files → writes Raycast-compatible JSON.
 *
 * Strategy for not wiping existing snippets:
 * - Reads existing Raycast JSON file first
 * - Vault snippets are merged in (matched by name)
 * - Existing snippets NOT in vault are preserved
 * - Vault version wins on name collision (vault is source of truth)
 * - Writes backup before overwriting
 */

import { App, TFile, Notice, normalizePath } from 'obsidian'
import type PromptWorkbenchPlugin from '../main'

export interface RaycastSnippet {
  name: string
  text: string
  keyword?: string
}

interface VaultSnippet {
  name: string
  text: string
  keyword?: string
  tags?: string[]
  path: string
}

/** Extract frontmatter and body from a markdown file */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: content }

  const frontmatter: Record<string, unknown> = {}
  const lines = match[1].split('\n')
  for (const line of lines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value: unknown = line.slice(colonIdx + 1).trim()

    // Parse arrays like [email, outreach]
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
    }
    frontmatter[key] = value
  }

  return { frontmatter, body: match[2].trim() }
}

/** Read all vault markdown files as snippets */
async function readVaultSnippets(app: App): Promise<VaultSnippet[]> {
  const files = app.vault.getMarkdownFiles()
  const snippets: VaultSnippet[] = []

  for (const file of files) {
    // Skip files in _config or other underscore-prefixed folders
    if (file.path.startsWith('_')) continue

    const content = await app.vault.cachedRead(file)
    const { frontmatter, body } = parseFrontmatter(content)

    // Skip files explicitly marked as non-exportable
    if (frontmatter['raycast-export'] === 'false' || frontmatter['raycast-export'] === false) continue

    snippets.push({
      name: file.basename,
      text: body,
      keyword: typeof frontmatter.keyword === 'string' ? frontmatter.keyword : undefined,
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags as string[] : undefined,
      path: file.path,
    })
  }

  return snippets
}

/** Merge vault snippets into existing Raycast JSON, preserving non-vault snippets */
function mergeSnippets(existing: RaycastSnippet[], vault: VaultSnippet[]): RaycastSnippet[] {
  const vaultByName = new Map<string, VaultSnippet>()
  for (const s of vault) {
    vaultByName.set(s.name, s)
  }

  const result: RaycastSnippet[] = []
  const seen = new Set<string>()

  // Update existing snippets that match vault names, preserve others
  for (const existing_s of existing) {
    const vaultVersion = vaultByName.get(existing_s.name)
    if (vaultVersion) {
      // Vault wins — use vault text + keyword
      result.push({
        name: vaultVersion.name,
        text: vaultVersion.text,
        ...(vaultVersion.keyword ? { keyword: vaultVersion.keyword } : {}),
      })
      seen.add(vaultVersion.name)
    } else {
      // Not in vault — preserve as-is
      result.push(existing_s)
    }
  }

  // Add vault snippets that weren't in the existing file
  for (const s of vault) {
    if (!seen.has(s.name)) {
      result.push({
        name: s.name,
        text: s.text,
        ...(s.keyword ? { keyword: s.keyword } : {}),
      })
    }
  }

  return result
}

/** Read existing Raycast JSON file, returning empty array if not found */
async function readExistingRaycastJson(path: string): Promise<RaycastSnippet[]> {
  try {
    const fs = require('fs')
    const content = fs.readFileSync(path, 'utf-8')
    return JSON.parse(content)
  } catch {
    return []
  }
}

/** Write backup of existing file */
function writeBackup(path: string): string | null {
  try {
    const fs = require('fs')
    if (!fs.existsSync(path)) return null

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const dir = require('path').dirname(path)
    const backupPath = require('path').join(dir, `raycast-snippets-backup-${timestamp}.json`)
    fs.copyFileSync(path, backupPath)
    return backupPath
  } catch {
    return null
  }
}

export async function exportToRaycast(plugin: PromptWorkbenchPlugin): Promise<void> {
  const exportPath = plugin.settings.raycastExportPath
  if (!exportPath) {
    new Notice('Set Raycast export path in Prompt Workbench settings first')
    return
  }

  // Expand ~ to home dir
  const resolvedPath = exportPath.replace(/^~/, require('os').homedir())

  try {
    // 1. Read vault snippets
    const vaultSnippets = await readVaultSnippets(plugin.app)
    if (vaultSnippets.length === 0) {
      new Notice('No snippets found in vault to export')
      return
    }

    // 2. Read existing Raycast JSON
    const existing = await readExistingRaycastJson(resolvedPath)

    // 3. Backup existing file
    if (existing.length > 0) {
      const backupPath = writeBackup(resolvedPath)
      if (backupPath) {
        console.log(`Prompt Workbench: backup written to ${backupPath}`)
      }
    }

    // 4. Merge
    const merged = mergeSnippets(existing, vaultSnippets)

    // 5. Count changes
    const existingNames = new Set(existing.map(s => s.name))
    const vaultNames = new Set(vaultSnippets.map(s => s.name))
    const added = vaultSnippets.filter(s => !existingNames.has(s.name)).length
    const updated = vaultSnippets.filter(s => existingNames.has(s.name)).length
    const preserved = existing.filter(s => !vaultNames.has(s.name)).length

    // 6. Write merged file
    const fs = require('fs')
    const dir = require('path').dirname(resolvedPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(resolvedPath, JSON.stringify(merged, null, 2))

    // 7. Report
    new Notice(
      `Exported to Raycast: ${merged.length} total\n` +
      `${added} added, ${updated} updated, ${preserved} preserved`
    )
  } catch (err) {
    new Notice(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    console.error('Prompt Workbench export error:', err)
  }
}
