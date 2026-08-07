import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MARKDOWN_SHORTCUTS,
  formatShortcut,
  matchesShortcut,
  resolveMarkdownShortcutSettings,
  shortcutFromKeyboardEvent,
} from './shortcutSettings'

describe('shortcutSettings', () => {
  it('resolves incomplete settings back to safe defaults', () => {
    const settings = resolveMarkdownShortcutSettings({ bold: { primary: true, key: 'j' } })

    expect(settings.bold).toEqual({ primary: true, shift: false, alt: false, key: 'J' })
    expect(settings.italic).toEqual(DEFAULT_MARKDOWN_SHORTCUTS.italic)
  })

  it('formats and matches platform modifier shortcuts', () => {
    const event = { key: 'j', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false } as KeyboardEvent
    const binding = { primary: true, shift: false, alt: false, key: 'J' }

    expect(formatShortcut(binding)).toBe('⌘/Ctrl+J')
    expect(matchesShortcut(event, binding)).toBe(true)
    expect(shortcutFromKeyboardEvent(event)).toEqual(binding)
  })
})
