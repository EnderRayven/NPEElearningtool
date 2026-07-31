import { describe, expect, it } from 'vitest'
import { DEFAULT_HANDWRITING_PREFERENCES, loadHandwritingPreferences, saveHandwritingPreferences, validateHandwritingPreferences } from './handwritingPreferences'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  clear() { this.values.clear() }
}

describe('handwritingPreferences', () => {
  it('remembers the last shape appearance settings', () => {
    const storage = new MemoryStorage()
    expect(saveHandwritingPreferences({
      shape: 'rectangle',
      shapeLineStyle: 'dashed',
      shapeFill: true,
      shapeFillColor: '#d8aaa5',
      shapeFillOpacity: .42,
    }, storage)).toBe(true)

    expect(loadHandwritingPreferences(storage)).toEqual({
      shape: 'rectangle',
      shapeLineStyle: 'dashed',
      shapeFill: true,
      shapeFillColor: '#d8aaa5',
      shapeFillOpacity: .42,
    })
  })

  it('repairs invalid saved values without losing valid preferences', () => {
    expect(validateHandwritingPreferences({
      shape: 'triangle',
      shapeLineStyle: 'invalid',
      shapeFill: true,
      shapeFillColor: 'red',
      shapeFillOpacity: 4,
    })).toEqual({
      ...DEFAULT_HANDWRITING_PREFERENCES,
      shape: 'triangle',
      shapeFill: true,
      shapeFillOpacity: 1,
    })
  })

  it('falls back safely when saved data is malformed', () => {
    const storage = new MemoryStorage()
    storage.setItem('npee:handwriting-preferences:v1', '{broken')
    expect(loadHandwritingPreferences(storage)).toEqual(DEFAULT_HANDWRITING_PREFERENCES)
  })
})
