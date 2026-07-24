import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { Eraser, GripVertical, Hand, Lasso, NotebookPen, Palette, Pencil, Redo2, RotateCcw, Trash2, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { loadDraftBook, saveDraftBook, type DraftBookData, type DraftBookPoint, type DraftBookSize, type DraftBookView, type DraftStroke } from './draftBook'
import ConfirmDialog from './ConfirmDialog'
import LassoDeleteIcon from './LassoDeleteIcon'

type InteractionMode = 'icon' | 'window' | 'resize'
type CanvasTool = 'pen' | 'eraser' | 'lasso' | 'pan'

interface Interaction {
  mode: InteractionMode
  startX: number
  startY: number
  startPosition: DraftBookPoint
  startSize: DraftBookSize
  moved: boolean
  previewPosition: DraftBookPoint
  previewSize: DraftBookSize
}

interface PendingInteractionPointer {
  clientX: number
  clientY: number
}

interface CurrentStroke {
  pointerId: number
  points: DraftBookPoint[]
}

interface CurrentPan {
  pointerId: number
  startX: number
  startY: number
  startView: DraftBookView
}

interface CurrentErase {
  pointerId: number
  baseStrokes: DraftStroke[]
  strokes: DraftStroke[]
}

interface CurrentSelectionMove {
  pointerId: number
  startPoint: DraftBookPoint
  baseStrokes: DraftStroke[]
  selectedIndexes: number[]
}

interface DraftSelectionBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const FAB_SIZE = 54
const WINDOW_GAP = 12
const MIN_WINDOW_WIDTH = 320
const MIN_WINDOW_HEIGHT = 260
const MIN_ZOOM = .35
const MAX_ZOOM = 3.2
const GRID_SIZE = 28
const ERASER_RADIUS = 12
const COMMON_INK_COLORS = [
  { value: '#2f2b28', label: '黑色' },
  { value: '#8f3028', label: '砖红' },
  { value: '#d39a22', label: '黄色' },
  { value: '#39805d', label: '绿色' },
  { value: '#3474a7', label: '蓝色' },
]

function viewportSize() {
  return { width: Math.max(320, window.innerWidth), height: Math.max(320, window.innerHeight) }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

function defaultIconPosition() {
  const viewport = viewportSize()
  return { x: viewport.width - FAB_SIZE - 20, y: viewport.height - FAB_SIZE - 104 }
}

function defaultWindowPosition(size: DraftBookSize) {
  const viewport = viewportSize()
  const width = Math.min(size.width, viewport.width - WINDOW_GAP * 2)
  return { x: viewport.width - width - 28, y: 94 }
}

function clampIconPosition(position: DraftBookPoint) {
  const viewport = viewportSize()
  return {
    x: clamp(position.x, WINDOW_GAP, viewport.width - FAB_SIZE - WINDOW_GAP),
    y: clamp(position.y, WINDOW_GAP, viewport.height - FAB_SIZE - WINDOW_GAP),
  }
}

function visibleWindowSize(size: DraftBookSize) {
  const viewport = viewportSize()
  return {
    width: Math.min(size.width, viewport.width - WINDOW_GAP * 2),
    height: Math.min(size.height, viewport.height - WINDOW_GAP * 2),
  }
}

function clampWindowPosition(position: DraftBookPoint, size: DraftBookSize) {
  const viewport = viewportSize()
  const visibleSize = visibleWindowSize(size)
  return {
    x: clamp(position.x, WINDOW_GAP, viewport.width - visibleSize.width - WINDOW_GAP),
    y: clamp(position.y, WINDOW_GAP, viewport.height - visibleSize.height - WINDOW_GAP),
  }
}

function resolveLayout(data: DraftBookData) {
  const iconPosition = data.iconPosition.x < 0 || data.iconPosition.y < 0 ? defaultIconPosition() : clampIconPosition(data.iconPosition)
  const windowPosition = data.windowPosition.x < 0 || data.windowPosition.y < 0
    ? clampWindowPosition(defaultWindowPosition(data.size), data.size)
    : clampWindowPosition(data.windowPosition, data.size)
  return { ...data, iconPosition, windowPosition }
}

function canvasMetrics(canvas: HTMLCanvasElement, view: DraftBookView) {
  const rect = canvas.getBoundingClientRect()
  const width = Math.max(rect.width, 1)
  const height = Math.max(rect.height, 1)
  const dpr = canvas.width > 0 ? canvas.width / width : Math.min(window.devicePixelRatio || 1, 2)
  const context = canvas.getContext('2d')
  if (!context) return null
  context.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, -view.x * dpr * view.zoom, -view.y * dpr * view.zoom)
  return { context, width, height, dpr }
}

function prepareCanvas(canvas: HTMLCanvasElement, view: DraftBookView) {
  const rect = canvas.getBoundingClientRect()
  const width = Math.max(rect.width, 1)
  const height = Math.max(rect.height, 1)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const pixelWidth = Math.max(1, Math.round(width * dpr))
  const pixelHeight = Math.max(1, Math.round(height * dpr))
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  return canvasMetrics(canvas, view)
}

function drawGrid(context: CanvasRenderingContext2D, view: DraftBookView, width: number, height: number) {
  const left = view.x
  const top = view.y
  const right = left + width / view.zoom
  const bottom = top + height / view.zoom
  const startX = Math.floor(left / GRID_SIZE) * GRID_SIZE
  const startY = Math.floor(top / GRID_SIZE) * GRID_SIZE
  context.strokeStyle = 'rgba(177, 142, 127, .13)'
  context.lineWidth = 1 / view.zoom
  context.beginPath()
  for (let x = startX; x <= right; x += GRID_SIZE) {
    context.moveTo(x, top)
    context.lineTo(x, bottom)
  }
  for (let y = startY; y <= bottom; y += GRID_SIZE) {
    context.moveTo(left, y)
    context.lineTo(right, y)
  }
  context.stroke()
}

function selectionBoundsForStrokes(strokes: DraftStroke[], selectedIndexes: number[]): DraftSelectionBounds | null {
  const points = selectedIndexes.flatMap(index => strokes[index]?.points || [])
  if (!points.length) return null
  return {
    minX: Math.min(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y)),
    maxX: Math.max(...points.map(point => point.x)),
    maxY: Math.max(...points.map(point => point.y)),
  }
}

