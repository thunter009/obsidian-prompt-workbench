/**
 * CodeMirror 6 extension for Raycast placeholder highlighting.
 * Adapted from prompt-workbench src/components/editor/raycast-placeholder-language.ts
 *
 * Changes from original:
 * - Removed React/Zustand deps (useSnippetStore)
 * - Snippet hover uses Obsidian vault API (passed via config)
 * - Removed localStorage for preview toggle (use Obsidian plugin settings)
 */

import {
  ViewPlugin,
  Decoration,
  DecorationSet,
  EditorView,
  ViewUpdate,
  MatchDecorator,
  WidgetType,
  hoverTooltip,
  type Tooltip,
} from '@codemirror/view'
import { StateField, StateEffect, RangeSetBuilder } from '@codemirror/state'
import {
  PLACEHOLDER_REGEX,
  parsePlaceholder,
  getPlaceholderPreviewValue,
  isValidPlaceholderType,
} from './parser'

// ─── Valid placeholder highlighting ───────────────────────────────

const markCache: Record<string, Decoration> = {}
function markForType(type: string): Decoration {
  if (!markCache[type]) {
    markCache[type] = Decoration.mark({
      class: `cm-raycast-placeholder cm-raycast-placeholder-${type}`,
    })
  }
  return markCache[type]
}

function placeholderCategory(name: string): string {
  switch (name) {
    case 'clipboard': return 'clipboard'
    case 'argument': return 'argument'
    case 'snippet': return 'snippet'
    case 'date': case 'time': case 'datetime': case 'day': return 'date'
    case 'cursor': case 'uuid': case 'selection': return 'cursor'
    default: return 'clipboard'
  }
}

const placeholderMatcher = new MatchDecorator({
  regexp: new RegExp(PLACEHOLDER_REGEX.source, 'g'),
  decoration: (m) => markForType(placeholderCategory(m[1])),
})

const raycastPlaceholderPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = placeholderMatcher.createDeco(view)
    }
    update(update: ViewUpdate) {
      this.decorations = placeholderMatcher.updateDeco(update, this.decorations)
    }
  },
  { decorations: (v) => v.decorations },
)

// ─── Inline value preview widgets ─────────────────────────────────

class PreviewWidget extends WidgetType {
  constructor(readonly text: string) { super() }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-placeholder-preview'
    span.textContent = ` ${this.text}`
    return span
  }

  eq(other: PreviewWidget): boolean {
    return this.text === other.text
  }

  ignoreEvent(): boolean { return true }
}

export const togglePreviewEffect = StateEffect.define<boolean>()

export const previewEnabledField = StateField.define<boolean>({
  create() { return false },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(togglePreviewEffect)) return e.value
    }
    return value
  },
})

function buildPreviewDecorations(view: EditorView): DecorationSet {
  const enabled = view.state.field(previewEnabledField)
  if (!enabled) return Decoration.none

  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const re = new RegExp(PLACEHOLDER_REGEX.source, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(line.text)) !== null) {
      const raw = m[0]
      const parsed = parsePlaceholder(raw)
      if (parsed) {
        const preview = getPlaceholderPreviewValue(parsed)
        const pos = line.from + m.index + raw.length
        builder.add(pos, pos, Decoration.widget({ widget: new PreviewWidget(preview), side: 1 }))
      }
    }
  }

  return builder.finish()
}

const previewWidgetPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildPreviewDecorations(view)
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.state.field(previewEnabledField) !== update.startState.field(previewEnabledField)
      ) {
        this.decorations = buildPreviewDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

// ─── Invalid placeholder error decorations ────────────────────────

const INVALID_PLACEHOLDER_REGEX = /\{([a-z][a-z0-9-]*)\}/g
const UNCLOSED_PLACEHOLDER_REGEX =
  /\{(clipboard|cursor|date|time|datetime|day|uuid|selection|argument|snippet|[a-z][a-z0-9-]*)(?:\s+[^}]*)?$/gm

const VALID_TYPES = new Set([
  'clipboard', 'cursor', 'date', 'time', 'datetime',
  'day', 'uuid', 'selection', 'argument', 'snippet',
])

const PLACEHOLDER_PREFIXES = ['clip', 'cur', 'dat', 'tim', 'day', 'uui', 'sel', 'arg', 'sni']

function looksLikePlaceholderAttempt(word: string): boolean {
  if (isValidPlaceholderType(word)) return false
  return PLACEHOLDER_PREFIXES.some((p) => word.startsWith(p))
}

const errorMark = Decoration.mark({ class: 'cm-placeholder-error' })

function buildErrorDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)

    const re = new RegExp(INVALID_PLACEHOLDER_REGEX.source, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(line.text)) !== null) {
      const word = m[1]
      if (!VALID_TYPES.has(word) && looksLikePlaceholderAttempt(word)) {
        const from = line.from + m.index
        const to = from + m[0].length
        builder.add(from, to, errorMark)
      }
    }

    const unclosedRe = new RegExp(UNCLOSED_PLACEHOLDER_REGEX.source, 'gm')
    let um: RegExpExecArray | null
    while ((um = unclosedRe.exec(line.text)) !== null) {
      const afterMatch = line.text.slice(um.index)
      if (!afterMatch.includes('}')) {
        const from = line.from + um.index
        const to = line.from + line.text.length
        builder.add(from, to, errorMark)
      }
    }
  }

  return builder.finish()
}

const errorDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildErrorDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildErrorDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

// ─── Hover tooltips ───────────────────────────────────────────────

