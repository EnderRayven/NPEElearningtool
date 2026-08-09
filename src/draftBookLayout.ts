import type { DraftBookIconAnchor, DraftBookPoint } from './draftBook'

export const DRAFT_BOOK_FAB_SIZE = 54
export const DEFAULT_DRAFT_BOOK_ICON_ANCHOR: DraftBookIconAnchor = {
  horizontal: 'right',
  vertical: 'bottom',
  horizontalOffset: 20,
  verticalOffset: 104,
}

const LEGACY_EDGE_THRESHOLD = 144

export interface DraftBookViewport {
  width: number
  height: number
}

function draftBookFabSize(viewport: DraftBookViewport) {
  return viewport.width <= 560 ? 49 : DRAFT_BOOK_FAB_SIZE
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

function iconBounds(viewport: DraftBookViewport) {
  const fabSize = draftBookFabSize(viewport)
  return {
    minX: 20,
    maxX: Math.max(20, viewport.width - fabSize - 20),
    minY: 20,
    maxY: Math.max(20, viewport.height - fabSize - 20),
  }
}

export function clampDraftBookIconPosition(position: DraftBookPoint, viewport: DraftBookViewport) {
  const bounds = iconBounds(viewport)
  return {
    x: clamp(position.x, bounds.minX, bounds.maxX),
    y: clamp(position.y, bounds.minY, bounds.maxY),
  }
}

export function draftBookIconPositionFromAnchor(anchor: DraftBookIconAnchor, viewport: DraftBookViewport) {
  const fabSize = draftBookFabSize(viewport)
  const position = {
    x: anchor.horizontal === 'left'
      ? anchor.horizontalOffset
      : viewport.width - fabSize - anchor.horizontalOffset,
    y: anchor.vertical === 'top'
      ? anchor.verticalOffset
      : viewport.height - fabSize - anchor.verticalOffset,
  }
  return clampDraftBookIconPosition(position, viewport)
}

export function draftBookIconAnchorFromPosition(position: DraftBookPoint, viewport: DraftBookViewport): DraftBookIconAnchor {
  const clamped = clampDraftBookIconPosition(position, viewport)
  const fabSize = draftBookFabSize(viewport)
  const rightOffset = Math.max(0, viewport.width - fabSize - clamped.x)
  const bottomOffset = Math.max(0, viewport.height - fabSize - clamped.y)
  return {
    horizontal: clamped.x <= rightOffset ? 'left' : 'right',
    vertical: clamped.y <= bottomOffset ? 'top' : 'bottom',
    horizontalOffset: Math.min(clamped.x, rightOffset),
    verticalOffset: Math.min(clamped.y, bottomOffset),
  }
}

function legacyAxisAnchor(startOffset: number, endOffset: number, fallbackEdge: 'left' | 'right' | 'top' | 'bottom', fallbackOffset: number) {
  if (Math.min(startOffset, endOffset) > LEGACY_EDGE_THRESHOLD) {
    return { edge: fallbackEdge, offset: fallbackOffset }
  }
  return startOffset <= endOffset
    ? { edge: fallbackEdge === 'left' || fallbackEdge === 'right' ? 'left' : 'top', offset: startOffset }
    : { edge: fallbackEdge === 'left' || fallbackEdge === 'right' ? 'right' : 'bottom', offset: endOffset }
}

/**
 * Older releases only stored left/top pixels. Treat distant legacy positions as
 * stale viewport coordinates and use the unobtrusive bottom-right default once.
 */
export function migrateLegacyDraftBookIconAnchor(position: DraftBookPoint, viewport: DraftBookViewport): DraftBookIconAnchor {
  if (position.x < 0 || position.y < 0) return { ...DEFAULT_DRAFT_BOOK_ICON_ANCHOR }
  const clamped = clampDraftBookIconPosition(position, viewport)
  const fabSize = draftBookFabSize(viewport)
  const rightOffset = Math.max(0, viewport.width - fabSize - clamped.x)
  const bottomOffset = Math.max(0, viewport.height - fabSize - clamped.y)
  const horizontal = legacyAxisAnchor(clamped.x, rightOffset, 'right', DEFAULT_DRAFT_BOOK_ICON_ANCHOR.horizontalOffset)
  const vertical = legacyAxisAnchor(clamped.y, bottomOffset, 'bottom', DEFAULT_DRAFT_BOOK_ICON_ANCHOR.verticalOffset)
  return {
    horizontal: horizontal.edge as DraftBookIconAnchor['horizontal'],
    vertical: vertical.edge as DraftBookIconAnchor['vertical'],
    horizontalOffset: horizontal.offset,
    verticalOffset: vertical.offset,
  }
}
