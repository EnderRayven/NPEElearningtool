import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ChevronDown, Circle, Eraser, Lasso, Maximize2, Minus, MoveUpRight, NotebookPen, Pencil, Redo2, Shapes, Square, Trash2, Triangle, Undo2, X } from 'lucide-react'
import { DRAWING_BASE_HEIGHT, DRAWING_WIDTH, MAX_DRAWING_HEIGHT, emptyHandwritingDrawing, emptyQuestionNote, eraseHandwritingStrokes, hasQuestionNote, type HandwritingDrawing, type HandwritingPoint, type HandwritingShape, type HandwritingShapeLineStyle, type HandwritingStroke, type QuestionNote } from './questionNotes'
import ConfirmDialog from './ConfirmDialog'
import LassoDeleteIcon from './LassoDeleteIcon'
import { copyHandwritingStrokes, readHandwritingStrokes } from './handwritingClipboard'
import { loadHandwritingPreferences, saveHandwritingPreferences, type HandwritingPreferences } from './handwritingPreferences'

interface QuestionNotePanelProps {
  questionId: string
  note?: QuestionNote
  onChange: (note: QuestionNote) => void
  initialOpen?: boolean
}

type CanvasTrimIntent = 'defer'

interface HandwritingCanvasProps {
  drawing: HandwritingDrawing
  tool: HandwritingTool
  shape: HandwritingShape
  shapeLineStyle: HandwritingShapeLineStyle
  shapeFill: boolean
  shapeFillColor: string
  shapeFillOpacity: number
  color: string
  size: number
  expanded?: boolean
  selectedStrokeIds: string[]
  onCommit: (drawing: HandwritingDrawing, canvasTrimIntent?: CanvasTrimIntent) => void
  onSelectionChange: (strokeIds: string[]) => void
  onDeleteSelection: () => void
  interactionActiveRef: MutableRefObject<boolean>
}

type HandwritingTool = 'pen' | 'eraser' | 'lasso' | 'space' | 'shape'
export type { HandwritingShape } from './questionNotes'
type SelectionHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type HandwritingInteraction = HandwritingTool | 'move' | 'scale'

const newStrokeId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `stroke-${Date.now()}-${Math.random().toString(36).slice(2)}`
const pointDistance = (left: HandwritingPoint, right: HandwritingPoint) => Math.hypot(left.x - right.x, left.y - right.y)
const EMPTY_NOTE = emptyQuestionNote()
const COMMON_INK_COLORS = [
  { value: '#2f2b28', label: '黑色' },
  { value: '#6f6a65', label: '灰色' },
  { value: '#8f3028', label: '砖红' },
  { value: '#d06432', label: '橙色' },
  { value: '#d39a22', label: '黄色' },
  { value: '#39805d', label: '绿色' },
  { value: '#3474a7', label: '蓝色' },
  { value: '#765b9e', label: '紫色' },
]
const INK_WIDTH_LEVELS = [.44, .59, .74, .89, 1.04, 1.19, 1.34, 1.49, 1.64]
const drawingPoint = (point: HandwritingPoint) => ({ x: point.x * DRAWING_WIDTH, y: point.y * DRAWING_BASE_HEIGHT })
const midpoint = (left: HandwritingPoint, right: HandwritingPoint) => ({
  x: (left.x + right.x) * 500,
  y: (left.y + right.y) * 300,
})
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))
const AUTO_EXTEND_TRIGGER = 72
const AUTO_EXTEND_STEP = 300
const MIN_SPACE_ADJUSTMENT = .04
const MIN_STROKE_POINT_DISTANCE = .001
const MIN_SHAPE_DRAG_DISTANCE = 6
const SHAPE_INK_WIDTH_FACTOR = 1.34
const LINE_SNAP_ANGLE_DEGREES = 7
const LINE_SNAP_RELEASE_DEGREES = 12
const LINE_SNAP_STAY_MS = 350
const LINE_SNAP_STABILITY_DISTANCE = 5

export function handwritingToolForShortcut(
  key: string,
  options: { repeat?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean } = {},
): HandwritingTool | null {
  if (options.repeat || options.metaKey || options.ctrlKey || options.altKey) return null
  const shortcutTools: Record<string, HandwritingTool> = {
    '1': 'eraser',
    '2': 'pen',
    '3': 'lasso',
    '4': 'space',
    '5': 'shape',
  }
  return shortcutTools[key] || null
}

export const shouldResetCanvasForDrawingChange = (activePointerId: number | null) => activePointerId === null

const canvasPoint = (point: HandwritingPoint) => ({ x: point.x * DRAWING_WIDTH, y: point.y * DRAWING_BASE_HEIGHT })
const normalizedPoint = (point: { x: number; y: number }): HandwritingPoint => ({ x: point.x / DRAWING_WIDTH, y: point.y / DRAWING_BASE_HEIGHT, pressure: .5 })

export type LineSnapAxis = 'horizontal' | 'vertical'

export function lineSnapAxisForPoints(start: HandwritingPoint, end: HandwritingPoint, toleranceDegrees = LINE_SNAP_ANGLE_DEGREES): LineSnapAxis | null {
  const startCanvas = canvasPoint(start)
  const endCanvas = canvasPoint(end)
  const dx = endCanvas.x - startCanvas.x
  const dy = endCanvas.y - startCanvas.y
  const length = Math.hypot(dx, dy)
  if (length < MIN_SHAPE_DRAG_DISTANCE) return null
  const tolerance = Math.sin(toleranceDegrees * Math.PI / 180)
  if (Math.abs(dy) / length <= tolerance) return 'horizontal'
  if (Math.abs(dx) / length <= tolerance) return 'vertical'
  return null
}

export function snapLineEndPoint(start: HandwritingPoint, end: HandwritingPoint, axis: LineSnapAxis): HandwritingPoint {
  return axis === 'horizontal'
    ? { ...end, y: start.y }
    : { ...end, x: start.x }
}

export function handwritingPointFromClientDelta(
  anchorPoint: HandwritingPoint,
  anchorClient: { x: number; y: number },
  client: { x: number; y: number },
  canvasCssWidth: number,
): HandwritingPoint {
  const safeWidth = Math.max(1, canvasCssWidth)
  return {
    ...anchorPoint,
    x: clamp(anchorPoint.x + (client.x - anchorClient.x) / safeWidth, 0, 1),
    y: Math.max(0, anchorPoint.y + (client.y - anchorClient.y) * DRAWING_WIDTH / safeWidth / DRAWING_BASE_HEIGHT),
  }
}

interface ShapeStrokeStyle {
  ids?: string[]
  color: string
  size: number
  input: HandwritingStroke['input']
  lineStyle?: HandwritingShapeLineStyle
  fill?: boolean
  fillColor?: string
  fillOpacity?: number
}

/**
 * Shapes are stored as ordinary handwriting strokes so existing selection,
 * persistence, clipboard and export code can keep using the same data model.
 */
export function createShapeStrokes(shape: HandwritingShape, start: HandwritingPoint, end: HandwritingPoint, style: ShapeStrokeStyle): HandwritingStroke[] {
  const startCanvas = canvasPoint(start)
  const endCanvas = canvasPoint(end)
  const stroke = (points: HandwritingPoint[]): HandwritingStroke => ({
    id: style.ids?.[0] || newStrokeId(),
    color: style.color,
    size: style.size,
    input: style.input,
    points,
    shape,
    ...(style.lineStyle && style.lineStyle !== 'solid' ? { shapeLineStyle: style.lineStyle } : {}),
    ...(style.fill && shape !== 'line' && shape !== 'arrow' ? { shapeFill: true } : {}),
    ...(style.fill && style.fillColor && shape !== 'line' && shape !== 'arrow' ? { shapeFillColor: style.fillColor } : {}),
    ...(style.fill && style.fillOpacity !== undefined && shape !== 'line' && shape !== 'arrow' ? { shapeFillOpacity: clamp(style.fillOpacity, 0, 1) } : {}),
  })
  const normalizedPoints = (points: Array<{ x: number; y: number }>) => points.map(normalizedPoint)

  if (shape === 'line') return [stroke(normalizedPoints([startCanvas, endCanvas]))]

  if (shape === 'arrow') {
    const dx = endCanvas.x - startCanvas.x
    const dy = endCanvas.y - startCanvas.y
    const length = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)
    const headLength = clamp(length * .22, 18, 42)
    const left = {
      x: endCanvas.x + Math.cos(angle + Math.PI - Math.PI / 6) * headLength,
      y: endCanvas.y + Math.sin(angle + Math.PI - Math.PI / 6) * headLength,
    }
    const right = {
      x: endCanvas.x + Math.cos(angle + Math.PI + Math.PI / 6) * headLength,
      y: endCanvas.y + Math.sin(angle + Math.PI + Math.PI / 6) * headLength,
    }
    return [stroke(normalizedPoints([startCanvas, endCanvas, left, endCanvas, right]))]
  }

  const left = Math.min(startCanvas.x, endCanvas.x)
  const right = Math.max(startCanvas.x, endCanvas.x)
  const top = Math.min(startCanvas.y, endCanvas.y)
  const bottom = Math.max(startCanvas.y, endCanvas.y)
  if (shape === 'rectangle') {
    const topLeft = { x: left, y: top }
    const topRight = { x: right, y: top }
    const bottomRight = { x: right, y: bottom }
    const bottomLeft = { x: left, y: bottom }
    return [stroke(normalizedPoints([topLeft, topRight, bottomRight, bottomLeft, topLeft]))]
  }
  if (shape === 'triangle') {
    const topCenter = { x: (left + right) / 2, y: top }
    const bottomRight = { x: right, y: bottom }
    const bottomLeft = { x: left, y: bottom }
    return [stroke(normalizedPoints([topCenter, bottomRight, bottomLeft, topCenter]))]
  }

  const center = { x: (left + right) / 2, y: (top + bottom) / 2 }
  const radiusX = (right - left) / 2
  const radiusY = (bottom - top) / 2
  const points = Array.from({ length: 65 }, (_, index) => {
    const angle = index / 64 * Math.PI * 2
    return normalizedPoint({
      x: center.x + Math.cos(angle) * radiusX,
      y: center.y + Math.sin(angle) * radiusY,
    })
  })
  return [stroke(points)]
}

export const canvasHeightForStrokes = (strokes: HandwritingStroke[]) => {
  const highestPoint = strokes.reduce((highest, stroke) => Math.max(highest, ...stroke.points.map(point => point.y * DRAWING_BASE_HEIGHT)), 0)
  return Math.min(MAX_DRAWING_HEIGHT, Math.max(DRAWING_BASE_HEIGHT, highestPoint + AUTO_EXTEND_TRIGGER))
}

export const autoExtendedCanvasHeight = (currentHeight: number, contentBottomY: number) => {
  let nextHeight = currentHeight
  while (contentBottomY > nextHeight - AUTO_EXTEND_TRIGGER && nextHeight < MAX_DRAWING_HEIGHT) {
    nextHeight = Math.min(MAX_DRAWING_HEIGHT, nextHeight + AUTO_EXTEND_STEP)
  }
  return nextHeight
}