const errorHoverTooltip = hoverTooltip(
  (view: EditorView, pos: number): Tooltip | null => {
    const line = view.state.doc.lineAt(pos)
    const text = line.text

    const re = new RegExp(INVALID_PLACEHOLDER_REGEX.source, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const from = line.from + m.index
      const to = from + m[0].length
      if (pos >= from && pos <= to) {
        const word = m[1]
        if (!VALID_TYPES.has(word) && looksLikePlaceholderAttempt(word)) {
          return {
            pos: from, end: to, above: true,
            create() {
              const dom = document.createElement('div')
              dom.className = 'cm-placeholder-error-tooltip'
              dom.textContent = `Unknown placeholder type: {${word}}`
              return { dom }
            },
          }
        }
      }
    }

    const unclosedRe = new RegExp(UNCLOSED_PLACEHOLDER_REGEX.source, 'gm')
    let um: RegExpExecArray | null
    while ((um = unclosedRe.exec(text)) !== null) {
      const afterMatch = text.slice(um.index)
      if (!afterMatch.includes('}')) {
        const from = line.from + um.index
        const to = line.from + text.length
        if (pos >= from && pos <= to) {
          return {
            pos: from, end: to, above: true,
            create() {
              const dom = document.createElement('div')
              dom.className = 'cm-placeholder-error-tooltip'
              dom.textContent = 'Malformed placeholder: missing closing }'
              return { dom }
            },
          }
        }
      }
    }

    return null
  },
  { hoverTime: 300 },
)

// ─── Placeholder type hover tooltip ───────────────────────────────

const placeholderHoverTooltip = hoverTooltip(
  (view: EditorView, pos: number): Tooltip | null => {
    const line = view.state.doc.lineAt(pos)
    const re = new RegExp(PLACEHOLDER_REGEX.source, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(line.text)) !== null) {
      const from = line.from + m.index
      const to = from + m[0].length
      if (pos >= from && pos <= to) {
        const parsed = parsePlaceholder(m[0])
        if (!parsed) continue

        return {
          pos: from, end: to, above: true,
          create() {
            const dom = document.createElement('div')
            dom.className = 'cm-placeholder-tooltip'

            const typeSpan = document.createElement('span')
            typeSpan.className = 'cm-placeholder-tooltip-type'
            typeSpan.textContent = parsed.type
            dom.appendChild(typeSpan)

            if (parsed.argumentName) {
              const nameSpan = document.createElement('span')
              nameSpan.className = 'cm-placeholder-tooltip-detail'
              nameSpan.textContent = ` "${parsed.argumentName}"`
              dom.appendChild(nameSpan)
            }

            if (parsed.snippetRef) {
              const refSpan = document.createElement('span')
              refSpan.className = 'cm-placeholder-tooltip-detail'
              refSpan.textContent = ` → ${parsed.snippetRef}`
              dom.appendChild(refSpan)
            }

            if (parsed.modifiers.length > 0) {
              const modSpan = document.createElement('span')
              modSpan.className = 'cm-placeholder-tooltip-mods'
              modSpan.textContent = ` [${parsed.modifiers.join(', ')}]`
              dom.appendChild(modSpan)
            }

            return { dom }
          },
        }
      }
    }
    return null
  },
  { hoverTime: 300 },
)

// ─── Theme ────────────────────────────────────────────────────────

const placeholderTheme = EditorView.baseTheme({
  '.cm-raycast-placeholder': {
    borderRadius: '3px',
    padding: '0 2px',
    fontWeight: '500',
  },
  '.cm-raycast-placeholder-clipboard': {
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
    color: 'rgb(124, 58, 237)',
  },
  '.cm-raycast-placeholder-argument': {
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
    color: 'rgb(217, 119, 6)',
  },
  '.cm-raycast-placeholder-snippet': {
    backgroundColor: 'rgba(13, 148, 136, 0.15)',
    color: 'rgb(13, 148, 136)',
  },
  '.cm-raycast-placeholder-date': {
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    color: 'rgb(37, 99, 235)',
  },
  '.cm-raycast-placeholder-cursor': {
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
    color: 'rgb(225, 29, 72)',
  },
  '&.cm-focused .cm-raycast-placeholder': {
    filter: 'brightness(1.1)',
  },
  '.cm-placeholder-preview': {
    opacity: '0.5',
    fontStyle: 'italic',
    pointerEvents: 'none',
    userSelect: 'none',
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    borderRadius: '2px',
    padding: '0 3px',
    marginLeft: '2px',
  },
  '.cm-placeholder-error': {
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='m0 3 l2 -2 l1 0 l2 2' stroke='%23ef4444' fill='none' stroke-width='0.7'/%3E%3C/svg%3E\")",
    backgroundRepeat: 'repeat-x',
    backgroundPosition: 'bottom',
    paddingBottom: '2px',
  },
  '.cm-placeholder-error-tooltip': {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
  },
  '.cm-placeholder-tooltip': {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
  },
  '.cm-placeholder-tooltip-type': {
    fontWeight: '600',
  },
  '.cm-placeholder-tooltip-detail': {
    opacity: '0.8',
  },
  '.cm-placeholder-tooltip-mods': {
    opacity: '0.6',
    fontStyle: 'italic',
  },
})

// ─── Combined extension ───────────────────────────────────────────

export const placeholderExtension = [
  raycastPlaceholderPlugin,
  previewEnabledField,
  previewWidgetPlugin,
  errorDecorationPlugin,
  errorHoverTooltip,
  placeholderHoverTooltip,
  placeholderTheme,
]
