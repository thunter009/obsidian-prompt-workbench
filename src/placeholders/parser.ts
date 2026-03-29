/**
 * Raycast Placeholder Parser
 * Parses placeholder syntax into structured data for visualization.
 * Transferred from prompt-workbench src/lib/raycast/placeholder-parser.ts
 */

export type PlaceholderType =
  | 'clipboard'
  | 'cursor'
  | 'date'
  | 'time'
  | 'datetime'
  | 'day'
  | 'uuid'
  | 'selection'
  | 'argument'
  | 'snippet'

export type PlaceholderModifier =
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  | 'percent-encode'
  | 'json-stringify'
  | 'raw'

export interface PlaceholderAttribute {
  name: string
  value: string
}

export interface ParsedPlaceholder {
  raw: string
  type: PlaceholderType
  attributes: PlaceholderAttribute[]
  modifiers: PlaceholderModifier[]
  snippetRef?: string
  argumentName?: string
}

const PLACEHOLDER_TYPES: PlaceholderType[] = [
  'clipboard', 'cursor', 'date', 'time', 'datetime',
  'day', 'uuid', 'selection', 'argument', 'snippet',
]

const MODIFIERS: PlaceholderModifier[] = [
  'uppercase', 'lowercase', 'trim', 'percent-encode', 'json-stringify', 'raw',
]

export const PLACEHOLDER_REGEX =
  /\{(clipboard|cursor|date|time|datetime|day|uuid|selection|argument|snippet)(\s+[^}]*)?\}/g

const ATTR_REGEX = /(\w+(?:-\w+)?)=(?:"([^"]*)"|(\S+))/g
const MODIFIER_REGEX = /\b(uppercase|lowercase|trim|percent-encode|json-stringify|raw)\b/g

export function parsePlaceholder(raw: string): ParsedPlaceholder | null {
  const match = raw.match(
    /^\{(clipboard|cursor|date|time|datetime|day|uuid|selection|argument|snippet)(\s+[^}]*)?\}$/
  )
  if (!match) return null

  const type = match[1] as PlaceholderType
  const attrString = match[2] || ''

  const attributes: PlaceholderAttribute[] = []
  const modifiers: PlaceholderModifier[] = []

  let attrMatch: RegExpExecArray | null
  while ((attrMatch = ATTR_REGEX.exec(attrString)) !== null) {
    attributes.push({
      name: attrMatch[1],
      value: attrMatch[2] ?? attrMatch[3],
    })
  }
  ATTR_REGEX.lastIndex = 0

  let modMatch: RegExpExecArray | null
  while ((modMatch = MODIFIER_REGEX.exec(attrString)) !== null) {
    modifiers.push(modMatch[1] as PlaceholderModifier)
  }
  MODIFIER_REGEX.lastIndex = 0

  const result: ParsedPlaceholder = { raw, type, attributes, modifiers }

  if (type === 'snippet') {
    const nameAttr = attributes.find((a) => a.name === 'name')
    if (nameAttr) result.snippetRef = nameAttr.value
  }
  if (type === 'argument') {
    const nameAttr = attributes.find((a) => a.name === 'name')
    if (nameAttr) result.argumentName = nameAttr.value
  }

  return result
}

export interface PlaceholderMatch {
  placeholder: ParsedPlaceholder
  start: number
  end: number
}

export function findPlaceholders(text: string): PlaceholderMatch[] {
  const matches: PlaceholderMatch[] = []
  const re = new RegExp(PLACEHOLDER_REGEX.source, 'g')

  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const parsed = parsePlaceholder(match[0])
    if (parsed) {
      matches.push({
        placeholder: parsed,
        start: match.index,
        end: match.index + match[0].length,
      })
    }
  }

  return matches
}

export function isValidPlaceholderType(type: string): type is PlaceholderType {
  return PLACEHOLDER_TYPES.includes(type as PlaceholderType)
}

export function isValidModifier(mod: string): mod is PlaceholderModifier {
  return MODIFIERS.includes(mod as PlaceholderModifier)
}

export function getPlaceholderPreviewValue(parsed: ParsedPlaceholder): string {
  const { type, attributes, modifiers, snippetRef, argumentName } = parsed
  let value = ''

  switch (type) {
    case 'clipboard': {
      value = '[clipboard]'
      const offsetAttr = attributes.find((a) => a.name === 'offset')
      if (offsetAttr) value = `[clipboard #${offsetAttr.value}]`
      break
    }
    case 'cursor':
      value = '|'
      break
    case 'date': {
      const now = new Date()
      const formatAttr = attributes.find((a) => a.name === 'format')
      const dateOffsetAttr = attributes.find((a) => a.name === 'offset')
      if (dateOffsetAttr) {
        const offsetMatch = dateOffsetAttr.value.match(/^(-?\d+)([dwmy])$/)
        if (offsetMatch) {
          const num = parseInt(offsetMatch[1], 10)
          const unit = offsetMatch[2]
          if (unit === 'd') now.setDate(now.getDate() + num)
          else if (unit === 'w') now.setDate(now.getDate() + num * 7)
          else if (unit === 'm') now.setMonth(now.getMonth() + num)
          else if (unit === 'y') now.setFullYear(now.getFullYear() + num)
        }
      }
      if (formatAttr) {
        value = formatAttr.value
          .replace(/YYYY/g, String(now.getFullYear()))
          .replace(/MM/g, String(now.getMonth() + 1).padStart(2, '0'))
          .replace(/DD/g, String(now.getDate()).padStart(2, '0'))
          .replace(/M/g, String(now.getMonth() + 1))
          .replace(/D/g, String(now.getDate()))
      } else {
        value = now.toLocaleDateString()
      }
      break
    }
    case 'time':
      value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      break
    case 'datetime': {
      const now = new Date()
      value = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      break
    }
    case 'day': {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      value = days[new Date().getDay()]
      break
    }
    case 'uuid':
      value = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      break
    case 'selection':
      value = '[selected text]'
      break
    case 'argument':
      value = argumentName ? `[${argumentName}]` : '[input]'
      break
    case 'snippet':
      value = snippetRef ? `[${snippetRef}]` : '[snippet]'
      break
  }

  for (const mod of modifiers) {
    switch (mod) {
      case 'uppercase': value = value.toUpperCase(); break
      case 'lowercase': value = value.toLowerCase(); break
      case 'trim': value = value.trim(); break
      case 'percent-encode': value = encodeURIComponent(value); break
      case 'json-stringify': value = JSON.stringify(value); break
      case 'raw': break
    }
  }

  return value
}
