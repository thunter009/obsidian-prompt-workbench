/**
 * Markdown post-processor for Reading view.
 * CM6 extensions only run in Live Preview / Source mode.
 * This highlights placeholders in Reading view too.
 */

import { type App, type MarkdownPostProcessorContext, TFile } from 'obsidian'
import { PLACEHOLDER_REGEX } from './parser'

const TYPE_CLASSES: Record<string, string> = {
  clipboard: 'pw-reading-placeholder pw-reading-clipboard',
  argument: 'pw-reading-placeholder pw-reading-argument',
  snippet: 'pw-reading-placeholder pw-reading-snippet',
  date: 'pw-reading-placeholder pw-reading-date',
  time: 'pw-reading-placeholder pw-reading-date',
  datetime: 'pw-reading-placeholder pw-reading-date',
  day: 'pw-reading-placeholder pw-reading-date',
  cursor: 'pw-reading-placeholder pw-reading-cursor',
  uuid: 'pw-reading-placeholder pw-reading-cursor',
  selection: 'pw-reading-placeholder pw-reading-cursor',
}

function resolveSnippetFile(app: App, snippetRef: string): TFile | null {
  const direct = app.vault.getAbstractFileByPath(`${snippetRef}.md`)
  if (direct instanceof TFile) return direct

  const byBasename = app.vault.getMarkdownFiles().find((file) => file.basename === snippetRef)
  return byBasename ?? null
}

function appendHiddenSnippetLinks(el: HTMLElement, app: App, snippetRefs: Set<string>) {
  if (snippetRefs.size === 0) return

  const hidden = document.createElement('div')
  hidden.style.display = 'none'
  hidden.setAttribute('aria-hidden', 'true')

  for (const ref of snippetRefs) {
    const file = resolveSnippetFile(app, ref)
    if (!file) continue

    const link = document.createElement('a')
    link.className = 'internal-link'
    link.setAttribute('data-href', file.path)
    link.setAttribute('href', file.path)
    link.textContent = file.basename
    hidden.appendChild(link)
  }

  if (hidden.childElementCount > 0) {
    el.appendChild(hidden)
  }
}

export function createPlaceholderPostProcessor(app: App) {
  return (el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
  // Walk all text nodes in the rendered element
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const nodesToReplace: { node: Text; matches: { type: string; raw: string; index: number }[] }[] = []
  const snippetRefs = new Set<string>()

  let textNode: Text | null
  while ((textNode = walker.nextNode() as Text | null)) {
    const text = textNode.textContent || ''
    const re = new RegExp(PLACEHOLDER_REGEX.source, 'g')
    const matches: { type: string; raw: string; index: number }[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      matches.push({ type: m[1], raw: m[0], index: m.index })
    }
    if (matches.length > 0) {
      nodesToReplace.push({ node: textNode, matches })
    }
  }

  for (const { node, matches } of nodesToReplace) {
    const text = node.textContent || ''
    const frag = document.createDocumentFragment()
    let lastIndex = 0

    for (const match of matches) {
      // Text before placeholder
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)))
      }
      // Highlighted placeholder
      const span = document.createElement('span')
      span.className = TYPE_CLASSES[match.type] || 'pw-reading-placeholder'
      span.textContent = match.raw
      if (match.type === 'snippet') {
        const snippetMatch = match.raw.match(/\bname="([^"]+)"/)
        const snippetRef = snippetMatch?.[1]

        if (snippetRef) {
          snippetRefs.add(snippetRef)
          span.dataset.snippetRef = snippetRef

          const file = resolveSnippetFile(app, snippetRef)
          if (!file) {
            span.title = `Snippet not found: ${snippetRef}`
          } else {
            span.title = file.path
            span.addEventListener('click', (event) => {
              const mouseEvent = event as MouseEvent
              if (!(mouseEvent.metaKey || mouseEvent.ctrlKey)) return
              mouseEvent.preventDefault()
              void app.workspace.getLeaf('tab').openFile(file)
            })
          }
        }
      }
      frag.appendChild(span)
      lastIndex = match.index + match.raw.length
    }

    // Text after last placeholder
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)))
    }

    node.parentNode?.replaceChild(frag, node)
  }

  appendHiddenSnippetLinks(el, app, snippetRefs)
}
}