function pointInSelectionBounds(point: DraftBookPoint, bounds: DraftSelectionBounds, padding = 8) {
  return point.x >= bounds.minX - padding && point.x <= bounds.maxX + padding && point.y >= bounds.minY - padding && point.y <= bounds.maxY + padding
}

function cross(left: DraftBookPoint, right: DraftBookPoint, point: DraftBookPoint) {
  return (right.x - left.x) * (point.y - left.y) - (right.y - left.y) * (point.x - left.x)
}

function segmentsIntersect(firstStart: DraftBookPoint, firstEnd: DraftBookPoint, secondStart: DraftBookPoint, secondEnd: DraftBookPoint) {
  const firstA = cross(firstStart, firstEnd, secondStart)
  const firstB = cross(firstStart, firstEnd, secondEnd)
  const secondA = cross(secondStart, secondEnd, firstStart)
  const secondB = cross(secondStart, secondEnd, firstEnd)
  const epsilon = .000001
  const onSegment = (start: DraftBookPoint, end: DraftBookPoint, point: DraftBookPoint, value: number) =>
    Math.abs(value) <= epsilon && Math.min(start.x, end.x) - epsilon <= point.x && point.x <= Math.max(start.x, end.x) + epsilon && Math.min(start.y, end.y) - epsilon <= point.y && point.y <= Math.max(start.y, end.y) + epsilon
  return (firstA > epsilon && firstB < -epsilon || firstA < -epsilon && firstB > epsilon) && (secondA > epsilon && secondB < -epsilon || secondA < -epsilon && secondB > epsilon)
    || onSegment(firstStart, firstEnd, secondStart, firstA)
    || onSegment(firstStart, firstEnd, secondEnd, firstB)
    || onSegment(secondStart, secondEnd, firstStart, secondA)
    || onSegment(secondStart, secondEnd, firstEnd, secondB)
}

function pointInPolygon(point: DraftBookPoint, polygon: DraftBookPoint[]) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index]
    const previousPoint = polygon[previous]
    if ((currentPoint.y > point.y) !== (previousPoint.y > point.y) && point.x < (previousPoint.x - currentPoint.x) * (point.y - currentPoint.y) / (previousPoint.y - currentPoint.y) + currentPoint.x) inside = !inside
  }
  return inside
}

function strokeIsInsideLasso(stroke: DraftStroke, polygon: DraftBookPoint[]) {
  if (polygon.length < 3 || !stroke.points.length) return false
  if (stroke.points.some(point => pointInPolygon(point, polygon))) return true
  return stroke.points.some((point, index) => {
    if (index === 0) return false
    return polygon.some((polygonPoint, polygonIndex) => segmentsIntersect(point, stroke.points[index - 1], polygonPoint, polygon[(polygonIndex + 1) % polygon.length]))
  })
}

function translateSelectedStrokes(strokes: DraftStroke[], selectedIndexes: number[], dx: number, dy: number) {
  const selected = new Set(selectedIndexes)
  return strokes.map((stroke, index) => selected.has(index)
    ? { ...stroke, points: stroke.points.map(point => ({ x: point.x + dx, y: point.y + dy })) }
    : stroke)
}

function traceDraftStroke(context: CanvasRenderingContext2D, points: DraftBookPoint[], pointRadius = 1.25) {
  const first = points[0]
  if (!first) return false
  context.beginPath()
  if (points.length === 1) {
    context.arc(first.x, first.y, pointRadius, 0, Math.PI * 2)
    return true
  }
  context.moveTo(first.x, first.y)
  if (points.length === 2) {
    context.lineTo(points[1].x, points[1].y)
    return true
  }
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const midpointX = (current.x + next.x) / 2
    const midpointY = (current.y + next.y) / 2
    context.quadraticCurveTo(current.x, current.y, midpointX, midpointY)
  }
  const last = points[points.length - 1]
  context.quadraticCurveTo(last.x, last.y, last.x, last.y)
  return true
}

