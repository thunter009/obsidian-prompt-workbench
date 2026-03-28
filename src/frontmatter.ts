/**
 * Unified frontmatter parser.
 * Handles flat key:value, inline arrays [a, b], nested objects (2-space indent),
 * and YAML dash-lists (  - item).
 */

export function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: content }

  const frontmatter: Record<string, unknown> = {}
  const lines = match[1].split('\n')
  let currentKey: string | null = null
  let currentNested: Record<string, string> | string[] | null = null

  for (const line of lines) {
    // Indented line — part of a nested structure
    if (currentKey && line.startsWith('  ')) {
      const trimmed = line.trim()

      // Dash-list item: - value
      if (trimmed.startsWith('- ')) {
        if (!Array.isArray(currentNested)) {
          // Switch from object to array (first dash-list item)
          currentNested = []
        }
        let item = trimmed.slice(2).trim()
        // Strip YAML quotes
        if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) {
          item = item.slice(1, -1)
        }
        ;(currentNested as string[]).push(item)
        continue
      }

      // Nested key-value: key: value
      const colonIdx = line.indexOf(':')
      if (colonIdx !== -1 && !Array.isArray(currentNested)) {
        if (!currentNested) currentNested = {}
        const k = line.slice(0, colonIdx).trim()
        const v = line.slice(colonIdx + 1).trim()
        ;(currentNested as Record<string, string>)[k] = v
      }
      continue
    }

    // Flush current nested structure (or empty-value key with no nested content)
    if (currentKey) {
      if (currentNested) {
        frontmatter[currentKey] = currentNested
      }
      // If currentNested is null, key had empty value with no indented children — store as empty string
      currentKey = null
      currentNested = null
    }

    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value: unknown = line.slice(colonIdx + 1).trim()

    if (value === '') {
      // Start of nested object or dash-list
      currentKey = key
      currentNested = null // will be determined by first indented line
      continue
    }

    // Inline array: [a, b, c]
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
    }
    // Quoted string: "value" or 'value'
    if (typeof value === 'string' && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1)
    }
    frontmatter[key] = value
  }

  // Flush final nested structure
  if (currentKey) {
    if (currentNested) {
      frontmatter[currentKey] = currentNested
    }
  }

  return { frontmatter, body: match[2].trim() }
}
