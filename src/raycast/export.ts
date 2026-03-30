/**
 * Raycast snippet export and import.
 * Export: vault markdown → Raycast JSON (vault is source of truth, merge preserves non-vault snippets)
 * Import: Raycast JSON → vault markdown (creates files for snippets not already in vault)
 */

import { App, TFile, Notice, normalizePath } from 'obsidian'
import type PromptWorkbenchPlugin from '../main'
import { parseFrontmatter } from '../frontmatter'
import { extractWorkflowMetadata, formatWorkflowHeader, resolveSnippets, WORKFLOW_HEADER_START, WORKFLOW_HEADER_END, type WorkflowMetadata } from '../workflow'

export interface RaycastSnippet {
  name: string
  text: string
  keyword?: string
}

export interface VaultSnippet {
  name: string
  text: string
  keyword?: string
  tags?: string[]
  path: string
  workflow?: WorkflowMetadata
}

interface ResolutionWarning {
  path: string
  errors: string[]
}

/** Read all vault markdown files as snippets */
async function readVaultSnippets(app: App): Promise<{ snippets: VaultSnippet[]; resolutionWarnings: ResolutionWarning[] }> {
  const files = app.vault.getMarkdownFiles()
  const snippets: VaultSnippet[] = []
  const resolutionWarnings: ResolutionWarning[] = []

  for (const file of files) {
    // Skip files in _config or other underscore-prefixed folders
    if (file.path.startsWith('_')) continue

    const content = await app.vault.cachedRead(file)
    const { frontmatter, body } = parseFrontmatter(content)

    // Skip files explicitly marked as non-exportable
    if (frontmatter['raycast-export'] === 'false' || frontmatter['raycast-export'] === false) continue

    // Resolve {snippet name="X"} references inline
    const { resolved, errors } = await resolveSnippets(app, body)
    if (errors.length > 0) {
      resolutionWarnings.push({ path: file.path, errors })
    }

    snippets.push({
      name: file.basename,
      text: resolved,
      keyword: typeof frontmatter.keyword === 'string' ? frontmatter.keyword : undefined,
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags as string[] : undefined,
      path: file.path,
      workflow: extractWorkflowMetadata(frontmatter) ?? undefined,
    })
  }

  return { snippets, resolutionWarnings }
}

/** Build snippet text, optionally prepending workflow header */
function buildSnippetText(s: VaultSnippet, includeWorkflow: boolean): string {
  if (includeWorkflow && s.workflow) {
    return formatWorkflowHeader(s.workflow) + s.text
  }
  return s.text
}

/** Merge vault snippets into existing Raycast JSON, preserving non-vault snippets */
export function mergeSnippets(existing: RaycastSnippet[], vault: VaultSnippet[], includeWorkflow: boolean): { merged: RaycastSnippet[]; vaultDupes: string[] } {
  // Detect vault-side duplicates (same basename in different folders)
  const vaultByName = new Map<string, VaultSnippet>()
  const vaultDupes: string[] = []
  for (const s of vault) {
    if (vaultByName.has(s.name)) {
      vaultDupes.push(s.name)
    }
    vaultByName.set(s.name, s) // last wins (deterministic: vault file iteration order)
  }

  const result: RaycastSnippet[] = []
  const seen = new Set<string>()

  // Update existing snippets that match vault names, preserve others
  // Deduplicate: skip if we've already emitted this name
  for (const existing_s of existing) {
    if (seen.has(existing_s.name)) continue // deduplicate existing JSON

    const vaultVersion = vaultByName.get(existing_s.name)
    if (vaultVersion) {
      result.push({
        name: vaultVersion.name,
        text: buildSnippetText(vaultVersion, includeWorkflow),
        ...(vaultVersion.keyword ? { keyword: vaultVersion.keyword } : {}),
      })
    } else {
      result.push(existing_s)
    }
    seen.add(existing_s.name)
  }

  // Add vault snippets that weren't in the existing file
  for (const s of vault) {
    if (!seen.has(s.name)) {
      result.push({
        name: s.name,
        text: buildSnippetText(s, includeWorkflow),
        ...(s.keyword ? { keyword: s.keyword } : {}),
      })
      seen.add(s.name)
    }
  }

  return { merged: result, vaultDupes }
}

/** Read existing Raycast JSON file, returning empty array if not found */
export async function readExistingRaycastJson(path: string): Promise<RaycastSnippet[]> {
  try {
    const fs = require('fs')
    const content = fs.readFileSync(path, 'utf-8')
    return JSON.parse(content)
  } catch {
    return []
  }
}