function drawStrokes(canvas: HTMLCanvasElement, strokes: DraftStroke[], view: DraftBookView, selectedIndexes: number[] = [], lassoPoints: DraftBookPoint[] = []) {
  const metrics = prepareCanvas(canvas, view)
  if (!metrics) return
  const { context, width, height, dpr } = metrics
  const selected = new Set(selectedIndexes)
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, -view.x * dpr * view.zoom, -view.y * dpr * view.zoom)
  drawGrid(context, view, width, height)
  context.lineWidth = 2.4 / view.zoom
  context.lineCap = 'round'
  context.lineJoin = 'round'
  strokes.forEach((stroke, index) => {
    context.strokeStyle = stroke.color
    context.fillStyle = stroke.color
    const first = stroke.points[0]
    if (!first) return
    if (selected.has(index)) {
      context.strokeStyle = 'rgba(191, 129, 121, .55)'
      context.fillStyle = 'rgba(191, 129, 121, .55)'
      context.lineWidth = 7 / view.zoom
      traceDraftStroke(context, stroke.points, 2.8 / view.zoom)
      if (stroke.points.length === 1) {
        context.fill()
      }
      else context.stroke()
      context.lineWidth = 2.4 / view.zoom
      context.strokeStyle = stroke.color
    }
    if (stroke.points.length === 1) {
      traceDraftStroke(context, stroke.points, 1.25 / view.zoom)
      context.fill()
      return
    }
    traceDraftStroke(context, stroke.points)
    context.stroke()
  })
  const selectionBounds = selectionBoundsForStrokes(strokes, selectedIndexes)
  if (selectionBounds && selectedIndexes.length) {
    const padding = 8
    context.save()
    context.fillStyle = 'rgba(143, 48, 40, .045)'
    context.strokeStyle = '#a65349'
    context.lineWidth = 1.5 / view.zoom
    context.setLineDash([8 / view.zoom, 5 / view.zoom])
    context.fillRect(selectionBounds.minX - padding, selectionBounds.minY - padding, selectionBounds.maxX - selectionBounds.minX + padding * 2, selectionBounds.maxY - selectionBounds.minY + padding * 2)
    context.strokeRect(selectionBounds.minX - padding, selectionBounds.minY - padding, selectionBounds.maxX - selectionBounds.minX + padding * 2, selectionBounds.maxY - selectionBounds.minY + padding * 2)
    context.restore()
  }
  if (lassoPoints.length > 1) {
    context.save()
    context.fillStyle = 'rgba(143, 48, 40, .08)'
    context.strokeStyle = '#8f3028'
    context.lineWidth = 1.5 / view.zoom
    context.setLineDash([8 / view.zoom, 6 / view.zoom])
    context.beginPath()
    context.moveTo(lassoPoints[0].x, lassoPoints[0].y)
    lassoPoints.slice(1).forEach(point => context.lineTo(point.x, point.y))
    context.closePath()
    context.fill()
    context.stroke()
    context.restore()
  }
}

function drawStrokeDot(canvas: HTMLCanvasElement, point: DraftBookPoint, view: DraftBookView, color: string) {
  const metrics = canvasMetrics(canvas, view)
  if (!metrics) return
  const { context } = metrics
  context.fillStyle = color
  context.beginPath()
  context.arc(point.x, point.y, 1.25 / view.zoom, 0, Math.PI * 2)
  context.fill()
}

function pointFromPointer(event: PointerEvent, canvas: HTMLCanvasElement, view: DraftBookView) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: view.x + (event.clientX - rect.left) / view.zoom,
    y: view.y + (event.clientY - rect.top) / view.zoom,
  }
}

function distanceToSegment(point: DraftBookPoint, start: DraftBookPoint, end: DraftBookPoint) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const projection = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1)
  return Math.hypot(point.x - (start.x + projection * dx), point.y - (start.y + projection * dy))
}

function strokeIsHit(stroke: DraftStroke, point: DraftBookPoint, radius: number) {
  return stroke.points.some((current, index) => {
    const previous = stroke.points[index - 1]
    return distanceToSegment(point, previous || current, current) <= radius
  })
}

function eraseAt(point: DraftBookPoint, strokes: DraftStroke[], radius: number) {
  return strokes.filter(stroke => !strokeIsHit(stroke, point, radius))
}

function cloneStrokes(strokes: DraftStroke[]) {
  return strokes.map(stroke => ({ color: stroke.color, points: stroke.points.map(point => ({ ...point })) }))
}

type HistoryAction = 'undo' | 'redo'

function historyActionForShortcut(key: string, hasPrimaryModifier: boolean, shiftKey: boolean, altKey: boolean): HistoryAction | null {
  if (!hasPrimaryModifier || altKey) return null
  const normalizedKey = key.toLowerCase()
  if (normalizedKey === 'y' || (normalizedKey === 'z' && shiftKey)) return 'redo'
  if (normalizedKey === 'z') return 'undo'
  return null
}

