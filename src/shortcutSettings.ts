export type MarkdownShortcutAction = 'bold' | 'italic' | 'inlineCode' | 'orderedList' | 'bulletList'

export interface ShortcutBinding {
  primary: boolean
  shift: boolean
  alt: boolean
  key: string
}

export type MarkdownShortcutSettings = Record<MarkdownShortcutAction, ShortcutBinding>

export const DEFAULT_MARKDOWN_SHORTCUTS: MarkdownShortcutSettings = {
  bold: { primary: true, shift: false, alt: false, key: 'B' },
  italic: { primary: true, shift: false, alt: false, key: 'I' },
  inlineCode: { primary: true, shift: false, alt: false, key: 'E' },
  orderedList: { primary: true, shift: false, alt: true, key: '7' },
  bulletList: { primary: true, shift: false, alt: true, key: '8' },
}

export const MARKDOWN_SHORTCUT_ACTIONS: Array<{ id: MarkdownShortcutAction; label: string }> = [
  { id: 'bold', label: '粗体' },
  { id: 'italic', label: '斜体' },
  { id: 'inlineCode', label: '行内代码' },
  { id: 'orderedList', label: '有序列表' },
  { id: 'bulletList', label: '无序列表' },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeKey(value: unknown) {
  return typeof value === 'string' && value.length > 0 && value.length <= 12 ? value.toUpperCase() : ''
}

function validateBinding(value: unknown, fallback: ShortcutBinding): ShortcutBinding {
  if (!isRecord(value)) return { ...fallback }
  const key = normalizeKey(value.key)
  if (!key) return { ...fallback }
  return {
    primary: value.primary === true,
    shift: value.shift === true,
    alt: value.alt === true,
    key,
  }
}

export function validateMarkdownShortcutSettings(value: unknown): MarkdownShortcutSettings {
  const source = isRecord(value) ? value : {}
  return MARKDOWN_SHORTCUT_ACTIONS.reduce((settings, action) => {
    settings[action.id] = validateBinding(source[action.id], DEFAULT_MARKDOWN_SHORTCUTS[action.id])
    return settings
  }, {} as MarkdownShortcutSettings)
}

export function resolveMarkdownShortcutSettings(value?: unknown): MarkdownShortcutSettings {
  return value === undefined ? validateMarkdownShortcutSettings(DEFAULT_MARKDOWN_SHORTCUTS) : validateMarkdownShortcutSettings(value)
}

export function sameShortcut(left: ShortcutBinding, right: ShortcutBinding) {
  return left.primary === right.primary && left.shift === right.shift && left.alt === right.alt && left.key === right.key
}

export function formatShortcut(binding: ShortcutBinding) {
  const parts = [
    binding.primary ? '⌘/Ctrl' : '',
    binding.alt ? '⌥/Alt' : '',
    binding.shift ? 'Shift' : '',
    binding.key,
  ].filter(Boolean)
  return parts.join('+')
}

export function shortcutFromKeyboardEvent(event: KeyboardEvent): ShortcutBinding | null {
  if (event.key === 'Escape' || ['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) return null
  const key = normalizeKey(event.key)
  if (!key || (!event.metaKey && !event.ctrlKey && !event.altKey)) return null
  return { primary: event.metaKey || event.ctrlKey, shift: event.shiftKey, alt: event.altKey, key }
}

export function matchesShortcut(event: KeyboardEvent, binding: ShortcutBinding) {
  const key = normalizeKey(event.key)
  return key === binding.key
    && (event.metaKey || event.ctrlKey) === binding.primary
    && event.shiftKey === binding.shift
    && event.altKey === binding.alt
}
