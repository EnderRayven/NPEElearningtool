export type HandwritingClipboardSpace = 'normalized' | 'canvas'

export interface ClipboardPoint {
  x: number
  y: number
  pressure?: number
}

export interface ClipboardStroke {
  color: string
  points: ClipboardPoint[]
  size?: number
  input?: 'pen' | 'touch' | 'mouse'
}

export interface HandwritingClipboardData {
  space: HandwritingClipboardSpace
  strokes: ClipboardStroke[]
}

const CLIPBOARD_PREFIX = 'NPE_HANDWRITING_V1:'
let memoryClipboard: HandwritingClipboardData | null = null

function clone(data: HandwritingClipboardData): HandwritingClipboardData {
  return {
    space: data.space,
    strokes: data.strokes.map(stroke => ({
      color: stroke.color,
      ...(stroke.size === undefined ? {} : { size: stroke.size }),
      ...(stroke.input === undefined ? {} : { input: stroke.input }),
      points: stroke.points.map(point => ({ ...point })),
    })),
  }
}

function serialized(data: HandwritingClipboardData) {
  return `${CLIPBOARD_PREFIX}${JSON.stringify(data)}`
}

function parse(value: string) {
  if (!value.startsWith(CLIPBOARD_PREFIX)) return null
  try {
    const data = JSON.parse(value.slice(CLIPBOARD_PREFIX.length)) as Partial<HandwritingClipboardData>
    if (data.space !== 'normalized' && data.space !== 'canvas') return null
    if (!Array.isArray(data.strokes) || !data.strokes.length) return null
    const strokes = data.strokes.flatMap(stroke => {
      if (!stroke || typeof stroke.color !== 'string' || !Array.isArray(stroke.points)) return []
      const points = stroke.points.filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y)).map(point => ({ ...point }))
      return points.length ? [{ ...stroke, points }] : []
    })
    return strokes.length ? { space: data.space, strokes } : null
  } catch {
    return null
  }
}

export function copyHandwritingStrokes(strokes: ClipboardStroke[], space: HandwritingClipboardSpace) {
  if (!strokes.length) return
  const data = { space, strokes }
  memoryClipboard = clone(data)
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(serialized(data)).catch(() => undefined)
  }
}

export async function readHandwritingStrokes() {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
    try {
      const data = parse(await navigator.clipboard.readText())
      if (data) return data
    } catch {
      // The in-memory clipboard still supports copy/paste when browser
      // clipboard permissions are unavailable.
    }
  }
  return memoryClipboard ? clone(memoryClipboard) : null
}