/** Write backup of existing file */
export function writeBackup(path: string): string | null {
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

export async function exportToRaycast(plugin: PromptWorkbenchPlugin, options?: { silent?: boolean }): Promise<void> {
  const silent = options?.silent ?? false
  const exportPath = plugin.settings.raycastExportPath
  if (!exportPath) {
    if (!silent) new Notice('Set Raycast export path in Prompt Workbench settings first')
    return
  }

  // Expand ~ to home dir
  const resolvedPath = exportPath.replace(/^~/, require('os').homedir())

  try {
    // 1. Read vault snippets
    const { snippets: vaultSnippets, resolutionWarnings } = await readVaultSnippets(plugin.app)
    if (vaultSnippets.length === 0) {
      if (!silent) new Notice('No snippets found in vault to export')
      return
    }

    // 2. Read existing Raycast JSON
    const existing = await readExistingRaycastJson(resolvedPath)

    // 3. Backup existing file (skip for auto-sync to avoid backup spam)
    if (!silent && existing.length > 0) {
      const backupPath = writeBackup(resolvedPath)
      if (backupPath) {
        console.log(`Prompt Workbench: backup written to ${backupPath}`)
      }
    }

    // 4. Merge
    const { merged, vaultDupes } = mergeSnippets(existing, vaultSnippets, plugin.settings.includeWorkflowHeader)

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
    if (!silent) {
      let report = `Exported to Raycast: ${merged.length} total\n${added} added, ${updated} updated, ${preserved} preserved`
      if (vaultDupes.length > 0) {
        report += `\n⚠ ${vaultDupes.length} duplicate names in vault: ${vaultDupes.join(', ')}`
      }
      if (resolutionWarnings.length > 0) {
        report += `\n⚠ ${resolutionWarnings.length} snippet resolution warning(s); unresolved placeholders were kept literal`
        const preview = resolutionWarnings
          .flatMap((warning) => warning.errors.map((error) => `${warning.path}: ${error}`))
          .slice(0, 3)
        if (preview.length > 0) {
          report += `\n${preview.join('\n')}`
        }
      }
      new Notice(report)
    } else {
      console.log(`Prompt Workbench: auto-synced ${merged.length} snippets (${added} new, ${updated} updated)`)
      if (resolutionWarnings.length > 0) {
        console.warn(`Prompt Workbench: ${resolutionWarnings.length} snippet resolution warning(s) during auto-sync`, resolutionWarnings)
      }
    }
  } catch (err) {
    if (!silent) {
      new Notice(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
    console.error('Prompt Workbench export error:', err)
  }
}

const IMPORT_FOLDER = '00 Inbox'

export async function importFromRaycast(plugin: PromptWorkbenchPlugin, options?: { silent?: boolean }): Promise<void> {
  const silent = options?.silent ?? false
  const exportPath = plugin.settings.raycastExportPath
  if (!exportPath) {
    if (!silent) new Notice('Set Raycast export path in Prompt Workbench settings first')
    return
  }

  const resolvedPath = exportPath.replace(/^~/, require('os').homedir())

  try {
    // 1. Read Raycast JSON
    const raycastSnippets = await readExistingRaycastJson(resolvedPath)
    if (raycastSnippets.length === 0) {
      if (!silent) new Notice('No snippets found in Raycast JSON')
      return
    }

    // 2. Get existing vault basenames for duplicate detection
    const vaultNames = new Set(
      plugin.app.vault.getMarkdownFiles()
        .filter(f => !f.path.startsWith('_'))
        .map(f => f.basename)
    )

    // 3. Find snippets not in vault
    const toImport = raycastSnippets.filter(s => !vaultNames.has(s.name))
    if (toImport.length === 0) {
      if (!silent) new Notice(`All ${raycastSnippets.length} Raycast snippets already exist in vault`)
      return
    }

    // 4. Ensure import folder exists
    const folder = plugin.app.vault.getAbstractFileByPath(IMPORT_FOLDER)
    if (!folder) {
      await plugin.app.vault.createFolder(IMPORT_FOLDER)
    }

    // 5. Create vault files
    let created = 0
    let skipped = 0
    for (const snippet of toImport) {
      // Sanitize filename
      const safeName = snippet.name.replace(/[\\/:*?"<>|]/g, '-')
      const filePath = normalizePath(`${IMPORT_FOLDER}/${safeName}.md`)

      // Skip if file already exists at this path
      if (plugin.app.vault.getAbstractFileByPath(filePath)) {
        skipped++
        continue
      }

      // Build frontmatter
      const fm: string[] = ['---']
      if (snippet.keyword) fm.push(`keyword: ${snippet.keyword}`)
      fm.push('tags: []')
      fm.push('---')
      fm.push('')

      // Strip workflow header if present (don't import our own export artifact)
      let body = snippet.text
      const endMarker = WORKFLOW_HEADER_END + '\n\n'
      const headerEnd = body.indexOf(endMarker)
      if (body.startsWith(WORKFLOW_HEADER_START) && headerEnd !== -1) {
        body = body.slice(headerEnd + endMarker.length)
      }

      await plugin.app.vault.create(filePath, fm.join('\n') + body)
      created++
    }

    if (!silent) {
      new Notice(
        `Imported from Raycast: ${created} new snippets to ${IMPORT_FOLDER}/` +
        (skipped > 0 ? `\n${skipped} skipped (file exists)` : '') +
        `\n${raycastSnippets.length - toImport.length} already in vault`
      )
    } else if (created > 0) {
      console.log(`Prompt Workbench: auto-imported ${created} new snippets from Raycast`)
    }
  } catch (err) {
    if (!silent) {
      new Notice(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
    console.error('Prompt Workbench import error:', err)
  }
}