export const canvasHeightForMovingSelection = (currentHeight: number, selectionBottom: number, requestedDy: number) =>
  requestedDy > 0
    ? autoExtendedCanvasHeight(currentHeight, (selectionBottom + requestedDy) * DRAWING_BASE_HEIGHT)
    : currentHeight

export const canvasHeightForDrawing = (drawing: HandwritingDrawing) => {
  const storedHeight = DRAWING_WIDTH / Math.max(.001, drawing.aspectRatio)
  return Math.min(MAX_DRAWING_HEIGHT, Math.max(canvasHeightForStrokes(drawing.strokes), storedHeight))
}

export const croppedCanvasHeightForDrawing = (drawing: HandwritingDrawing, bottomSafety = 56, minimumHeight = 112) => {
  const points = drawing.strokes.flatMap(stroke => stroke.points)
  if (!points.length) return 0
  const lowestInkY = Math.max(...points.map(point => point.y * DRAWING_BASE_HEIGHT))
  return Math.min(canvasHeightForDrawing(drawing), Math.max(minimumHeight, lowestInkY + bottomSafety))
}

const aspectRatioForCanvasHeight = (height: number) => DRAWING_WIDTH / clamp(height, DRAWING_BASE_HEIGHT, MAX_DRAWING_HEIGHT)

const shiftStrokesAfter = (strokes: HandwritingStroke[], y: number, amount: number) => strokes.map(stroke => {
  if (!stroke.points.length || Math.min(...stroke.points.map(point => point.y)) < y) return stroke
  return { ...stroke, points: stroke.points.map(point => ({ ...point, y: point.y + amount })) }
})

export const insertSpaceIntoStrokes = (strokes: HandwritingStroke[], y: number, amount: number) => shiftStrokesAfter(strokes, y, amount)

/**
 * Keep a space adjustment inside the drawable canvas. A negative adjustment
 * removes space by moving the strokes below the line upward, while keeping
 * strokes above the line and the canvas itself from being clipped.
 */
export const clampSpaceAdjustment = (strokes: HandwritingStroke[], y: number, requestedAmount: number, currentHeight: number) => {
  const currentHeightUnits = Math.max(1, currentHeight / DRAWING_BASE_HEIGHT)
  const trailingMargin = AUTO_EXTEND_TRIGGER / DRAWING_BASE_HEIGHT
  const movingStrokes = strokes.filter(stroke => stroke.points.length && Math.min(...stroke.points.map(point => point.y)) >= y)
  const stationaryStrokes = strokes.filter(stroke => stroke.points.length && Math.min(...stroke.points.map(point => point.y)) < y)
  const minimumMovingY = movingStrokes.length
    ? Math.min(...movingStrokes.flatMap(stroke => stroke.points.map(point => point.y)))
    : Number.NEGATIVE_INFINITY
  const maximumStationaryY = stationaryStrokes.length
    ? Math.max(...stationaryStrokes.flatMap(stroke => stroke.points.map(point => point.y)))
    : Number.NEGATIVE_INFINITY
  const minimumAmount = Math.max(
    1 - currentHeightUnits,
    Number.isFinite(minimumMovingY) ? -minimumMovingY : Number.NEGATIVE_INFINITY,
    Number.isFinite(maximumStationaryY) ? maximumStationaryY + trailingMargin - currentHeightUnits : Number.NEGATIVE_INFINITY,
  )
  const maximumAmount = MAX_DRAWING_HEIGHT / DRAWING_BASE_HEIGHT - currentHeightUnits
  return clamp(requestedAmount, minimumAmount, maximumAmount)
}

export interface SelectionBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function selectionHandlePointsForBounds(bounds: SelectionBounds): Array<{ handle: SelectionHandle; x: number; y: number }> {
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2
  return [
    { handle: 'nw', x: bounds.minX, y: bounds.minY },
    { handle: 'n', x: centerX, y: bounds.minY },
    { handle: 'ne', x: bounds.maxX, y: bounds.minY },
    { handle: 'e', x: bounds.maxX, y: centerY },
    { handle: 'se', x: bounds.maxX, y: bounds.maxY },
    { handle: 's', x: centerX, y: bounds.maxY },
    { handle: 'sw', x: bounds.minX, y: bounds.maxY },
    { handle: 'w', x: bounds.minX, y: centerY },
  ]
}

const selectionBoundsForStrokes = (strokes: HandwritingStroke[]): SelectionBounds | null => {
  const points = strokes.flatMap(stroke => stroke.points)
  if (!points.length) return null
  return {
    minX: Math.min(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y)),
    maxX: Math.max(...points.map(point => point.x)),
    maxY: Math.max(...points.map(point => point.y)),
  }
}

const expandSelectionBounds = (bounds: SelectionBounds, padding = .014, maxY = Number.POSITIVE_INFINITY): SelectionBounds => ({
  minX: clamp(bounds.minX - padding, 0, 1),
  minY: Math.max(0, bounds.minY - padding),
  maxX: clamp(bounds.maxX + padding, 0, 1),
  maxY: Math.min(maxY, bounds.maxY + padding),
})

const pointInBounds = (point: HandwritingPoint, bounds: SelectionBounds) =>
  point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY

const cross = (left: HandwritingPoint, right: HandwritingPoint, point: HandwritingPoint) =>
  (right.x - left.x) * (point.y - left.y) - (right.y - left.y) * (point.x - left.x)

const segmentsIntersect = (firstStart: HandwritingPoint, firstEnd: HandwritingPoint, secondStart: HandwritingPoint, secondEnd: HandwritingPoint) => {
  const firstA = cross(firstStart, firstEnd, secondStart)
  const firstB = cross(firstStart, firstEnd, secondEnd)
  const secondA = cross(secondStart, secondEnd, firstStart)
  const secondB = cross(secondStart, secondEnd, firstEnd)
  const epsilon = .000001
  const onFirst = Math.abs(firstA) <= epsilon && Math.min(firstStart.x, firstEnd.x) - epsilon <= secondStart.x && secondStart.x <= Math.max(firstStart.x, firstEnd.x) + epsilon && Math.min(firstStart.y, firstEnd.y) - epsilon <= secondStart.y && secondStart.y <= Math.max(firstStart.y, firstEnd.y) + epsilon
  const onSecond = Math.abs(firstB) <= epsilon && Math.min(firstStart.x, firstEnd.x) - epsilon <= secondEnd.x && secondEnd.x <= Math.max(firstStart.x, firstEnd.x) + epsilon && Math.min(firstStart.y, firstEnd.y) - epsilon <= secondEnd.y && secondEnd.y <= Math.max(firstStart.y, firstEnd.y) + epsilon
  const onThird = Math.abs(secondA) <= epsilon && Math.min(secondStart.x, secondEnd.x) - epsilon <= firstStart.x && firstStart.x <= Math.max(secondStart.x, secondEnd.x) + epsilon && Math.min(secondStart.y, secondEnd.y) - epsilon <= firstStart.y && firstStart.y <= Math.max(secondStart.y, secondEnd.y) + epsilon
  const onFourth = Math.abs(secondB) <= epsilon && Math.min(secondStart.x, secondEnd.x) - epsilon <= firstEnd.x && firstEnd.x <= Math.max(secondStart.x, secondEnd.x) + epsilon && Math.min(secondStart.y, secondEnd.y) - epsilon <= firstEnd.y && firstEnd.y <= Math.max(secondStart.y, secondEnd.y) + epsilon
  return (firstA > epsilon && firstB < -epsilon || firstA < -epsilon && firstB > epsilon) && (secondA > epsilon && secondB < -epsilon || secondA < -epsilon && secondB > epsilon) || onFirst || onSecond || onThird || onFourth
}

const pointInPolygon = (point: HandwritingPoint, polygon: HandwritingPoint[]) => {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index]
    const previousPoint = polygon[previous]
    if ((currentPoint.y > point.y) !== (previousPoint.y > point.y) && point.x < (previousPoint.x - currentPoint.x) * (point.y - currentPoint.y) / (previousPoint.y - currentPoint.y) + currentPoint.x) inside = !inside
  }
  return inside
}

export function strokeIsInsideLasso(stroke: HandwritingStroke, polygon: HandwritingPoint[]) {
  if (polygon.length < 3 || !stroke.points.length) return false
  if (stroke.points.some(point => pointInPolygon(point, polygon))) return true
  return stroke.points.some((point, index) => {
    if (index === 0) return false
    return polygon.some((polygonPoint, polygonIndex) => segmentsIntersect(point, stroke.points[index - 1], polygonPoint, polygon[(polygonIndex + 1) % polygon.length]))
  })
}

const translateStrokes = (strokes: HandwritingStroke[], selectedIds: Set<string>, dx: number, dy: number) =>
  strokes.map(stroke => selectedIds.has(stroke.id)
    ? { ...stroke, points: stroke.points.map(point => ({ ...point, x: point.x + dx, y: point.y + dy })) }
    : stroke)

export const updateSelectedStrokeSize = (strokes: HandwritingStroke[], selectedIds: string[], size: number) => {
  const selected = new Set(selectedIds)
  return strokes.map(stroke => selected.has(stroke.id) ? { ...stroke, size } : stroke)
}

const fitSelectedStrokesToCanvas = (strokes: HandwritingStroke[], selectedIds: Set<string>, maxY: number) => {
  const selectedBounds = selectionBoundsForStrokes(strokes.filter(stroke => selectedIds.has(stroke.id)))
  if (!selectedBounds) return strokes
  const dx = selectedBounds.minX < 0 ? -selectedBounds.minX : selectedBounds.maxX > 1 ? 1 - selectedBounds.maxX : 0
  const dy = selectedBounds.minY < 0 ? -selectedBounds.minY : selectedBounds.maxY > maxY ? maxY - selectedBounds.maxY : 0
  return translateStrokes(strokes, selectedIds, dx, dy).map(stroke => selectedIds.has(stroke.id)
    ? { ...stroke, points: stroke.points.map(point => ({ ...point, x: clamp(point.x, 0, 1), y: Math.max(0, point.y) })) }
    : stroke)
}

const scaleStrokes = (strokes: HandwritingStroke[], selectedIds: Set<string>, anchor: HandwritingPoint, scaleX: number, scaleY: number, maxY: number) =>
  fitSelectedStrokesToCanvas(strokes.map(stroke => selectedIds.has(stroke.id)
    ? { ...stroke, points: stroke.points.map(point => ({ ...point, x: anchor.x + (point.x - anchor.x) * scaleX, y: anchor.y + (point.y - anchor.y) * scaleY })) }
    : stroke), selectedIds, maxY)

function widthFactorForStrokePoint(stroke: HandwritingStroke, index: number) {
  const lastIndex = stroke.points.length - 1
  const point = stroke.points[index]
  const previous = stroke.points[Math.max(0, index - 1)]
  const next = stroke.points[Math.min(lastIndex, index + 1)]
  const distance = Math.hypot(next.x - previous.x, next.y - previous.y)
  const simulatedPressure = Math.min(.78, Math.max(.28, .82 - distance * 9))
  const recordedPressure = point.pressure ?? .5
  const pressure = stroke.input === 'pen' ? recordedPressure : simulatedPressure
  const taper = Math.min(1, .45 + Math.min(index, lastIndex - index) * .28)
  return (stroke.input === 'pen' ? .42 + pressure * 1.18 : .5 + pressure) * taper
}

