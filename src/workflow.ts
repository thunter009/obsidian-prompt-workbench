/**
 * Workflow metadata types, extraction, header formatting, and snippet resolution.
 */

import type { App } from 'obsidian'
import { findPlaceholders } from './placeholders/parser'
import { resolveSnippetFile } from './placeholders/graph-links'
import { parseFrontmatter } from './frontmatter'

export interface WorkflowMetadata {
  phase?: string
  useWhen?: string
  after?: string
  produces?: string
  tools?: string[]
  workflowSteps?: string[]
}

const WORKFLOW_FIELDS = ['phase', 'use-when', 'after', 'produces', 'tools', 'workflow-steps'] as const

export const WORKFLOW_HEADER_START = '\u2500\u2500\u2500 Workflow Context \u2500\u2500\u2500'
export const WORKFLOW_HEADER_END = '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'

/** Extract workflow metadata from parsed frontmatter. Returns null if no workflow fields present. */
export function extractWorkflowMetadata(fm: Record<string, unknown>): WorkflowMetadata | null {
  const hasAny = WORKFLOW_FIELDS.some(f => fm[f] != null && fm[f] !== '')
  if (!hasAny) return null

  return {
    phase: typeof fm['phase'] === 'string' ? fm['phase'] : undefined,
    useWhen: typeof fm['use-when'] === 'string' ? fm['use-when'] : undefined,
    after: typeof fm['after'] === 'string' ? fm['after'] : undefined,
    produces: typeof fm['produces'] === 'string' ? fm['produces'] : undefined,
    tools: Array.isArray(fm['tools']) ? fm['tools'] as string[] : undefined,
    workflowSteps: Array.isArray(fm['workflow-steps']) ? fm['workflow-steps'] as string[] : undefined,
  }
}

/** Format workflow metadata as a plain-text header for Raycast snippet prepending. */
export function formatWorkflowHeader(meta: WorkflowMetadata): string {
  const lines: string[] = []
  lines.push(WORKFLOW_HEADER_START)

  if (meta.phase) {
    lines.push(`Phase: ${meta.phase.charAt(0).toUpperCase() + meta.phase.slice(1)}`)
  }
  if (meta.useWhen) {
    lines.push(`Use when: ${meta.useWhen}`)
  }
  if (meta.after && meta.produces) {
    lines.push(`After: ${meta.after}  \u2192  Produces: ${meta.produces}`)
  } else if (meta.after) {
    lines.push(`After: ${meta.after}`)
  } else if (meta.produces) {
    lines.push(`Produces: ${meta.produces}`)
  }
  if (meta.tools && meta.tools.length > 0) {
    lines.push(`Tools: ${meta.tools.join(', ')}`)
  }
  if (meta.workflowSteps && meta.workflowSteps.length > 0) {
    lines.push('Steps:')
    meta.workflowSteps.forEach((step, i) => {
      lines.push(`  ${i + 1}. ${step}`)
    })
  }

  lines.push(WORKFLOW_HEADER_END)
  lines.push('')

  return lines.join('\n')
}

/**
 * Resolve all {snippet name="X"} placeholders in text by inlining referenced file content.
 * Recursive with cycle detection.
 */
export async function resolveSnippets(
  app: App,
  text: string,
  visited?: Set<string>,
): Promise<{ resolved: string; errors: string[] }> {
  const errors: string[] = []
  const seen = visited ?? new Set<string>()
  const matches = findPlaceholders(text)

  let resolved = text
  // Process in reverse to preserve positions
  const snippetMatches = matches.filter(m => m.placeholder.type === 'snippet' && m.placeholder.snippetRef)
  for (const match of snippetMatches.reverse()) {
    const ref = match.placeholder.snippetRef!
    if (seen.has(ref)) {
      errors.push(`Circular reference: ${ref}`)
      continue
    }

    const file = resolveSnippetFile(app, ref)
    if (!file) {
      errors.push(`Missing snippet: ${ref}`)
      continue
    }

    seen.add(ref)
    const content = await app.vault.cachedRead(file)
    const { body } = parseFrontmatter(content)

    // Recursively resolve nested snippets
    const nested = await resolveSnippets(app, body, new Set(seen))
    errors.push(...nested.errors)

    resolved = resolved.slice(0, match.start) + nested.resolved + resolved.slice(match.end)
  }

  return { resolved, errors }
}
