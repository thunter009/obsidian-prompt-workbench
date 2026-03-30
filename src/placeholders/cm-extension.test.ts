import { describe, expect, it } from 'vitest'
import { type Extension, EditorState } from '@codemirror/state'
import { type DecorationSet, EditorView } from '@codemirror/view'
import {
  buildErrorDecorations,
  buildPreviewDecorations,
  createPlaceholderExtension,
  errorDecorationPlugin,
  looksLikePlaceholderAttempt,
  placeholderCategory,
  previewEnabledField,
  previewWidgetPlugin,
  raycastPlaceholderPlugin,
  togglePreviewEffect,
} from './cm-extension'

type PluginWithDecorations = {
  decorations: DecorationSet
}

function createTestView(doc: string, extensions: readonly Extension[]): EditorView {
  const parent = document.createElement('div')
  document.body.appendChild(parent)

  return new EditorView({
    state: EditorState.create({
      doc,
      extensions,
    }),
    parent,
  })
}

function getDecorations(view: EditorView, plugin: unknown): DecorationSet {
  const pluginState = view.plugin(plugin as never) as PluginWithDecorations | null
  if (!pluginState) throw new Error('Plugin not active on view')
  return pluginState.decorations
}

function collectMarkedText(view: EditorView, decorations: DecorationSet): Array<{ text: string; className: string }> {
  const out: Array<{ text: string; className: string }> = []
  decorations.between(0, view.state.doc.length, (from, to, value) => {
    const className = String(value.spec.class ?? '')
    if (className.length === 0 || from === to) return
    out.push({
      text: view.state.doc.sliceString(from, to),
      className,
    })
  })
  return out
}

function collectPreviewWidgetTexts(decorations: DecorationSet): string[] {
  const out: string[] = []
  decorations.between(0, Number.MAX_SAFE_INTEGER, (_from, _to, value) => {
    const widget = (value.spec as { widget?: { text?: string } }).widget
    if (widget?.text) out.push(widget.text)
  })
  return out
}

describe('cm-extension exports', () => {
  it('exports placeholder helper functions', () => {
    expect(placeholderCategory('clipboard')).toBe('clipboard')
    expect(placeholderCategory('snippet')).toBe('snippet')
    expect(placeholderCategory('date')).toBe('date')
    expect(placeholderCategory('selection')).toBe('cursor')
    expect(placeholderCategory('unknown-type')).toBe('clipboard')

    expect(looksLikePlaceholderAttempt('clip')).toBe(true)
    expect(looksLikePlaceholderAttempt('clipboard')).toBe(false)
    expect(looksLikePlaceholderAttempt('random')).toBe(false)
  })

  it('exports decoration builder functions for direct test imports', () => {
    expect(typeof buildPreviewDecorations).toBe('function')
    expect(typeof buildErrorDecorations).toBe('function')
  })

  it('keeps createPlaceholderExtension API and composition unchanged', () => {
    const ext = createPlaceholderExtension({} as never)

    expect(ext).toHaveLength(8)
    expect(ext[0]).toBe(raycastPlaceholderPlugin)
    expect(ext[1]).toBe(previewEnabledField)
    expect(ext[2]).toBe(previewWidgetPlugin)
    expect(ext[3]).toBe(errorDecorationPlugin)
  })
})

describe('cm-extension integration', () => {
  it('applies category highlight decorations for valid placeholders only', () => {
    const view = createTestView(
      '{clipboard} {argument name="X"} {snippet name="Y"} {date} {cursor} {foobar}',
      [raycastPlaceholderPlugin],
    )

    try {
      const decorations = getDecorations(view, raycastPlaceholderPlugin)
      const marks = collectMarkedText(view, decorations)

      expect(marks).toEqual(
        expect.arrayContaining([
          { text: '{clipboard}', className: 'cm-raycast-placeholder cm-raycast-placeholder-clipboard' },
          { text: '{argument name="X"}', className: 'cm-raycast-placeholder cm-raycast-placeholder-argument' },
          { text: '{snippet name="Y"}', className: 'cm-raycast-placeholder cm-raycast-placeholder-snippet' },
          { text: '{date}', className: 'cm-raycast-placeholder cm-raycast-placeholder-date' },
          { text: '{cursor}', className: 'cm-raycast-placeholder cm-raycast-placeholder-cursor' },
        ]),
      )

      const texts = marks.map((m) => m.text)
      expect(texts).not.toContain('{foobar}')
    } finally {
      view.dom.parentElement?.remove()
      view.destroy()
    }
  })

  it('toggles preview widgets via state effect and keeps preview css class', () => {
    const view = createTestView(
      '{clipboard} {argument name="topic"}',
      [previewEnabledField, previewWidgetPlugin],
    )

    try {
      let decorations = getDecorations(view, previewWidgetPlugin)
      expect(collectPreviewWidgetTexts(decorations)).toHaveLength(0)

      view.dispatch({ effects: togglePreviewEffect.of(true) })
      decorations = getDecorations(view, previewWidgetPlugin)

      const previews = collectPreviewWidgetTexts(decorations)
      expect(previews).toEqual(['[clipboard]', '[topic]'])

      const widgetDom = decorations
        .iter()
        .value?.spec.widget?.toDOM() as HTMLElement | undefined
      expect(widgetDom?.className).toBe('cm-placeholder-preview')

      view.dispatch({ effects: togglePreviewEffect.of(false) })
      decorations = getDecorations(view, previewWidgetPlugin)
      expect(collectPreviewWidgetTexts(decorations)).toHaveLength(0)
    } finally {
      view.dom.parentElement?.remove()
      view.destroy()
    }
  })

  it('marks invalid and unclosed placeholder attempts as errors', () => {
    const view = createTestView(
      [
        'valid {clipboard}',
        'invalid-ish {clipboar}',
        'unclosed {clipboard',
        'unrelated {foobar}',
      ].join('\n'),
      [errorDecorationPlugin],
    )

    try {
      const decorations = getDecorations(view, errorDecorationPlugin)
      const marks = collectMarkedText(view, decorations)

      const errors = marks
        .filter((m) => m.className === 'cm-placeholder-error')
        .map((m) => m.text)

      expect(errors).toContain('{clipboar}')
      expect(errors).toContain('{clipboard')
      expect(errors).not.toContain('{clipboard}')
      expect(errors).not.toContain('{foobar}')
    } finally {
      view.dom.parentElement?.remove()
      view.destroy()
    }
  })
})