export function pathsForStroke(stroke: HandwritingStroke) {
  if (stroke.points.length < 2) {
    const point = drawingPoint(stroke.points[0])
    return [{ d: `M ${point.x} ${point.y} l .01 0`, width: stroke.size }]
  }
  if (stroke.shape) {
    const points = stroke.points.map(drawingPoint)
    const d = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
    const dashArray = stroke.shapeLineStyle === 'dashed'
      ? '16 11'
      : stroke.shapeLineStyle === 'dotted'
        ? '2 9'
        : undefined
    const canFill = stroke.shape === 'rectangle' || stroke.shape === 'ellipse' || stroke.shape === 'triangle'
    return [{
      d,
      width: stroke.size * SHAPE_INK_WIDTH_FACTOR,
      ...(dashArray ? { dashArray } : {}),
      ...(canFill && stroke.shapeFill ? {
        fill: stroke.shapeFillColor || stroke.color,
        fillOpacity: stroke.shapeFillOpacity ?? .16,
      } : {}),
    }]
  }
  const paths = INK_WIDTH_LEVELS.map(() => '')
  const lastIndex = stroke.points.length - 1
  for (let index = 0; index <= lastIndex; index++) {
    const point = stroke.points[index]
    const previous = stroke.points[Math.max(0, index - 1)]
    const next = stroke.points[Math.min(lastIndex, index + 1)]
    const start = index === 0 ? drawingPoint(point) : midpoint(previous, point)
    const end = index === lastIndex ? drawingPoint(point) : midpoint(point, next)
    const control = drawingPoint(point)
    const widthFactor = widthFactorForStrokePoint(stroke, index)
    const level = INK_WIDTH_LEVELS.reduce((best, value, levelIndex) =>
      Math.abs(value - widthFactor) < Math.abs(INK_WIDTH_LEVELS[best] - widthFactor) ? levelIndex : best, 0)
    paths[level] += `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y} `
  }
  return paths.map((d, index) => ({ d, width: stroke.size * INK_WIDTH_LEVELS[index] })).filter(path => path.d)
}

interface StrokeLayerProps {
  strokes: HandwritingStroke[]
  selectedStrokeIds: string[]
}

/**
 * Historical strokes are unchanged while a new stroke is being drawn. Keep
 * them in a memoized layer so pointermove only updates the active stroke.
 */
const StrokeLayer = memo(function StrokeLayer({ strokes, selectedStrokeIds }: StrokeLayerProps) {
  return <>{strokes.flatMap(stroke => pathsForStroke(stroke).flatMap((path, index) => [
    selectedStrokeIds.includes(stroke.id) && <path key={`${stroke.id}-selected-${index}`} d={path.d} fill="none" stroke="#bf8179" strokeWidth={path.width + 5} strokeLinecap="round" strokeLinejoin="round" opacity=".32" vectorEffect="non-scaling-stroke"/>,
    <path key={`${stroke.id}-${index}`} d={path.d} fill={path.fill || 'none'} fillOpacity={path.fillOpacity} stroke={stroke.color} strokeWidth={path.width} strokeDasharray={path.dashArray} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>,
  ]))}</>
})

export type HandwritingHistoryAction = 'undo' | 'redo'

export const historyActionForShortcut = (key: string, hasPrimaryModifier: boolean, shiftKey: boolean, altKey: boolean): HandwritingHistoryAction | null => {
  if (!hasPrimaryModifier || altKey) return null
  const normalizedKey = key.toLowerCase()
  if (normalizedKey === 'y' || (normalizedKey === 'z' && shiftKey)) return 'redo'
  if (normalizedKey === 'z') return 'undo'
  return null
}

interface TransformState {
  interaction: 'move' | 'scale'
  startPoint: HandwritingPoint
  startBounds: SelectionBounds
  baseStrokes: HandwritingStroke[]
  selectedIds: Set<string>
  handle?: SelectionHandle
}

interface SpacePointerBounds {
  left: number
  top: number
  width: number
  height: number
}

