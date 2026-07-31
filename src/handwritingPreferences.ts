import type { HandwritingShape, HandwritingShapeLineStyle } from './questionNotes'

const HANDWRITING_PREFERENCES_KEY = 'npee:handwriting-preferences:v1'

interface HandwritingPreferencesStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export interface HandwritingPreferences {
  shape: HandwritingShape
  shapeLineStyle: HandwritingShapeLineStyle
  shapeFill: boolean
  shapeFillColor: string | null
  shapeFillOpacity: number
}

export const DEFAULT_HANDWRITING_PREFERENCES: HandwritingPreferences = {
  shape: 'line',
  shapeLineStyle: 'solid',
  shapeFill: false,
  shapeFillColor: null,
  shapeFillOpacity: .16,
}

const HANDWRITING_SHAPES = new Set<HandwritingShape>(['line', 'arrow', 'rectangle', 'ellipse', 'triangle'])
const HANDWRITING_LINE_STYLES = new Set<HandwritingShapeLineStyle>(['solid', 'dashed', 'dotted'])
const isHexColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

export function validateHandwritingPreferences(value: unknown): HandwritingPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_HANDWRITING_PREFERENCES }
  const candidate = value as Partial<HandwritingPreferences>
  return {
    shape: HANDWRITING_SHAPES.has(candidate.shape as HandwritingShape)
      ? candidate.shape as HandwritingShape
      : DEFAULT_HANDWRITING_PREFERENCES.shape,
    shapeLineStyle: HANDWRITING_LINE_STYLES.has(candidate.shapeLineStyle as HandwritingShapeLineStyle)
      ? candidate.shapeLineStyle as HandwritingShapeLineStyle
      : DEFAULT_HANDWRITING_PREFERENCES.shapeLineStyle,
    shapeFill: typeof candidate.shapeFill === 'boolean'
      ? candidate.shapeFill
      : DEFAULT_HANDWRITING_PREFERENCES.shapeFill,
    shapeFillColor: candidate.shapeFillColor === null || isHexColor(candidate.shapeFillColor)
      ? candidate.shapeFillColor
      : DEFAULT_HANDWRITING_PREFERENCES.shapeFillColor,
    shapeFillOpacity: typeof candidate.shapeFillOpacity === 'number' && Number.isFinite(candidate.shapeFillOpacity)
      ? Math.min(1, Math.max(0, candidate.shapeFillOpacity))
      : DEFAULT_HANDWRITING_PREFERENCES.shapeFillOpacity,
  }
}

const browserStorage = () => typeof window === 'undefined' ? null : window.localStorage

export function loadHandwritingPreferences(storage: HandwritingPreferencesStorage | null = browserStorage()): HandwritingPreferences {
  try {
    if (!storage) return { ...DEFAULT_HANDWRITING_PREFERENCES }
    return validateHandwritingPreferences(JSON.parse(storage.getItem(HANDWRITING_PREFERENCES_KEY) || 'null'))
  } catch {
    return { ...DEFAULT_HANDWRITING_PREFERENCES }
  }
}

export function saveHandwritingPreferences(preferences: HandwritingPreferences, storage: HandwritingPreferencesStorage | null = browserStorage()) {
  try {
    if (!storage) return false
    storage.setItem(HANDWRITING_PREFERENCES_KEY, JSON.stringify(validateHandwritingPreferences(preferences)))
    return true
  } catch {
    return false
  }
}