function zoomAt(view: DraftBookView, factor: number, screenX: number, screenY: number) {
  const zoom = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM)
  const worldX = view.x + screenX / view.zoom
  const worldY = view.y + screenY / view.zoom
  return { x: worldX - screenX / zoom, y: worldY - screenY / zoom, zoom }
}

export default function DraftBook() {
  const [draft, setDraft] = useState<DraftBookData>(() => resolveLayout(loadDraftBook()))
  const [open, setOpen] = useState(false)
  const [tool, setTool] = useState<CanvasTool>('pen')
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [interaction, setInteraction] = useState<Interaction | null>(null)
  const [previewStrokes, setPreviewStrokes] = useState<DraftStroke[] | null>(null)
  const [transformPreviewStrokes, setTransformPreviewStrokes] = useState<DraftStroke[] | null>(null)
  const [lassoPoints, setLassoPoints] = useState<DraftBookPoint[]>([])
  const [selectedStrokeIndexes, setSelectedStrokeIndexes] = useState<number[]>([])
  const [clearPending, setClearPending] = useState(false)
  const [, setHistoryVersion] = useState(0)
  const interactionRef = useRef<Interaction | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draftFabRef = useRef<HTMLButtonElement>(null)
  const draftWindowRef = useRef<HTMLElement>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const currentStrokeRef = useRef<CurrentStroke | null>(null)
  const currentStrokePreviewFrameRef = useRef<number | null>(null)
  const currentPanRef = useRef<CurrentPan | null>(null)
  const currentEraseRef = useRef<CurrentErase | null>(null)
  const currentSelectionMoveRef = useRef<CurrentSelectionMove | null>(null)
  const lassoPointerIdRef = useRef<number | null>(null)
  const lassoPointsRef = useRef<DraftBookPoint[]>([])
  const pendingInteractionPointerRef = useRef<PendingInteractionPointer | null>(null)
  const interactionFrameRef = useRef<number | null>(null)
  const interactionPointerIdRef = useRef<number | null>(null)
  const interactionCaptureTargetRef = useRef<HTMLElement | null>(null)
  const undoStackRef = useRef<DraftStroke[][]>([])
  const redoStackRef = useRef<DraftStroke[][]>([])

  useEffect(() => {
    interactionRef.current = interaction
  }, [interaction])

  useEffect(() => {
    const updateLayout = () => setDraft(previous => ({ ...previous, iconPosition: clampIconPosition(previous.iconPosition), windowPosition: clampWindowPosition(previous.windowPosition, previous.size) }))
    window.addEventListener('resize', updateLayout)
    return () => window.removeEventListener('resize', updateLayout)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => saveDraftBook(draft), 260)
    return () => window.clearTimeout(timer)
  }, [draft])

  useEffect(() => {
    if (!colorPickerOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && colorPickerRef.current?.contains(target)) return
      setColorPickerOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [colorPickerOpen])

  useEffect(() => {
    if (!open) return
    const canvas = canvasRef.current
    if (!canvas) return
    const redraw = () => drawStrokes(canvas, transformPreviewStrokes || previewStrokes || draft.strokes, draft.canvasView, selectedStrokeIndexes, lassoPoints)
    redraw()
    canvas.focus()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(redraw)
    observer?.observe(canvas)
    window.addEventListener('resize', redraw)
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', redraw)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, draft.strokes, previewStrokes, transformPreviewStrokes, selectedStrokeIndexes, lassoPoints, draft.canvasView.x, draft.canvasView.y, draft.canvasView.zoom, draft.size.width, draft.size.height])

  useEffect(() => {
    if (!interaction) return
    const move = (event: PointerEvent) => {
      pendingInteractionPointerRef.current = { clientX: event.clientX, clientY: event.clientY }
      if (interactionFrameRef.current !== null) return
      interactionFrameRef.current = requestAnimationFrame(() => {
        interactionFrameRef.current = null
        const pointer = pendingInteractionPointerRef.current
        pendingInteractionPointerRef.current = null
        if (pointer) updateInteractionPreview(pointer.clientX, pointer.clientY)
      })
    }
    const end = (event?: Event) => {
      if (event && 'pointerId' in event && interactionPointerIdRef.current !== null && event.pointerId !== interactionPointerIdRef.current) return
      if (interactionFrameRef.current !== null) {
        cancelAnimationFrame(interactionFrameRef.current)
        interactionFrameRef.current = null
      }
      const pointer = pendingInteractionPointerRef.current
      pendingInteractionPointerRef.current = null
      if (pointer) updateInteractionPreview(pointer.clientX, pointer.clientY)
      const current = interactionRef.current
      if (current?.mode === 'icon' && !current.moved) setOpen(true)
      else if (current) {
        setDraft(previous => current.mode === 'icon'
          ? { ...previous, iconPosition: current.previewPosition }
          : current.mode === 'window'
            ? { ...previous, windowPosition: current.previewPosition }
            : { ...previous, size: current.previewSize, windowPosition: current.previewPosition })
      }
      interactionRef.current = null
      const pointerId = interactionPointerIdRef.current
      const captureTarget = interactionCaptureTargetRef.current
      if (pointerId !== null && captureTarget?.hasPointerCapture(pointerId)) captureTarget.releasePointerCapture(pointerId)
      interactionPointerIdRef.current = null
      interactionCaptureTargetRef.current = null
      setInteraction(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('blur', end)
    document.addEventListener('visibilitychange', end)
    return () => {
      if (interactionFrameRef.current !== null) cancelAnimationFrame(interactionFrameRef.current)
      interactionFrameRef.current = null
      pendingInteractionPointerRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('blur', end)
      document.removeEventListener('visibilitychange', end)
    }
  }, [interaction])

  function updateInteractionPreview(clientX: number, clientY: number) {
    const current = interactionRef.current
    if (!current) return
    const deltaX = clientX - current.startX
    const deltaY = clientY - current.startY
    current.moved = current.moved || Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4
    if (current.mode === 'icon') {
      current.previewPosition = clampIconPosition({ x: current.startPosition.x + deltaX, y: current.startPosition.y + deltaY })
      if (draftFabRef.current) {
        draftFabRef.current.style.left = `${current.previewPosition.x}px`
        draftFabRef.current.style.top = `${current.previewPosition.y}px`
      }
    } else if (current.mode === 'window') {
      current.previewPosition = clampWindowPosition({ x: current.startPosition.x + deltaX, y: current.startPosition.y + deltaY }, current.previewSize)
      if (draftWindowRef.current) {
        draftWindowRef.current.style.left = `${current.previewPosition.x}px`
        draftWindowRef.current.style.top = `${current.previewPosition.y}px`
      }
    } else {
      const viewport = viewportSize()
      const maxWidth = Math.max(MIN_WINDOW_WIDTH, viewport.width - WINDOW_GAP * 2)
      const maxHeight = Math.max(MIN_WINDOW_HEIGHT, viewport.height - WINDOW_GAP * 2)
      current.previewSize = {
        width: clamp(current.startSize.width + deltaX, MIN_WINDOW_WIDTH, Math.min(900, maxWidth)),
        height: clamp(current.startSize.height + deltaY, MIN_WINDOW_HEIGHT, Math.min(900, maxHeight)),
      }
      current.previewPosition = clampWindowPosition(current.startPosition, current.previewSize)
      if (draftWindowRef.current) {
        draftWindowRef.current.style.left = `${current.previewPosition.x}px`
        draftWindowRef.current.style.top = `${current.previewPosition.y}px`
        draftWindowRef.current.style.width = `${current.previewSize.width}px`
        draftWindowRef.current.style.height = `${current.previewSize.height}px`
      }
    }
  }

  function beginInteraction(event: ReactPointerEvent, mode: InteractionMode) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const startPosition = mode === 'icon' ? draft.iconPosition : draft.windowPosition
    const nextInteraction: Interaction = { mode, startX: event.clientX, startY: event.clientY, startPosition, startSize: draft.size, moved: false, previewPosition: startPosition, previewSize: draft.size }
    const captureTarget = event.currentTarget as HTMLElement
    interactionPointerIdRef.current = event.pointerId
    interactionCaptureTargetRef.current = captureTarget
    captureTarget.setPointerCapture(event.pointerId)
    interactionRef.current = nextInteraction
    setInteraction(nextInteraction)
  }

  function scheduleCurrentStrokeRedraw() {
    if (currentStrokePreviewFrameRef.current !== null) return
    currentStrokePreviewFrameRef.current = requestAnimationFrame(() => {
      currentStrokePreviewFrameRef.current = null
      const canvas = canvasRef.current
      const stroke = currentStrokeRef.current
      if (!canvas || !stroke) return
      drawStrokes(canvas, [...draft.strokes, { color: draft.color, points: stroke.points }], draft.canvasView)
    })
  }

  function commitStrokes(strokes: DraftStroke[]) {
    undoStackRef.current.push(cloneStrokes(draft.strokes))
    redoStackRef.current = []
    setHistoryVersion(version => version + 1)
    setDraft(previous => ({ ...previous, strokes }))
  }

  function undo() {
    const previous = undoStackRef.current.pop()
    if (!previous) return
    redoStackRef.current.push(cloneStrokes(draft.strokes))
    setHistoryVersion(version => version + 1)
    setDraft(previousDraft => ({ ...previousDraft, strokes: previous }))
    setSelectedStrokeIndexes([])
  }

  function redo() {
    const next = redoStackRef.current.pop()
    if (!next) return
    undoStackRef.current.push(cloneStrokes(draft.strokes))
    setHistoryVersion(version => version + 1)
    setDraft(previousDraft => ({ ...previousDraft, strokes: next }))
    setSelectedStrokeIndexes([])
  }

  function selectTool(nextTool: CanvasTool) {
    setTool(nextTool)
    if (nextTool !== 'lasso') {
      setSelectedStrokeIndexes([])
      setLassoPoints([])
    }
  }

  function deleteSelectedStrokes() {
    if (!selectedStrokeIndexes.length) return
    const selected = new Set(selectedStrokeIndexes)
    commitStrokes(draft.strokes.filter((_, index) => !selected.has(index)))
    setSelectedStrokeIndexes([])
  }

  function handleShortcutKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented) return
    if (event.key === 'Escape' && colorPickerOpen) {
      event.preventDefault()
      event.stopPropagation()
      setColorPickerOpen(false)
      return
    }
    const target = event.target as HTMLElement
    if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
    const historyAction = historyActionForShortcut(event.key, event.metaKey || event.ctrlKey, event.shiftKey, event.altKey)
    if (historyAction) {
      event.preventDefault()
      event.stopPropagation()
      if (historyAction === 'undo') undo()
      else redo()
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedStrokeIndexes.length && tool === 'lasso') {
      event.preventDefault()
      deleteSelectedStrokes()
      return
    }
    const shortcutTool: Record<string, CanvasTool> = { '1': 'eraser', '2': 'pen', '3': 'lasso' }
    const nextTool = shortcutTool[event.key]
    if (!nextTool) return
    event.preventDefault()
    event.stopPropagation()
    selectTool(nextTool)
  }

  function beginCanvasPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 && event.pointerType !== 'touch') return
    const canvas = canvasRef.current
    if (!canvas) return
    event.preventDefault()
    event.stopPropagation()
    canvas.focus({ preventScroll: true })
    const shouldPan = tool === 'pan' || event.button === 1 || event.button === 2 || event.shiftKey || event.altKey
    if (shouldPan) {
      currentPanRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startView: draft.canvasView }
      canvas.setPointerCapture(event.pointerId)
      return
    }
    const point = pointFromPointer(event.nativeEvent, canvas, draft.canvasView)
    if (tool === 'lasso') {
      const selectionBounds = selectionBoundsForStrokes(draft.strokes, selectedStrokeIndexes)
      if (selectionBounds && pointInSelectionBounds(point, selectionBounds)) {
        currentSelectionMoveRef.current = { pointerId: event.pointerId, startPoint: point, baseStrokes: draft.strokes, selectedIndexes: selectedStrokeIndexes }
        canvas.setPointerCapture(event.pointerId)
        return
      }
      lassoPointerIdRef.current = event.pointerId
      lassoPointsRef.current = [point]
      setLassoPoints([point])
      canvas.setPointerCapture(event.pointerId)
      return
    }
    if (tool === 'eraser') {
      const strokes = eraseAt(point, draft.strokes, ERASER_RADIUS / draft.canvasView.zoom)
      currentEraseRef.current = { pointerId: event.pointerId, baseStrokes: draft.strokes, strokes }
      setPreviewStrokes(strokes)
      canvas.setPointerCapture(event.pointerId)
      return
    }
    currentStrokeRef.current = { pointerId: event.pointerId, points: [point] }
    canvas.setPointerCapture(event.pointerId)
    drawStrokeDot(canvas, point, draft.canvasView, draft.color)
  }

  function continueCanvasPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.stopPropagation()
    const canvas = canvasRef.current
    const pan = currentPanRef.current
    if (pan && pan.pointerId === event.pointerId && canvas) {
      event.preventDefault()
      const deltaX = event.clientX - pan.startX
      const deltaY = event.clientY - pan.startY
      setDraft(previous => ({ ...previous, canvasView: { ...previous.canvasView, x: pan.startView.x - deltaX / pan.startView.zoom, y: pan.startView.y - deltaY / pan.startView.zoom } }))
      return
    }
    const selectionMove = currentSelectionMoveRef.current
    if (selectionMove && selectionMove.pointerId === event.pointerId && canvas) {
      event.preventDefault()
      const point = pointFromPointer(event.nativeEvent, canvas, draft.canvasView)
      const next = translateSelectedStrokes(selectionMove.baseStrokes, selectionMove.selectedIndexes, point.x - selectionMove.startPoint.x, point.y - selectionMove.startPoint.y)
      setTransformPreviewStrokes(next)
      return
    }
    if (lassoPointerIdRef.current === event.pointerId && canvas) {
      event.preventDefault()
      const point = pointFromPointer(event.nativeEvent, canvas, draft.canvasView)
      const previous = lassoPointsRef.current.at(-1)
      if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 3 / draft.canvasView.zoom) {
        lassoPointsRef.current = [...lassoPointsRef.current, point]
        setLassoPoints(lassoPointsRef.current)
      }
      return
    }
    const eraser = currentEraseRef.current
    if (eraser && eraser.pointerId === event.pointerId && canvas) {
      event.preventDefault()
      const point = pointFromPointer(event.nativeEvent, canvas, draft.canvasView)
      const next = eraseAt(point, eraser.strokes, ERASER_RADIUS / draft.canvasView.zoom)
      if (next.length !== eraser.strokes.length) {
        eraser.strokes = next
        setPreviewStrokes(next)
      }
      return
    }
    const current = currentStrokeRef.current
    if (!current || current.pointerId !== event.pointerId || !canvas) return
    event.preventDefault()
    const point = pointFromPointer(event.nativeEvent, canvas, draft.canvasView)
    const previous = current.points[current.points.length - 1]
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) < 0.001) return
    current.points.push(point)
    scheduleCurrentStrokeRedraw()
  }

  function finishCanvasPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.stopPropagation()
    const canvas = canvasRef.current
    const pan = currentPanRef.current
    if (pan && pan.pointerId === event.pointerId && canvas) {
      event.preventDefault()
      currentPanRef.current = null
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      return
    }
    const selectionMove = currentSelectionMoveRef.current
    if (selectionMove && selectionMove.pointerId === event.pointerId && canvas) {
      event.preventDefault()
      currentSelectionMoveRef.current = null
      if (transformPreviewStrokes && transformPreviewStrokes !== selectionMove.baseStrokes) commitStrokes(transformPreviewStrokes)
      setTransformPreviewStrokes(null)
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      return
    }
    if (lassoPointerIdRef.current === event.pointerId && canvas) {
      event.preventDefault()
      const polygon = lassoPointsRef.current
      setSelectedStrokeIndexes(draft.strokes.flatMap((stroke, index) => strokeIsInsideLasso(stroke, polygon) ? [index] : []))
      lassoPointerIdRef.current = null
      lassoPointsRef.current = []
      setLassoPoints([])
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      return
    }
    const eraser = currentEraseRef.current
    if (eraser && eraser.pointerId === event.pointerId && canvas) {
      event.preventDefault()
      currentEraseRef.current = null
      setPreviewStrokes(null)
      if (eraser.strokes.length !== eraser.baseStrokes.length) commitStrokes(eraser.strokes)
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      return
    }
    const current = currentStrokeRef.current
    if (!current || current.pointerId !== event.pointerId || !canvas) return
    event.preventDefault()
    if (currentStrokePreviewFrameRef.current !== null) {
      cancelAnimationFrame(currentStrokePreviewFrameRef.current)
      currentStrokePreviewFrameRef.current = null
    }
    currentStrokeRef.current = null
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    const stroke: DraftStroke = { color: draft.color, points: current.points.map(point => ({ ...point })) }
    commitStrokes([...draft.strokes, stroke])
  }

  function zoomCanvas(factor: number) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    setDraft(previous => ({ ...previous, canvasView: zoomAt(previous.canvasView, factor, rect.width / 2, rect.height / 2) }))
  }

  function handleCanvasWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    event.preventDefault()
    event.stopPropagation()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * .0015)
      setDraft(previous => ({ ...previous, canvasView: zoomAt(previous.canvasView, factor, event.clientX - rect.left, event.clientY - rect.top) }))
      return
    }
    setDraft(previous => ({ ...previous, canvasView: { ...previous.canvasView, x: previous.canvasView.x + event.deltaX / previous.canvasView.zoom, y: previous.canvasView.y + event.deltaY / previous.canvasView.zoom } }))
  }

  function resetCanvasView() {
    setDraft(previous => ({ ...previous, canvasView: { x: 0, y: 0, zoom: 1 } }))
  }

  function selectColor(color: string) {
    setDraft(previous => ({ ...previous, color }))
    setColorPickerOpen(false)
  }

  function clearDraft() {
    if (!draft.strokes.length) return
    setSelectedStrokeIndexes([])
    setClearPending(true)
  }

  function confirmClearDraft() {
    commitStrokes([])
    setClearPending(false)
  }

  const visibleSize = visibleWindowSize(draft.size)
  const zoomPercent = Math.round(draft.canvasView.zoom * 100)
  return <>
    <button
      ref={draftFabRef}
      className="draftbook-fab"
      type="button"
      aria-label="打开草稿本"
      title="草稿本（可拖动）"
      style={{ left: draft.iconPosition.x, top: draft.iconPosition.y }}
      onPointerDown={event => beginInteraction(event, 'icon')}
    >
      <NotebookPen aria-hidden="true"/>
      <span className="draftbook-fab-hint">草稿本</span>
    </button>
    {open && <section
      ref={draftWindowRef}
      className="draftbook-window"
      role="dialog"
      aria-modal="false"
      aria-label="无限手写草稿本"
      style={{ left: draft.windowPosition.x, top: draft.windowPosition.y, width: visibleSize.width, height: visibleSize.height }}
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={handleShortcutKeyDown}
    >
      <div className="draftbook-toolbar" onPointerDown={event => beginInteraction(event, 'window')}>
        <span className="draftbook-drag-grip" aria-label="拖动移动草稿本"><GripVertical aria-hidden="true"/></span>
        <div className="draftbook-tool-actions">
          <button className={tool === 'eraser' ? 'active' : ''} type="button" aria-label="橡皮擦" aria-keyshortcuts="1" title="橡皮擦（快捷键 1）" onPointerDown={event => event.stopPropagation()} onClick={() => selectTool('eraser')}><Eraser/></button>
          <button className={tool === 'pen' ? 'active' : ''} type="button" aria-label="画笔" aria-keyshortcuts="2" title="画笔（快捷键 2）" onPointerDown={event => event.stopPropagation()} onClick={() => selectTool('pen')}><Pencil/></button>
          <button className={tool === 'lasso' ? 'active' : ''} type="button" aria-label="套索选择" aria-keyshortcuts="3" title="套索选择（快捷键 3）" onPointerDown={event => event.stopPropagation()} onClick={() => selectTool('lasso')}><Lasso/></button>
          <button className={tool === 'pan' ? 'active' : ''} type="button" aria-label={tool === 'pan' ? '切换为画笔' : '移动画布'} title={tool === 'pan' ? '切换为画笔' : '移动画布'} onPointerDown={event => event.stopPropagation()} onClick={() => selectTool(tool === 'pan' ? 'pen' : 'pan')}>{tool === 'pan' ? <Pencil/> : <Hand/>}</button>
          <div ref={colorPickerRef} className="draftbook-color-picker" role="group" aria-label="笔迹颜色" onPointerDown={event => event.stopPropagation()}>
            <button
              className="draftbook-color-current"
              type="button"
              aria-label={`当前颜色：${draft.color}`}
              aria-expanded={colorPickerOpen}
              title="选择笔迹颜色"
              onClick={() => setColorPickerOpen(previous => !previous)}
            >
              <Palette aria-hidden="true"/>
              <span className="draftbook-color-indicator" aria-hidden="true" style={{ backgroundColor: draft.color }}/>
            </button>
            {colorPickerOpen && <div className="draftbook-color-options">
              {COMMON_INK_COLORS.filter(color => color.value !== draft.color.toLowerCase()).map(color => <button
                className="draftbook-color-button"
                key={color.value}
                type="button"
                aria-label={color.label}
                title={color.label}
                style={{ backgroundColor: color.value }}
                onClick={() => selectColor(color.value)}
              />)}
            </div>}
          </div>
          <button type="button" aria-label="缩小画布" title="缩小画布" onPointerDown={event => event.stopPropagation()} onClick={() => zoomCanvas(.82)}><ZoomOut/></button>
          <span className="draftbook-zoom-value" aria-label={`当前缩放 ${zoomPercent}%`}>{zoomPercent}%</span>
          <button type="button" aria-label="放大画布" title="放大画布" onPointerDown={event => event.stopPropagation()} onClick={() => zoomCanvas(1.22)}><ZoomIn/></button>
          <button type="button" aria-label="重置画布视图" title="重置画布视图" onPointerDown={event => event.stopPropagation()} onClick={resetCanvasView}><RotateCcw/></button>
          <button type="button" aria-label="撤销" aria-keyshortcuts="Control+Z Meta+Z" title="撤销（Ctrl/⌘+Z）" disabled={!undoStackRef.current.length} onPointerDown={event => event.stopPropagation()} onClick={undo}><Undo2/></button>
          <button type="button" aria-label="重做" aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Shift+Z" title="重做（Ctrl/⌘+Shift+Z 或 Ctrl+Y）" disabled={!redoStackRef.current.length} onPointerDown={event => event.stopPropagation()} onClick={redo}><Redo2/></button>
          <button type="button" aria-label="删除选中笔迹" title="删除选中笔迹（Delete）" disabled={!selectedStrokeIndexes.length} onPointerDown={event => event.stopPropagation()} onClick={deleteSelectedStrokes}><LassoDeleteIcon/></button>
          <button type="button" aria-label="清空手写内容" title="清空手写内容" onPointerDown={event => event.stopPropagation()} onClick={clearDraft}><Trash2/></button>
          <button type="button" aria-label="关闭草稿本" title="关闭" onPointerDown={event => event.stopPropagation()} onClick={() => setOpen(false)}><X/></button>
        </div>
      </div>
      <div className="draftbook-canvas-wrap">
        <canvas
          ref={canvasRef}
          className={`draftbook-canvas draftbook-canvas-${tool}`}
          role="img"
          tabIndex={0}
          aria-label="无限手写草稿区"
          onPointerDown={beginCanvasPointer}
          onPointerMove={continueCanvasPointer}
          onPointerUp={finishCanvasPointer}
          onPointerCancel={finishCanvasPointer}
          onWheel={handleCanvasWheel}
          onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}
        />
      </div>
      <button className="draftbook-resize-handle" type="button" aria-label="调整草稿本大小" onPointerDown={event => beginInteraction(event, 'resize')} />
    </section>}
    {clearPending && <ConfirmDialog title="清空手写内容？" description="当前草稿本中的全部笔迹将被删除，但可以使用撤销恢复。" onConfirm={confirmClearDraft} onCancel={() => setClearPending(false)}/>}
  </>
}