function HandwritingCanvas({ drawing, tool, shape, shapeLineStyle, shapeFill, shapeFillColor, shapeFillOpacity, color, size, expanded, selectedStrokeIds, onCommit, onSelectionChange, onDeleteSelection, interactionActiveRef }: HandwritingCanvasProps) {
  const [currentStroke, setCurrentStroke] = useState<HandwritingStroke | null>(null)
  const [shapePreview, setShapePreview] = useState<HandwritingStroke[]>([])
  const [erasingStrokes, setErasingStrokes] = useState<HandwritingStroke[] | null>(null)
  const [transformPreview, setTransformPreview] = useState<HandwritingStroke[] | null>(null)
  const [lassoPoints, setLassoPoints] = useState<HandwritingPoint[]>([])
  const [spacePreview, setSpacePreview] = useState<{ y: number; amount: number } | null>(null)
  const [spaceHoverY, setSpaceHoverY] = useState<number | null>(null)
  const [lineAlignmentGuide, setLineAlignmentGuide] = useState<{ axis: LineSnapAxis; start: HandwritingPoint; snapped: boolean } | null>(null)
  const [canvasHeightUnits, setCanvasHeightUnits] = useState(() => canvasHeightForDrawing(drawing))
  const currentStrokeRef = useRef<HandwritingStroke | null>(null)
  const shapePreviewRef = useRef<HandwritingStroke[]>([])
  const shapeStartRef = useRef<HandwritingPoint | null>(null)
  const shapeEndRef = useRef<HandwritingPoint | null>(null)
  const shapeStrokeIdsRef = useRef<string[]>([])
  const shapeInputRef = useRef<HandwritingStroke['input']>('mouse')
  const lineSnapTimerRef = useRef<number | null>(null)
  const lineSnapCandidateRef = useRef<{ axis: LineSnapAxis; anchorPoint: HandwritingPoint } | null>(null)
  const lineSnapLatestPointRef = useRef<HandwritingPoint | null>(null)
  const lineSnapLockedAxisRef = useRef<LineSnapAxis | null>(null)
  const erasingStrokesRef = useRef<HandwritingStroke[] | null>(null)
  const transformPreviewRef = useRef<HandwritingStroke[] | null>(null)
  const transformStateRef = useRef<TransformState | null>(null)
  const lassoPointsRef = useRef<HandwritingPoint[]>([])
  const spaceStartRef = useRef<HandwritingPoint | null>(null)
  const spacePointerBoundsRef = useRef<SpacePointerBounds | null>(null)
  const spacePreviewRef = useRef<{ y: number; amount: number } | null>(null)
  const spacePointerHeightRef = useRef(canvasHeightForDrawing(drawing))
  const canvasHeightRef = useRef(canvasHeightForDrawing(drawing))
  const pointerCanvasHeightRef = useRef(canvasHeightForDrawing(drawing))
  const activePointerRef = useRef<number | null>(null)
  const activePointerBoundsRef = useRef<SpacePointerBounds | null>(null)
  const activePointerCoordinateRef = useRef<{ clientX: number; clientY: number; point: HandwritingPoint } | null>(null)
  const activeInteractionRef = useRef<HandwritingInteraction | null>(null)
  const autoExtendedDuringInteractionRef = useRef(false)
  const canvasResizeTopRef = useRef<number | null>(null)
  const penDetectedRef = useRef(false)
  const smoothedPressureRef = useRef<number | null>(null)
  const previewFrameRef = useRef<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const clearLineSnapTimer = () => {
    if (lineSnapTimerRef.current !== null) window.clearTimeout(lineSnapTimerRef.current)
    lineSnapTimerRef.current = null
  }

  const clearLineSnap = () => {
    clearLineSnapTimer()
    lineSnapCandidateRef.current = null
    lineSnapLatestPointRef.current = null
    lineSnapLockedAxisRef.current = null
    setLineAlignmentGuide(null)
  }

  const shapeStrokesForEndPoint = (startPoint: HandwritingPoint, endPoint: HandwritingPoint) => createShapeStrokes(shape, startPoint, endPoint, {
    ids: shapeStrokeIdsRef.current,
    color,
    size,
    input: shapeInputRef.current,
    lineStyle: shapeLineStyle,
    fill: shapeFill,
    fillColor: shapeFillColor,
    fillOpacity: shapeFillOpacity,
  })

  const updateShapePreview = (startPoint: HandwritingPoint, endPoint: HandwritingPoint) => {
    shapeEndRef.current = endPoint
    const next = shapeStrokesForEndPoint(startPoint, endPoint)
    shapePreviewRef.current = next
    setShapePreview(next)
  }

  useEffect(() => {
    // A drawing update from the previous stroke can be acknowledged after the
    // next pointerdown has already started. Resetting here would clear that new
    // pointer id and make its eventual pointerup discard the whole stroke.
    // The active gesture will produce the next drawing update, at which point
    // the normal reset can run safely.
    if (!shouldResetCanvasForDrawingChange(activePointerRef.current)) return
    if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current)
    clearLineSnapTimer()
    previewFrameRef.current = null
    currentStrokeRef.current = null
    shapePreviewRef.current = []
    shapeStartRef.current = null
    shapeEndRef.current = null
    shapeStrokeIdsRef.current = []
    lineSnapCandidateRef.current = null
    lineSnapLatestPointRef.current = null
    lineSnapLockedAxisRef.current = null
    erasingStrokesRef.current = null
    transformPreviewRef.current = null
    transformStateRef.current = null
    lassoPointsRef.current = []
    spaceStartRef.current = null
    spacePointerBoundsRef.current = null
    spacePreviewRef.current = null
    const nextHeight = canvasHeightForDrawing(drawing)
    spacePointerHeightRef.current = nextHeight
    canvasHeightRef.current = nextHeight
    pointerCanvasHeightRef.current = nextHeight
    setCanvasHeightUnits(nextHeight)
    activePointerRef.current = null
    interactionActiveRef.current = false
    activePointerBoundsRef.current = null
    activePointerCoordinateRef.current = null
    activeInteractionRef.current = null
    autoExtendedDuringInteractionRef.current = false
    canvasResizeTopRef.current = null
    smoothedPressureRef.current = null
    setCurrentStroke(null)
    setShapePreview([])
    setLineAlignmentGuide(null)
    setErasingStrokes(null)
    setTransformPreview(null)
    setLassoPoints([])
    setSpacePreview(null)
    setSpaceHoverY(null)
  }, [drawing])

  useEffect(() => () => clearLineSnapTimer(), [])

  useLayoutEffect(() => {
    const previousTop = canvasResizeTopRef.current
    const svg = svgRef.current
    canvasResizeTopRef.current = null
    if (previousTop === null || !svg) return
    const topShift = svg.getBoundingClientRect().top - previousTop
    if (Math.abs(topShift) > .5) window.scrollBy(0, topShift)
  }, [canvasHeightUnits])

  useEffect(() => {
    if (tool === 'shape' && shape === 'line') return
    clearLineSnap()
  }, [shape, tool])

  useEffect(() => {
    if (tool !== 'space') setSpaceHoverY(null)
  }, [tool])

  const pointsFromEvent = (event: ReactPointerEvent<SVGElement>): HandwritingPoint[] => {
    const liveBounds = svgRef.current?.getBoundingClientRect()
    const bounds = spaceStartRef.current && spacePointerBoundsRef.current
      ? spacePointerBoundsRef.current
      : activePointerBoundsRef.current || liveBounds
    if (!bounds || !bounds.width || !bounds.height) return []
    const coalescedEvents = event.nativeEvent.getCoalescedEvents?.()
    const nativeEvents = coalescedEvents?.length ? coalescedEvents : [event.nativeEvent]
    let activeCoordinate = activePointerCoordinateRef.current
    const points = nativeEvents.map(pointerEvent => {
      let pressure = pointerEvent.pressure || .5
      if (event.pointerType === 'pen') {
        const rawPressure = pointerEvent.pressure > 0 ? pointerEvent.pressure : smoothedPressureRef.current ?? .06
        const curvedPressure = Math.pow(Math.min(1, Math.max(.01, rawPressure)), 1 / 1.15)
        pressure = smoothedPressureRef.current === null
          ? curvedPressure
          : smoothedPressureRef.current * .24 + curvedPressure * .76
        smoothedPressureRef.current = pressure
      }
      const pointerHeight = spaceStartRef.current ? spacePointerHeightRef.current : pointerCanvasHeightRef.current
      const point = activeCoordinate
        ? handwritingPointFromClientDelta(
            activeCoordinate.point,
            { x: activeCoordinate.clientX, y: activeCoordinate.clientY },
            { x: pointerEvent.clientX, y: pointerEvent.clientY },
            bounds.width,
          )
        : {
            x: Math.min(1, Math.max(0, (pointerEvent.clientX - bounds.left) / bounds.width)),
            y: Math.max(0, (pointerEvent.clientY - bounds.top) / bounds.height) * (pointerHeight / DRAWING_BASE_HEIGHT),
          }
      const nextPoint = { ...point, pressure }
      if (activeCoordinate) {
        activeCoordinate = {
          clientX: pointerEvent.clientX,
          clientY: pointerEvent.clientY,
          point: nextPoint,
        }
      }
      return nextPoint
    })
    if (activeCoordinate) activePointerCoordinateRef.current = activeCoordinate
    return points
  }

  const applyAutoExtendedCanvasHeight = (nextHeight: number) => {
    if (nextHeight === canvasHeightRef.current) return
    canvasResizeTopRef.current = svgRef.current?.getBoundingClientRect().top ?? null
    canvasHeightRef.current = nextHeight
    autoExtendedDuringInteractionRef.current = true
    setCanvasHeightUnits(nextHeight)
  }

  const renderedCanvasHeight = () => {
    const viewBoxHeight = Number(svgRef.current?.getAttribute('viewBox')?.trim().split(/\s+/)[3])
    return Number.isFinite(viewBoxHeight)
      ? clamp(viewBoxHeight, DRAWING_BASE_HEIGHT, MAX_DRAWING_HEIGHT)
      : Math.max(canvasHeightRef.current, canvasHeightUnits)
  }

  const ensureCanvasForPoint = (point: HandwritingPoint) => {
    const pointY = point.y * DRAWING_BASE_HEIGHT
    const nextHeight = autoExtendedCanvasHeight(canvasHeightRef.current, pointY)
    applyAutoExtendedCanvasHeight(nextHeight)
  }

  const eraseAt = (point: HandwritingPoint, strokes: HandwritingStroke[]) => eraseHandwritingStrokes(strokes, point, Math.max(.012, size / 420))
  const updatePreviewOnNextFrame = () => {
    if (previewFrameRef.current !== null) return
    previewFrameRef.current = requestAnimationFrame(() => {
      previewFrameRef.current = null
      setCurrentStroke(currentStrokeRef.current)
      setErasingStrokes(erasingStrokesRef.current)
    })
  }

  const beginTransform = (event: ReactPointerEvent<SVGElement>, handle?: SelectionHandle) => {
    const selectedStrokes = drawing.strokes.filter(stroke => selectedStrokeIds.includes(stroke.id))
    const bounds = selectionBoundsForStrokes(selectedStrokes)
    const point = pointsFromEvent(event).at(-1)
    const svg = svgRef.current
    if (!bounds || !point || !svg || !selectedStrokes.length) return
    event.preventDefault()
    event.stopPropagation()
    svg.focus({ preventScroll: true })
    svg.setPointerCapture(event.pointerId)
    activePointerRef.current = event.pointerId
    interactionActiveRef.current = true
    activeInteractionRef.current = handle ? 'scale' : 'move'
    transformStateRef.current = {
      interaction: handle ? 'scale' : 'move',
      startPoint: point,
      startBounds: bounds,
      baseStrokes: drawing.strokes,
      selectedIds: new Set(selectedStrokeIds),
      ...(handle ? { handle } : {}),
    }
    transformPreviewRef.current = drawing.strokes
    setTransformPreview(drawing.strokes)
  }

  const start = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (activePointerRef.current !== null) return
    if (event.pointerType === 'pen') penDetectedRef.current = true
    if (event.pointerType === 'touch' && penDetectedRef.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointerRef.current = event.pointerId
    interactionActiveRef.current = true
    const pointerBounds = event.currentTarget.getBoundingClientRect()
    activePointerBoundsRef.current = {
      left: pointerBounds.left,
      top: pointerBounds.top,
      width: pointerBounds.width,
      height: pointerBounds.height,
    }
    activePointerCoordinateRef.current = null
    autoExtendedDuringInteractionRef.current = false
    smoothedPressureRef.current = null
    svgRef.current?.focus({ preventScroll: true })
    const point = pointsFromEvent(event).at(-1)
    if (!point) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      activePointerRef.current = null
      interactionActiveRef.current = false
      activePointerBoundsRef.current = null
      activePointerCoordinateRef.current = null
      return
    }
    activePointerCoordinateRef.current = {
      clientX: event.nativeEvent.clientX,
      clientY: event.nativeEvent.clientY,
      point,
    }
    const eventTool: HandwritingTool = event.pointerType === 'pen' && (event.button === 5 || (event.buttons & 32) !== 0) ? 'eraser' : tool
    if (eventTool === 'lasso') {
      const selectedBounds = selectionBoundsForStrokes(drawing.strokes.filter(stroke => selectedStrokeIds.includes(stroke.id)))
      if (selectedBounds && pointInBounds(point, expandSelectionBounds(selectedBounds))) {
        beginTransform(event, undefined)
        return
      }
      activeInteractionRef.current = 'lasso'
      lassoPointsRef.current = [point]
      setLassoPoints([point])
      return
    }
    activeInteractionRef.current = eventTool
    if (eventTool === 'eraser') {
      const next = eraseAt(point, drawing.strokes)
      erasingStrokesRef.current = next
      setErasingStrokes(next)
      return
    }
    if (eventTool === 'space') {
      activeInteractionRef.current = 'space'
      spacePointerHeightRef.current = canvasHeightRef.current
      const bounds = svgRef.current?.getBoundingClientRect()
      spacePointerBoundsRef.current = bounds
        ? { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }
        : null
      spaceStartRef.current = point
      spacePreviewRef.current = { y: point.y, amount: 0 }
      setSpacePreview(spacePreviewRef.current)
      return
    }
    const input = event.pointerType === 'pen' || event.pointerType === 'touch' ? event.pointerType : 'mouse'
    if (eventTool === 'shape') {
      clearLineSnap()
      // A new shape starts a fresh edit gesture. The previous shape stays in
      // the drawing, but its handles should not cover the new blank area.
      onSelectionChange([])
      activeInteractionRef.current = 'shape'
      shapeStartRef.current = point
      shapeEndRef.current = point
      shapeStrokeIdsRef.current = [newStrokeId()]
      shapeInputRef.current = input
      updateShapePreview(point, point)
      return
    }
    const stroke: HandwritingStroke = { id: newStrokeId(), color, size, input, points: [point] }
    ensureCanvasForPoint(point)
    currentStrokeRef.current = stroke
    setCurrentStroke(stroke)
  }

  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (activePointerRef.current === null && tool === 'space' && (event.pointerType === 'mouse' || event.pointerType === 'pen')) {
      const point = pointsFromEvent(event).at(-1)
      if (point) setSpaceHoverY(point.y)
      return
    }
    if (activePointerRef.current !== event.pointerId) return
    if (event.pointerType === 'pen') penDetectedRef.current = true
    event.preventDefault()
    const points = pointsFromEvent(event)
    const interaction = activeInteractionRef.current
    if (interaction === 'lasso') {
      const previous = lassoPointsRef.current.at(-1)
      const appended = points.filter(point => !previous || pointDistance(previous, point) >= .0007)
      if (appended.length) {
        lassoPointsRef.current = [...lassoPointsRef.current, ...appended]
        updatePreviewOnNextFrame()
        setLassoPoints(lassoPointsRef.current)
      }
      return
    }
    if (interaction === 'space') {
      const point = points.at(-1)
      const startPoint = spaceStartRef.current
      if (!point || !startPoint) return
      const amount = clampSpaceAdjustment(drawing.strokes, startPoint.y, point.y - startPoint.y, canvasHeightRef.current)
      if (spacePreviewRef.current?.amount !== amount) {
        spacePreviewRef.current = { y: startPoint.y, amount }
        setSpacePreview(spacePreviewRef.current)
      }
      return
    }
    if (interaction === 'move' || interaction === 'scale') {
      const transform = transformStateRef.current
      const point = points.at(-1)
      if (!transform || !point) return
      let next = transform.baseStrokes
      if (transform.interaction === 'move') {
        const dx = clamp(point.x - transform.startPoint.x, -transform.startBounds.minX, 1 - transform.startBounds.maxX)
        const requestedDy = point.y - transform.startPoint.y
        const nextCanvasHeight = canvasHeightForMovingSelection(canvasHeightRef.current, transform.startBounds.maxY, requestedDy)
        applyAutoExtendedCanvasHeight(nextCanvasHeight)
        const canvasMaxY = canvasHeightRef.current / DRAWING_BASE_HEIGHT
        const dy = clamp(requestedDy, -transform.startBounds.minY, canvasMaxY - transform.startBounds.maxY)
        next = fitSelectedStrokesToCanvas(translateStrokes(transform.baseStrokes, transform.selectedIds, dx, dy), transform.selectedIds, canvasMaxY)
      } else if (transform.handle) {
        const isWest = transform.handle === 'nw' || transform.handle === 'sw' || transform.handle === 'w'
        const isEast = transform.handle === 'ne' || transform.handle === 'se' || transform.handle === 'e'
        const isNorth = transform.handle === 'nw' || transform.handle === 'ne' || transform.handle === 'n'
        const isSouth = transform.handle === 'sw' || transform.handle === 'se' || transform.handle === 's'
        const verticalOnly = transform.handle === 'n' || transform.handle === 's'
        const horizontalOnly = transform.handle === 'e' || transform.handle === 'w'
        const anchor = {
          x: isWest
            ? transform.startBounds.maxX
            : isEast
              ? transform.startBounds.minX
              : (transform.startBounds.minX + transform.startBounds.maxX) / 2,
          y: isNorth
            ? transform.startBounds.maxY
            : isSouth
              ? transform.startBounds.minY
              : (transform.startBounds.minY + transform.startBounds.maxY) / 2,
        }
        const edgeX = isWest ? Math.min(point.x, anchor.x - .01) : isEast ? Math.max(point.x, anchor.x + .01) : anchor.x
        const edgeY = isNorth ? Math.min(point.y, anchor.y - .01) : isSouth ? Math.max(point.y, anchor.y + .01) : anchor.y
        const startWidth = Math.max(.02, Math.abs(transform.startPoint.x - anchor.x))
        const startHeight = Math.max(.02, Math.abs(transform.startPoint.y - anchor.y))
        const rawWidth = Math.max(.02, transform.startBounds.maxX - transform.startBounds.minX)
        const rawHeight = Math.max(.02, transform.startBounds.maxY - transform.startBounds.minY)
        const maxScaleX = isWest ? anchor.x / rawWidth : (1 - anchor.x) / rawWidth
        const maxScaleY = isNorth ? anchor.y / rawHeight : (canvasHeightRef.current / DRAWING_BASE_HEIGHT - anchor.y) / rawHeight
        const scaleX = verticalOnly ? 1 : clamp(Math.abs(edgeX - anchor.x) / startWidth, .1, Math.max(.1, maxScaleX))
        const scaleY = horizontalOnly ? 1 : clamp(Math.abs(edgeY - anchor.y) / startHeight, .1, Math.max(.1, maxScaleY))
        next = scaleStrokes(transform.baseStrokes, transform.selectedIds, anchor, scaleX, scaleY, canvasHeightRef.current / DRAWING_BASE_HEIGHT)
      }
      transformPreviewRef.current = next
      setTransformPreview(next)
      return
    }
    if (interaction === 'eraser') {
      const next = points.reduce((strokes, point) => eraseAt(point, strokes), erasingStrokesRef.current || drawing.strokes)
      erasingStrokesRef.current = next
      updatePreviewOnNextFrame()
      return
    }
    if (interaction === 'shape') {
      const startPoint = shapeStartRef.current
      const rawEndPoint = points.at(-1)
      if (!startPoint || !rawEndPoint) return
      ensureCanvasForPoint(rawEndPoint)

      if (shape !== 'line') {
        updateShapePreview(startPoint, rawEndPoint)
        return
      }

      const lockedAxis = lineSnapLockedAxisRef.current
      if (lockedAxis) {
        const releaseAxis = lineSnapAxisForPoints(startPoint, rawEndPoint, LINE_SNAP_RELEASE_DEGREES)
        if (releaseAxis === lockedAxis) {
          const snappedEndPoint = snapLineEndPoint(startPoint, rawEndPoint, lockedAxis)
          lineSnapLatestPointRef.current = rawEndPoint
          setLineAlignmentGuide({ axis: lockedAxis, start: startPoint, snapped: true })
          updateShapePreview(startPoint, snappedEndPoint)
          return
        }
        clearLineSnap()
      }

      const candidateAxis = lineSnapAxisForPoints(startPoint, rawEndPoint)
      if (!candidateAxis) {
        clearLineSnapTimer()
        lineSnapCandidateRef.current = null
        lineSnapLatestPointRef.current = null
        setLineAlignmentGuide(null)
        updateShapePreview(startPoint, rawEndPoint)
        return
      }

      setLineAlignmentGuide({ axis: candidateAxis, start: startPoint, snapped: false })
      lineSnapLatestPointRef.current = rawEndPoint
      const existingCandidate = lineSnapCandidateRef.current
      const movedSinceCandidate = existingCandidate
        ? pointDistance(canvasPoint(existingCandidate.anchorPoint), canvasPoint(rawEndPoint))
        : Number.POSITIVE_INFINITY
      if (!existingCandidate || existingCandidate.axis !== candidateAxis || movedSinceCandidate > LINE_SNAP_STABILITY_DISTANCE) {
        clearLineSnapTimer()
        lineSnapCandidateRef.current = { axis: candidateAxis, anchorPoint: rawEndPoint }
        lineSnapTimerRef.current = window.setTimeout(() => {
          const latestPoint = lineSnapLatestPointRef.current
          const activeCandidate = lineSnapCandidateRef.current
          const activeStart = shapeStartRef.current
          if (!latestPoint || !activeStart || activeInteractionRef.current !== 'shape' || activeCandidate?.axis !== candidateAxis) return
          lineSnapLockedAxisRef.current = candidateAxis
          const snappedEndPoint = snapLineEndPoint(activeStart, latestPoint, candidateAxis)
          setLineAlignmentGuide({ axis: candidateAxis, start: activeStart, snapped: true })
          updateShapePreview(activeStart, snappedEndPoint)
          lineSnapTimerRef.current = null
        }, LINE_SNAP_STAY_MS)
      }
      updateShapePreview(startPoint, rawEndPoint)
      return
    }
    const stroke = currentStrokeRef.current
    if (!stroke) return
    ensureCanvasForPoint(points.at(-1) || stroke.points[stroke.points.length - 1])
    const appended = points.reduce<HandwritingPoint[]>((result, point) => {
      const previous = result[result.length - 1] || stroke.points[stroke.points.length - 1]
      return pointDistance(previous, point) < MIN_STROKE_POINT_DISTANCE ? result : [...result, point]
    }, [])
    if (!appended.length) return
    const next = { ...stroke, points: [...stroke.points, ...appended] }
    currentStrokeRef.current = next
    updatePreviewOnNextFrame()
  }

  const finish = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (activePointerRef.current !== event.pointerId) return
    // The last pointermove is not guaranteed to be dispatched before
    // pointerup/pointercancel. Consume the ending event first so its final
    // coordinate (and any coalesced samples) is not dropped from the stroke.
    move(event)
    event.preventDefault()
    if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current)
    previewFrameRef.current = null
    const svg = svgRef.current
    activePointerRef.current = null
    interactionActiveRef.current = false
    // Clear the active id before releasing capture so the resulting
    // lostpointercapture event cannot finish and commit the same gesture twice.
    if (svg?.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId)
    activePointerBoundsRef.current = null
    activePointerCoordinateRef.current = null
    smoothedPressureRef.current = null
    const interaction = activeInteractionRef.current
    activeInteractionRef.current = null
    const autoExtendedDuringInteraction = autoExtendedDuringInteractionRef.current
    autoExtendedDuringInteractionRef.current = false
    if (interaction === 'lasso') {
      const polygon = lassoPointsRef.current
      onSelectionChange(drawing.strokes.filter(stroke => strokeIsInsideLasso(stroke, polygon)).map(stroke => stroke.id))
      lassoPointsRef.current = []
      setLassoPoints([])
      return
    }
    if (interaction === 'move' || interaction === 'scale') {
      const next = transformPreviewRef.current
      const transform = transformStateRef.current
      if (next && transform && next !== transform.baseStrokes) {
        onCommit(
          { ...drawing, aspectRatio: aspectRatioForCanvasHeight(canvasHeightRef.current), strokes: next },
          autoExtendedDuringInteraction ? 'defer' : undefined,
        )
      }
      transformPreviewRef.current = null
      transformStateRef.current = null
      setTransformPreview(null)
      return
    }
    if (interaction === 'space') {
      const startPoint = spaceStartRef.current
      const preview = spacePreviewRef.current
      const amount = startPoint && preview
        ? clampSpaceAdjustment(drawing.strokes, startPoint.y, preview.amount, canvasHeightRef.current)
        : 0
      if (startPoint && Math.abs(amount) >= MIN_SPACE_ADJUSTMENT) {
        const nextHeight = canvasHeightRef.current + amount * DRAWING_BASE_HEIGHT
        const nextStrokes = insertSpaceIntoStrokes(drawing.strokes, startPoint.y, amount)
        canvasHeightRef.current = nextHeight
        onCommit({ ...drawing, aspectRatio: aspectRatioForCanvasHeight(nextHeight), strokes: nextStrokes })
      }
      spaceStartRef.current = null
      spacePointerBoundsRef.current = null
      spacePreviewRef.current = null
      spacePointerHeightRef.current = canvasHeightRef.current
      setSpacePreview(null)
      setSpaceHoverY(null)
      return
    }
    if (interaction === 'eraser') {
      const strokes = erasingStrokesRef.current
      if (strokes && strokes.length !== drawing.strokes.length) {
        const preservedCanvasHeight = renderedCanvasHeight()
        onCommit({
          ...drawing,
          aspectRatio: aspectRatioForCanvasHeight(preservedCanvasHeight),
          strokes,
        }, 'defer')
      }
      erasingStrokesRef.current = null
      setErasingStrokes(null)
      return
    }
    if (interaction === 'shape') {
      const startPoint = shapeStartRef.current
      const endPoint = shapeEndRef.current
      const strokes = shapePreviewRef.current
      clearLineSnap()
      if (startPoint && endPoint && strokes.length && pointDistance(canvasPoint(startPoint), canvasPoint(endPoint)) >= MIN_SHAPE_DRAG_DISTANCE) {
        const nextDrawing = {
          ...drawing,
          aspectRatio: aspectRatioForCanvasHeight(canvasHeightRef.current),
          strokes: [...drawing.strokes, ...strokes],
        }
        onCommit(
          nextDrawing,
          autoExtendedDuringInteraction ? 'defer' : undefined,
        )
        // Keep the shape tool active and select only the newly created object.
        // The selection overlay is limited to the object bounds, so blank
        // canvas remains available for the next shape.
        onSelectionChange(strokes.map(stroke => stroke.id))
      }
      shapePreviewRef.current = []
      shapeStartRef.current = null
      shapeEndRef.current = null
      shapeStrokeIdsRef.current = []
      setShapePreview([])
      return
    }
    const stroke = currentStrokeRef.current
    if (stroke) {
      onCommit(
        { ...drawing, aspectRatio: aspectRatioForCanvasHeight(canvasHeightRef.current), strokes: [...drawing.strokes, stroke] },
        autoExtendedDuringInteraction ? 'defer' : undefined,
      )
    }
    currentStrokeRef.current = null
    setCurrentStroke(null)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedStrokeIds.length && tool === 'lasso') {
      event.preventDefault()
      onDeleteSelection()
    }
  }

  const previewCanvasHeightUnits = spacePreview
    ? Math.min(MAX_DRAWING_HEIGHT, canvasHeightRef.current + spacePreview.amount * DRAWING_BASE_HEIGHT)
    : canvasHeightUnits
  pointerCanvasHeightRef.current = previewCanvasHeightUnits
  const spacePreviewStrokes = spacePreview
    ? insertSpaceIntoStrokes(drawing.strokes, spacePreview.y, spacePreview.amount)
    : null
  const visibleStrokes = transformPreview || erasingStrokes || spacePreviewStrokes || drawing.strokes
  const selectedStrokes = visibleStrokes.filter(stroke => selectedStrokeIds.includes(stroke.id))
  const selectedBounds = selectionBoundsForStrokes(selectedStrokes)
  const canvasMaxY = previewCanvasHeightUnits / DRAWING_BASE_HEIGHT
  const selectionBox = selectedBounds ? expandSelectionBounds(selectedBounds, .014, canvasMaxY) : null
  const lassoPath = lassoPoints.map(point => `${point.x * DRAWING_WIDTH},${point.y * DRAWING_BASE_HEIGHT}`).join(' ')
  const selectionHandleSize = 14
  const spaceRangeTop = spacePreview
    ? Math.min(spacePreview.y, spacePreview.y + spacePreview.amount) * DRAWING_BASE_HEIGHT
    : 0
  const spaceRangeHeight = spacePreview ? Math.abs(spacePreview.amount) * DRAWING_BASE_HEIGHT : 0
  const spaceRangeStyle = spacePreview ? {
    top: `${spaceRangeTop / previewCanvasHeightUnits * 100}%`,
    height: `${Math.max(.8, spaceRangeHeight / previewCanvasHeightUnits * 100)}%`,
  } : undefined
  const handlePoints = selectionBox ? selectionHandlePointsForBounds(selectionBox) : []
  const canvasStyle = { '--handwriting-aspect-ratio': String(DRAWING_WIDTH / previewCanvasHeightUnits) } as CSSProperties
  return <div className={expanded ? 'handwriting-canvas expanded' : 'handwriting-canvas'} style={canvasStyle}>
    <div className="handwriting-sheet">
      <svg
        ref={svgRef}
        role="img"
        tabIndex={0}
        aria-label={tool === 'pen' ? '手写笔记画布，当前为画笔' : tool === 'eraser' ? '手写笔记画布，当前为橡皮擦' : tool === 'space' ? '手写笔记画布，当前为插入空间' : tool === 'shape' ? '手写笔记画布，当前为图形' : '手写笔记画布，当前为套索选择'}
        viewBox={`0 0 ${DRAWING_WIDTH} ${previewCanvasHeightUnits}`}
        preserveAspectRatio="none"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onPointerLeave={() => { if (activePointerRef.current === null) setSpaceHoverY(null) }}
        onKeyDown={handleKeyDown}
      >
        <StrokeLayer strokes={visibleStrokes} selectedStrokeIds={selectedStrokeIds}/>
        {lineAlignmentGuide && shape === 'line' && <g className="handwriting-line-alignment">
          <line
            className={`handwriting-line-alignment-guide ${lineAlignmentGuide.snapped ? 'snapped' : ''}`}
            x1={lineAlignmentGuide.axis === 'horizontal' ? 0 : lineAlignmentGuide.start.x * DRAWING_WIDTH}
            x2={lineAlignmentGuide.axis === 'horizontal' ? DRAWING_WIDTH : lineAlignmentGuide.start.x * DRAWING_WIDTH}
            y1={lineAlignmentGuide.axis === 'horizontal' ? lineAlignmentGuide.start.y * DRAWING_BASE_HEIGHT : 0}
            y2={lineAlignmentGuide.axis === 'horizontal' ? lineAlignmentGuide.start.y * DRAWING_BASE_HEIGHT : previewCanvasHeightUnits}
            vectorEffect="non-scaling-stroke"
          />
          <circle
            className={`handwriting-line-snap-marker ${lineAlignmentGuide.snapped ? 'snapped' : ''}`}
            cx={lineAlignmentGuide.start.x * DRAWING_WIDTH}
            cy={lineAlignmentGuide.start.y * DRAWING_BASE_HEIGHT}
            r="5"
            vectorEffect="non-scaling-stroke"
          />
        </g>}
        <StrokeLayer strokes={shapePreview} selectedStrokeIds={[]}/>
        {currentStroke && pathsForStroke(currentStroke).map((path, index) => (
          <path
            key={`${currentStroke.id}-current-${index}`}
            d={path.d}
            fill="none"
            stroke={currentStroke.color}
            strokeWidth={path.width}
            strokeDasharray={path.dashArray}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {tool === 'space' && spaceHoverY !== null && !spacePreview && (
          <line className="handwriting-space-guide" x1="0" x2={DRAWING_WIDTH} y1={spaceHoverY * DRAWING_BASE_HEIGHT} y2={spaceHoverY * DRAWING_BASE_HEIGHT}/>
        )}
        {spacePreview && <g className="handwriting-space-boundaries">
          <line x1="0" x2={DRAWING_WIDTH} y1={spaceRangeTop} y2={spaceRangeTop} strokeDasharray="12 8"/>
          <line x1="0" x2={DRAWING_WIDTH} y1={spaceRangeTop + spaceRangeHeight} y2={spaceRangeTop + spaceRangeHeight} strokeDasharray="12 8"/>
        </g>}
        {lassoPoints.length > 1 && <polyline className="handwriting-lasso-preview" points={lassoPath} fill="rgba(143, 48, 40, .08)" stroke="#8f3028" strokeWidth="2" strokeDasharray="8 6" vectorEffect="non-scaling-stroke"/>}
        {selectionBox && (tool === 'lasso' || tool === 'shape') && <g className="handwriting-selection-overlay">
          <rect className="handwriting-selection-box" x={selectionBox.minX * DRAWING_WIDTH} y={selectionBox.minY * DRAWING_BASE_HEIGHT} width={(selectionBox.maxX - selectionBox.minX) * DRAWING_WIDTH} height={(selectionBox.maxY - selectionBox.minY) * DRAWING_BASE_HEIGHT}/>
          <rect className="handwriting-selection-hitbox" x={selectionBox.minX * DRAWING_WIDTH} y={selectionBox.minY * DRAWING_BASE_HEIGHT} width={(selectionBox.maxX - selectionBox.minX) * DRAWING_WIDTH} height={(selectionBox.maxY - selectionBox.minY) * DRAWING_BASE_HEIGHT} onPointerDown={event => beginTransform(event, undefined)}/>
          {handlePoints.map(({ handle, x, y }) => <rect
            key={handle}
            className={`handwriting-selection-handle handwriting-selection-handle-${handle}`}
            x={x * DRAWING_WIDTH - selectionHandleSize / 2}
            y={y * DRAWING_BASE_HEIGHT - selectionHandleSize / 2}
            width={selectionHandleSize}
            height={selectionHandleSize}
            aria-label={`${handle === 'n' ? '从上边' : handle === 'e' ? '从右边' : handle === 's' ? '从下边' : handle === 'w' ? '从左边' : `从${handle}角`}缩放选中笔迹`}
            onPointerDown={event => beginTransform(event, handle)}
          />)}
        </g>}
      </svg>
      {spacePreview && <div
        className={`handwriting-space-range ${spacePreview.amount < 0 ? 'shrinking' : 'inserting'}`}
        style={spaceRangeStyle}
        aria-live="polite"
      >
        <span>{spacePreview.amount === 0 ? '上下拖动调整范围' : `${spacePreview.amount > 0 ? '插入' : '收缩'} ${Math.max(1, Math.round(spaceRangeHeight))} px`}</span>
      </div>}
      {!visibleStrokes.length && !currentStroke && !shapePreview.length && <span>在这里书写，支持触控笔、触摸和鼠标</span>}
    </div>
  </div>
}

interface HandwritingEditorProps {
  drawing: HandwritingDrawing
  tool: HandwritingTool
  shape: HandwritingShape
  shapeLineStyle: HandwritingShapeLineStyle
  shapeFill: boolean
  shapeFillColor: string
  shapeFillOpacity: number
  color: string
  size: number
  expanded?: boolean
  canUndo: boolean
  canRedo: boolean
  onToolChange: (tool: HandwritingTool) => void
  onShapeChange: (shape: HandwritingShape) => void
  onShapeLineStyleChange: (lineStyle: HandwritingShapeLineStyle) => void
  onShapeFillChange: (fill: boolean) => void
  onShapeFillColorChange: (color: string) => void
  onShapeFillOpacityChange: (opacity: number) => void
  onColorChange: (color: string) => void
  onSizeChange: (size: number) => void
  onCommit: (drawing: HandwritingDrawing, canvasTrimIntent?: CanvasTrimIntent) => void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onExpand?: () => void
}

function InsertSpaceIcon() {
  return <svg className="handwriting-space-icon" viewBox="0 0 32 36" aria-hidden="true">
    <path className="handwriting-space-icon-line" d="M3 14h26M3 20h26"/>
    <path className="handwriting-space-icon-arrow" d="M16 2v10m-4-6 4-4 4 4M16 34V24m-4 6 4 4 4-4"/>
  </svg>
}

function ShapeLineStyleIcon({ lineStyle }: { lineStyle: HandwritingShapeLineStyle }) {
  return <svg className="handwriting-shape-setting-icon" viewBox="0 0 28 18" aria-hidden="true">
    <path d="M3 9h22" strokeDasharray={lineStyle === 'dashed' ? '7 4' : lineStyle === 'dotted' ? '1 4' : undefined}/>
  </svg>
}

function ShapeFillIcon({ filled }: { filled: boolean }) {
  return <svg className="handwriting-shape-setting-icon" viewBox="0 0 28 22" aria-hidden="true">
    <rect x="5" y="3" width="18" height="16" rx="2" className={filled ? 'shape-fill-preview' : 'shape-fill-none-preview'}/>
    {!filled && <path d="M5 19 23 3" className="shape-fill-slash"/>}
  </svg>
}

function ShapeOpacityIcon() {
  return <svg className="handwriting-shape-opacity-icon" viewBox="0 0 20 24" aria-hidden="true">
    <path d="M10 2S3.5 10.2 3.5 15a6.5 6.5 0 0 0 13 0C16.5 10.2 10 2 10 2Z"/>
    <path d="M10 8v13a6.5 6.5 0 0 0 0-13Z" className="shape-opacity-fill"/>
  </svg>
}

function HandwritingEditor(props: HandwritingEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const interactionActiveRef = useRef(false)
  const sizePickerRef = useRef<HTMLDivElement | null>(null)
  const shapePickerRef = useRef<HTMLDivElement | null>(null)
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([])
  const [sizePickerOpen, setSizePickerOpen] = useState(false)
  const [shapePickerOpen, setShapePickerOpen] = useState(false)

  useEffect(() => {
    editorRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const drawingIds = new Set(props.drawing.strokes.map(stroke => stroke.id))
    setSelectedStrokeIds(previous => previous.filter(id => drawingIds.has(id)))
    setSizePickerOpen(false)
    setShapePickerOpen(false)
  }, [props.drawing])

  useEffect(() => {
    if (!sizePickerOpen && !shapePickerOpen) return
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!sizePickerRef.current?.contains(event.target as Node)) setSizePickerOpen(false)
      if (!shapePickerRef.current?.contains(event.target as Node)) setShapePickerOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSizePickerOpen(false)
      setShapePickerOpen(false)
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [shapePickerOpen, sizePickerOpen])

  const selectTool = (tool: HandwritingTool) => {
    props.onToolChange(tool)
    if (tool !== 'lasso') setSelectedStrokeIds(previous => previous.length ? [] : previous)
    if (tool !== 'shape') setShapePickerOpen(false)
  }

  const selectShape = (shape: HandwritingShape) => {
    props.onShapeChange(shape)
    selectTool('shape')
  }

  const applyColor = (nextColor: string) => {
    props.onColorChange(nextColor)
    if (!selectedStrokeIds.length) return
    const selected = new Set(selectedStrokeIds)
    const nextStrokes = props.drawing.strokes.map(stroke => selected.has(stroke.id) ? { ...stroke, color: nextColor } : stroke)
    if (nextStrokes.some((stroke, index) => stroke.color !== props.drawing.strokes[index]?.color)) props.onCommit({ ...props.drawing, strokes: nextStrokes })
  }

  const applySize = (nextSize: number) => {
    props.onSizeChange(nextSize)
    if (!selectedStrokeIds.length) return
    const nextStrokes = updateSelectedStrokeSize(props.drawing.strokes, selectedStrokeIds, nextSize)
    if (nextStrokes.some((stroke, index) => stroke.size !== props.drawing.strokes[index]?.size)) props.onCommit({ ...props.drawing, strokes: nextStrokes })
  }

  const copySelection = () => {
    if (!selectedStrokeIds.length) return
    const selected = new Set(selectedStrokeIds)
    copyHandwritingStrokes(props.drawing.strokes.filter(stroke => selected.has(stroke.id)), 'normalized')
  }

  const pasteSelection = async () => {
    const clipboard = await readHandwritingStrokes()
    if (!clipboard?.strokes.length) return
    const allPoints = clipboard.strokes.flatMap(stroke => stroke.points)
    const minX = Math.min(...allPoints.map(point => point.x))
    const minY = Math.min(...allPoints.map(point => point.y))
    const maxX = Math.max(...allPoints.map(point => point.x))
    const maxY = Math.max(...allPoints.map(point => point.y))
    const sourceWidth = Math.max(.001, maxX - minX)
    const sourceHeight = Math.max(.001, maxY - minY)
    const normalizedScale = clipboard.space === 'canvas' ? Math.min(.52 / sourceWidth, .42 / sourceHeight) : 1
    const normalizedOrigin = { x: minX, y: minY }
    const normalizedOffset = clipboard.space === 'normalized' ? (maxX + .035 <= 1 ? .035 : minX - .035 >= 0 ? -.035 : 0) : 0
    const normalizedOffsetY = clipboard.space === 'normalized' ? (maxY + .035 <= 1 ? .035 : minY - .035 >= 0 ? -.035 : 0) : 0
    const pasted = clipboard.strokes.map(stroke => ({
      id: newStrokeId(),
      color: stroke.color,
      size: stroke.size || 2,
      input: stroke.input || 'mouse',
      ...(stroke.shape ? { shape: stroke.shape } : {}),
      ...(stroke.shapeLineStyle ? { shapeLineStyle: stroke.shapeLineStyle } : {}),
      ...(stroke.shapeFill ? { shapeFill: true } : {}),
      ...(stroke.shapeFillColor ? { shapeFillColor: stroke.shapeFillColor } : {}),
      ...(stroke.shapeFillOpacity !== undefined ? { shapeFillOpacity: stroke.shapeFillOpacity } : {}),
      points: stroke.points.map(point => ({
        ...point,
        x: clipboard.space === 'canvas'
          ? (point.x - normalizedOrigin.x) * normalizedScale + .18
          : point.x + normalizedOffset,
        y: clipboard.space === 'canvas'
          ? (point.y - normalizedOrigin.y) * normalizedScale + .18
          : point.y + normalizedOffsetY,
      })),
    }))
    props.onCommit({ ...props.drawing, strokes: [...props.drawing.strokes, ...pasted] })
    setSelectedStrokeIds(pasted.map(stroke => stroke.id))
  }

  const handleShortcutKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return
    const target = event.target as HTMLElement
    if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
    const primaryModifier = event.metaKey || event.ctrlKey
    const normalizedKey = event.key.toLowerCase()
    if (primaryModifier && !event.shiftKey && !event.altKey && normalizedKey === 'c' && selectedStrokeIds.length) {
      event.preventDefault()
      event.stopPropagation()
      copySelection()
      return
    }
    if (primaryModifier && !event.shiftKey && !event.altKey && normalizedKey === 'v') {
      event.preventDefault()
      event.stopPropagation()
      void pasteSelection()
      return
    }
    const historyAction = historyActionForShortcut(event.key, primaryModifier, event.shiftKey, event.altKey)
    if (historyAction) {
      event.preventDefault()
      if (historyAction === 'undo') props.onUndo()
      else props.onRedo()
      return
    }
    const nextTool = handwritingToolForShortcut(event.key, event)
    if (!nextTool) return
    event.preventDefault()
    event.stopPropagation()
    // A tool change in the middle of a captured pointer gesture can strand the
    // old pointer id and make every later stroke get rejected. Finish the
    // current gesture first; the shortcut can be pressed again afterwards.
    if (interactionActiveRef.current) return
    selectTool(nextTool)
  }

  const deleteSelection = () => {
    if (!selectedStrokeIds.length) return
    const strokes = props.drawing.strokes.filter(stroke => !selectedStrokeIds.includes(stroke.id))
    props.onCommit({ ...props.drawing, strokes }, 'defer')
    setSelectedStrokeIds([])
  }

  return <div ref={editorRef} tabIndex={-1} className={props.expanded ? 'handwriting-editor expanded' : 'handwriting-editor'} onKeyDown={handleShortcutKeyDown}>
    <div className="handwriting-toolbar" role="toolbar" aria-label="手写工具">
      <button className={props.tool === 'eraser' ? 'active' : ''} aria-label="橡皮擦" aria-keyshortcuts="1" title="橡皮（快捷键 1）" onClick={() => selectTool('eraser')}><Eraser size={17}/></button>
      <button className={props.tool === 'pen' ? 'active' : ''} aria-label="画笔" aria-keyshortcuts="2" title="画笔（快捷键 2）" onClick={() => selectTool('pen')}><Pencil size={17}/></button>
      <button className={props.tool === 'lasso' ? 'active' : ''} aria-label="套索选择" aria-keyshortcuts="3" title="套索（快捷键 3）" onClick={() => selectTool('lasso')}><Lasso size={17}/></button>
      <button className={props.tool === 'space' ? 'active' : ''} aria-label="插入或收缩空间" aria-keyshortcuts="4" title="插入空间（快捷键 4）：向下拖动插入，向上拖动收缩" onClick={() => selectTool('space')}><InsertSpaceIcon/></button>
      <div ref={shapePickerRef} className={`handwriting-shapes ${shapePickerOpen ? 'open' : ''}`}>
        <button type="button" className={`handwriting-shape-toggle ${props.tool === 'shape' ? 'active' : ''}`} aria-label="图形工具" aria-keyshortcuts="5" aria-expanded={shapePickerOpen} aria-controls="handwriting-shape-popover" title="图形（快捷键 5）" onClick={() => {
          selectTool('shape')
          setSizePickerOpen(false)
          setShapePickerOpen(previous => !previous)
        }}><Shapes size={17}/><ChevronDown size={12}/></button>
        {shapePickerOpen && <div id="handwriting-shape-popover" className="handwriting-shape-popover" role="dialog" aria-label="图形设置">
          <div className="handwriting-shape-options" role="group" aria-label="形状">
            <button type="button" aria-label="直线" title="直线" aria-pressed={props.shape === 'line'} className={props.shape === 'line' ? 'selected' : ''} onClick={() => selectShape('line')}><Minus size={18}/></button>
            <button type="button" aria-label="箭头" title="箭头" aria-pressed={props.shape === 'arrow'} className={props.shape === 'arrow' ? 'selected' : ''} onClick={() => selectShape('arrow')}><MoveUpRight size={18}/></button>
            <button type="button" aria-label="矩形" title="矩形" aria-pressed={props.shape === 'rectangle'} className={props.shape === 'rectangle' ? 'selected' : ''} onClick={() => selectShape('rectangle')}><Square size={18}/></button>
            <button type="button" aria-label="圆形" title="圆形" aria-pressed={props.shape === 'ellipse'} className={props.shape === 'ellipse' ? 'selected' : ''} onClick={() => selectShape('ellipse')}><Circle size={18}/></button>
            <button type="button" aria-label="三角形" title="三角形" aria-pressed={props.shape === 'triangle'} className={props.shape === 'triangle' ? 'selected' : ''} onClick={() => selectShape('triangle')}><Triangle size={18}/></button>
          </div>
          <div className="handwriting-shape-settings">
            <div className="handwriting-shape-line-options" role="group" aria-label="边框线形">
              {(['solid', 'dashed', 'dotted'] as HandwritingShapeLineStyle[]).map(lineStyle => {
                const label = lineStyle === 'solid' ? '实线' : lineStyle === 'dashed' ? '虚线' : '点线'
                return <button key={lineStyle} type="button" aria-label={label} title={label} aria-pressed={props.shapeLineStyle === lineStyle} className={props.shapeLineStyle === lineStyle ? 'selected' : ''} onClick={() => props.onShapeLineStyleChange(lineStyle)}><ShapeLineStyleIcon lineStyle={lineStyle}/></button>
              })}
            </div>
            <div className="handwriting-shape-fill-options" role="group" aria-label="图形填充">
              <button type="button" aria-label="无填充" title="无填充" aria-pressed={!props.shapeFill} className={!props.shapeFill ? 'selected' : ''} disabled={props.shape === 'line' || props.shape === 'arrow'} onClick={() => props.onShapeFillChange(false)}><ShapeFillIcon filled={false}/></button>
              <button type="button" aria-label="半透明填充" title="半透明填充" aria-pressed={props.shapeFill} className={props.shapeFill ? 'selected' : ''} disabled={props.shape === 'line' || props.shape === 'arrow'} onClick={() => props.onShapeFillChange(true)}><ShapeFillIcon filled/></button>
            </div>
          </div>
          <div className="handwriting-shape-fill-controls">
            <div className="handwriting-shape-fill-palette" role="group" aria-label="填充颜色色卡">
              <div className="handwriting-shape-fill-swatches">
                {COMMON_INK_COLORS.map(item => <button
                  key={item.value}
                  type="button"
                  aria-label={`填充${item.label}`}
                  title={item.label}
                  aria-pressed={props.shapeFillColor.toLowerCase() === item.value}
                  className={props.shapeFillColor.toLowerCase() === item.value ? 'selected' : ''}
                  style={{ '--shape-fill-color': item.value } as CSSProperties}
                  disabled={props.shape === 'line' || props.shape === 'arrow' || !props.shapeFill}
                  onClick={() => props.onShapeFillColorChange(item.value)}
                />)}
              </div>
              <label className={`handwriting-shape-fill-color ${COMMON_INK_COLORS.some(item => item.value === props.shapeFillColor.toLowerCase()) ? '' : 'selected'}`} title="自定义填充颜色">
                <input aria-label="自定义填充颜色" type="color" value={props.shapeFillColor} disabled={props.shape === 'line' || props.shape === 'arrow' || !props.shapeFill} onChange={event => props.onShapeFillColorChange(event.target.value)}/>
              </label>
            </div>
            <div className="handwriting-shape-opacity-controls">
              <ShapeOpacityIcon/>
              <input aria-label="填充透明度" title="填充透明度" type="range" min="0" max="100" value={Math.round(props.shapeFillOpacity * 100)} disabled={props.shape === 'line' || props.shape === 'arrow' || !props.shapeFill} onChange={event => props.onShapeFillOpacityChange(Number(event.target.value) / 100)}/>
              <output aria-label={`当前填充透明度 ${Math.round(props.shapeFillOpacity * 100)}%`}>{Math.round(props.shapeFillOpacity * 100)}%</output>
            </div>
          </div>
        </div>}
      </div>
      <div className="handwriting-colors" role="group" aria-label="笔迹颜色">
        <div className="handwriting-swatches">
          {COMMON_INK_COLORS.map(item => <button
            key={item.value}
            type="button"
            className={props.color.toLowerCase() === item.value ? 'selected' : ''}
            aria-label={item.label}
            aria-pressed={props.color.toLowerCase() === item.value}
            title={item.label}
            style={{ '--ink-color': item.value } as CSSProperties}
            onClick={() => applyColor(item.value)}
          />)}
        </div>
        <label className="handwriting-custom-color" title="自定义颜色">
          <input aria-label="自定义笔迹颜色" type="color" value={props.color} onChange={event => applyColor(event.target.value)}/>
        </label>
      </div>
      <div ref={sizePickerRef} className={`handwriting-size ${sizePickerOpen ? 'open' : ''}`}>
        <button type="button" className="handwriting-size-toggle" aria-label={`笔迹粗细 ${props.size}`} aria-expanded={sizePickerOpen} aria-controls="handwriting-size-popover" onClick={() => {
          setShapePickerOpen(false)
          setSizePickerOpen(previous => !previous)
        }}>
          <i className="handwriting-size-dot" aria-hidden="true" style={{ width: `${Math.max(5, props.size * 2)}px`, height: `${Math.max(5, props.size * 2)}px`, backgroundColor: props.color }}/>
          <output aria-label={`当前笔迹粗细 ${props.size}`}>{props.size}</output>
        </button>
        {sizePickerOpen && <div id="handwriting-size-popover" className="handwriting-size-popover" role="dialog" aria-label="调整笔迹粗细">
          <div className="handwriting-size-popover-head"><span>笔迹粗细</span><output>{props.size}</output></div>
          <div className="handwriting-size-preview" aria-label={`当前笔迹大小 ${props.size}`}><i style={{ width: `${Math.max(6, props.size * 2)}px`, height: `${Math.max(6, props.size * 2)}px`, backgroundColor: props.color }}/></div>
          <input aria-label="调整笔迹粗细" type="range" min="1" max="12" value={props.size} onChange={event => applySize(Number(event.target.value))}/>
          <div className="handwriting-size-scale" aria-hidden="true"><span>细</span><span>粗</span></div>
        </div>}
      </div>
      <span className="handwriting-toolbar-spacer"/>
      <button aria-label="撤销" aria-keyshortcuts="Control+Z Meta+Z" title="撤销（Ctrl/⌘+Z）" disabled={!props.canUndo} onClick={props.onUndo}><Undo2 size={15}/></button>
      <button aria-label="重做" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" title="重做（Ctrl/⌘+Shift+Z 或 Ctrl+Y）" disabled={!props.canRedo} onClick={props.onRedo}><Redo2 size={15}/></button>
      <button aria-label="删除选中笔迹" title="删除选中笔迹" disabled={!selectedStrokeIds.length} onClick={deleteSelection}><LassoDeleteIcon size={17}/></button>
      <button aria-label="清空手写" title="清空手写" disabled={!props.drawing.strokes.length} onClick={props.onClear}><Trash2 size={15}/></button>
      {props.onExpand && <button className="handwriting-expand" aria-label="放大书写" title="放大书写" onClick={props.onExpand}><Maximize2 size={17}/></button>}
    </div>
    <HandwritingCanvas drawing={props.drawing} tool={props.tool} shape={props.shape} shapeLineStyle={props.shapeLineStyle} shapeFill={props.shapeFill} shapeFillColor={props.shapeFillColor} shapeFillOpacity={props.shapeFillOpacity} color={props.color} size={props.size} expanded={props.expanded} selectedStrokeIds={selectedStrokeIds} onCommit={props.onCommit} onSelectionChange={setSelectedStrokeIds} onDeleteSelection={deleteSelection} interactionActiveRef={interactionActiveRef}/>
  </div>
}

function ExpandedHandwritingDialog({ editor, onClose }: { editor: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (event.target instanceof Element && event.target.closest('[data-confirm-dialog]')) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape, true)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [onClose])

  return <div className="handwriting-dialog-backdrop" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="handwriting-dialog" role="dialog" aria-modal="true" aria-labelledby="handwriting-dialog-title">
      <header><div><span>HANDWRITING NOTE</span><h2 id="handwriting-dialog-title">手写笔记</h2></div><button aria-label="完成并关闭" onClick={onClose}><X size={19}/><span>完成</span></button></header>
      {editor}
    </section>
  </div>
}

export default function QuestionNotePanel({ questionId, note, onChange, initialOpen = false }: QuestionNotePanelProps) {
  const value = note || EMPTY_NOTE
  const drawing = value.drawing || emptyHandwritingDrawing()
  const notePanelRef = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'text' | 'handwriting'>('handwriting')
  const [expanded, setExpanded] = useState(false)
  const [tool, setTool] = useState<HandwritingTool>('pen')
  const [shapePreferences, setShapePreferences] = useState(loadHandwritingPreferences)
  const { shape, shapeLineStyle, shapeFill, shapeFillColor, shapeFillOpacity } = shapePreferences
  const [color, setColor] = useState('#8f3028')
  const [size, setSize] = useState(2)
  const [past, setPast] = useState<HandwritingDrawing[]>([])
  const [future, setFuture] = useState<HandwritingDrawing[]>([])
  const [clearPending, setClearPending] = useState(false)
  const [canvasTrimPending, setCanvasTrimPending] = useState(false)

  useEffect(() => {
    setMode('handwriting')
    setExpanded(false)
    setOpen(initialOpen)
    setPast([])
    setFuture([])
    setCanvasTrimPending(false)
  }, [initialOpen, questionId])

  useEffect(() => {
    saveHandwritingPreferences(shapePreferences)
  }, [shapePreferences])

  const updateShapePreference = <Key extends keyof HandwritingPreferences>(key: Key, nextValue: HandwritingPreferences[Key]) => {
    setShapePreferences(previous => previous[key] === nextValue
      ? previous
      : { ...previous, [key]: nextValue })
  }

  const change = (next: Partial<Pick<QuestionNote, 'text' | 'drawing'>>) => onChange({
    text: next.text ?? value.text,
    drawing: next.drawing ?? drawing,
    updatedAt: new Date().toISOString(),
  })

  const commitDrawing = (next: HandwritingDrawing, canvasTrimIntent?: CanvasTrimIntent) => {
    setPast(previous => [...previous.slice(-49), drawing])
    setFuture([])
    if (canvasTrimIntent === 'defer') setCanvasTrimPending(true)
    change({ drawing: next })
  }

  useEffect(() => {
    if (!canvasTrimPending) return
    const trimCanvasWhenPointerLeaves = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      // The whole note panel is one editing surface. Tabs, tool popovers and
      // the expanded editor must not count as leaving it; only the first
      // pointer action outside the panel reclaims unused space.
      if (!target || notePanelRef.current?.contains(target)) return

      setCanvasTrimPending(false)
      const nextHeight = canvasHeightForStrokes(drawing.strokes)
      const currentHeight = canvasHeightForDrawing(drawing)
      if (nextHeight >= currentHeight) return
      change({ drawing: { ...drawing, aspectRatio: aspectRatioForCanvasHeight(nextHeight) } })
    }
    document.addEventListener('pointerdown', trimCanvasWhenPointerLeaves)
    return () => document.removeEventListener('pointerdown', trimCanvasWhenPointerLeaves)
  }, [canvasTrimPending, drawing])

  const undo = () => {
    const previous = past[past.length - 1]
    if (!previous) return
    setPast(items => items.slice(0, -1))
    setFuture(items => [drawing, ...items].slice(0, 50))
    setCanvasTrimPending(false)
    change({ drawing: previous })
  }
  const redo = () => {
    const next = future[0]
    if (!next) return
    setPast(items => [...items.slice(-49), drawing])
    setFuture(items => items.slice(1))
    setCanvasTrimPending(false)
    change({ drawing: next })
  }
  const clear = () => {
    if (!drawing.strokes.length) return
    setClearPending(true)
  }
  const confirmClear = () => {
    commitDrawing({ ...drawing, aspectRatio: aspectRatioForCanvasHeight(DRAWING_BASE_HEIGHT), strokes: [] })
    setCanvasTrimPending(false)
    setClearPending(false)
  }
  const editorProps = {
    drawing,
    tool,
    shape,
    shapeLineStyle,
    shapeFill,
    shapeFillColor: shapeFillColor || color,
    shapeFillOpacity,
    color,
    size,
    canUndo: Boolean(past.length),
    canRedo: Boolean(future.length),
    onToolChange: (nextTool: HandwritingTool) => {
      // Tool changes stay inside the note workspace, so the document-level
      // pointer guard prevents an immediate trim. Keep the pending state so
      // the canvas can still reclaim unused space after editing finishes.
      setTool(previous => previous === nextTool ? previous : nextTool)
    },
    onShapeChange: (nextShape: HandwritingShape) => updateShapePreference('shape', nextShape),
    onShapeLineStyleChange: (nextLineStyle: HandwritingShapeLineStyle) => updateShapePreference('shapeLineStyle', nextLineStyle),
    onShapeFillChange: (nextFill: boolean) => updateShapePreference('shapeFill', nextFill),
    onShapeFillColorChange: (nextFillColor: string) => updateShapePreference('shapeFillColor', nextFillColor),
    onShapeFillOpacityChange: (nextFillOpacity: number) => updateShapePreference('shapeFillOpacity', nextFillOpacity),
    onColorChange: setColor,
    onSizeChange: setSize,
    onCommit: commitDrawing,
    onUndo: undo,
    onRedo: redo,
    onClear: clear,
  }

  return <section ref={notePanelRef} className="question-note-section">
    <button className="passage-answer-toggle question-note-toggle" aria-expanded={open} onClick={() => setOpen(previous => {
      const next = !previous
      if (next) setMode('handwriting')
      return next
    })}>
      <NotebookPen size={17}/>{open ? '收起笔记' : '查看与编辑笔记'}{hasQuestionNote(note) && <em>已保存</em>}<ChevronDown className={open ? 'rotated' : ''} size={16}/>
    </button>
    {open && <div className="question-note-panel">
      <div className="question-note-tabs" role="tablist" aria-label="笔记类型">
        <button role="tab" aria-selected={mode === 'handwriting'} className={mode === 'handwriting' ? 'active' : ''} onClick={() => setMode('handwriting')}>手写笔记</button>
        <button role="tab" aria-selected={mode === 'text'} className={mode === 'text' ? 'active' : ''} onClick={() => setMode('text')}>文字笔记</button>
        <small>{value.updatedAt ? '已保存' : '自动保存'}</small>
      </div>
      {mode === 'text'
        ? <textarea aria-label="文字笔记" value={value.text} onChange={event => change({ text: event.target.value })} placeholder="记录思路、易错点、公式或复习提醒……"/>
        : <HandwritingEditor {...editorProps} onExpand={() => setExpanded(true)}/>}
    </div>}
    {expanded && <ExpandedHandwritingDialog onClose={() => setExpanded(false)} editor={<HandwritingEditor {...editorProps} expanded/>}/>}
    {clearPending && <ConfirmDialog title="清空这道题的手写笔记？" description="本题的全部手写笔迹将被删除，但可以使用撤销恢复。" onConfirm={confirmClear} onCancel={() => setClearPending(false)}/>}
  </section>
}
