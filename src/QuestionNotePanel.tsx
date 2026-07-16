import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ChevronDown, Eraser, Maximize2, NotebookPen, Pencil, Redo2, Trash2, Undo2, X } from 'lucide-react'
import { emptyHandwritingDrawing, emptyQuestionNote, eraseHandwritingStrokes, hasQuestionNote, type HandwritingDrawing, type HandwritingPoint, type HandwritingStroke, type QuestionNote } from './questionNotes'

interface QuestionNotePanelProps {
  questionId: string
  note?: QuestionNote
  onChange: (note: QuestionNote) => void
}

interface HandwritingCanvasProps {
  drawing: HandwritingDrawing
  tool: 'pen' | 'eraser'
  color: string
  size: number
  expanded?: boolean
  onCommit: (drawing: HandwritingDrawing) => void
}

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
const drawingPoint = (point: HandwritingPoint) => ({ x: point.x * 1000, y: point.y * 600 })
const midpoint = (left: HandwritingPoint, right: HandwritingPoint) => ({
  x: (left.x + right.x) * 500,
  y: (left.y + right.y) * 300,
})

export function pathsForStroke(stroke: HandwritingStroke) {
  if (stroke.points.length < 2) {
    const point = drawingPoint(stroke.points[0])
    return [{ d: `M ${point.x} ${point.y} l .01 0`, width: stroke.size }]
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
    const distance = Math.hypot(next.x - previous.x, next.y - previous.y)
    const simulatedPressure = Math.min(.78, Math.max(.28, .82 - distance * 9))
    const recordedPressure = point.pressure ?? .5
    const pressure = stroke.input === 'pen' ? recordedPressure : simulatedPressure
    const taper = Math.min(1, .45 + Math.min(index, lastIndex - index) * .28)
    const widthFactor = (stroke.input === 'pen' ? .42 + pressure * 1.18 : .5 + pressure) * taper
    const level = INK_WIDTH_LEVELS.reduce((best, value, levelIndex) =>
      Math.abs(value - widthFactor) < Math.abs(INK_WIDTH_LEVELS[best] - widthFactor) ? levelIndex : best, 0)
    paths[level] += `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y} `
  }
  return paths.map((d, index) => ({ d, width: stroke.size * INK_WIDTH_LEVELS[index] })).filter(path => path.d)
}

function HandwritingCanvas({ drawing, tool, color, size, expanded, onCommit }: HandwritingCanvasProps) {
  const [currentStroke, setCurrentStroke] = useState<HandwritingStroke | null>(null)
  const [erasingStrokes, setErasingStrokes] = useState<HandwritingStroke[] | null>(null)
  const currentStrokeRef = useRef<HandwritingStroke | null>(null)
  const erasingStrokesRef = useRef<HandwritingStroke[] | null>(null)
  const activePointerRef = useRef<number | null>(null)
  const activeToolRef = useRef<'pen' | 'eraser'>(tool)
  const penDetectedRef = useRef(false)
  const smoothedPressureRef = useRef<number | null>(null)
  const previewFrameRef = useRef<number | null>(null)

  useEffect(() => {
    if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current)
    previewFrameRef.current = null
    currentStrokeRef.current = null
    erasingStrokesRef.current = null
    activePointerRef.current = null
    smoothedPressureRef.current = null
    setCurrentStroke(null)
    setErasingStrokes(null)
  }, [drawing])

  const pointsFromEvent = (event: ReactPointerEvent<SVGSVGElement>): HandwritingPoint[] => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const drawingRatio = 5 / 3
    const boundsRatio = bounds.width / bounds.height
    const contentWidth = boundsRatio > drawingRatio ? bounds.height * drawingRatio : bounds.width
    const contentHeight = boundsRatio > drawingRatio ? bounds.height : bounds.width / drawingRatio
    const offsetX = (bounds.width - contentWidth) / 2
    const offsetY = (bounds.height - contentHeight) / 2
    const coalescedEvents = event.nativeEvent.getCoalescedEvents?.()
    const nativeEvents = coalescedEvents?.length ? coalescedEvents : [event.nativeEvent]
    return nativeEvents.map(pointerEvent => {
      let pressure = pointerEvent.pressure || .5
      if (event.pointerType === 'pen') {
        const rawPressure = pointerEvent.pressure > 0 ? pointerEvent.pressure : smoothedPressureRef.current ?? .06
        const curvedPressure = Math.pow(Math.min(1, Math.max(.01, rawPressure)), 1 / 1.15)
        pressure = smoothedPressureRef.current === null
          ? curvedPressure
          : smoothedPressureRef.current * .24 + curvedPressure * .76
        smoothedPressureRef.current = pressure
      }
      return {
        x: Math.min(1, Math.max(0, (pointerEvent.clientX - bounds.left - offsetX) / contentWidth)),
        y: Math.min(1, Math.max(0, (pointerEvent.clientY - bounds.top - offsetY) / contentHeight)),
        pressure,
      }
    })
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

  const start = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (activePointerRef.current !== null) return
    if (event.pointerType === 'pen') penDetectedRef.current = true
    if (event.pointerType === 'touch' && penDetectedRef.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointerRef.current = event.pointerId
    smoothedPressureRef.current = null
    activeToolRef.current = event.pointerType === 'pen' && (event.button === 5 || (event.buttons & 32) !== 0) ? 'eraser' : tool
    const point = pointsFromEvent(event).at(-1)!
    if (activeToolRef.current === 'eraser') {
      const next = eraseAt(point, drawing.strokes)
      erasingStrokesRef.current = next
      setErasingStrokes(next)
      return
    }
    const input = event.pointerType === 'pen' || event.pointerType === 'touch' ? event.pointerType : 'mouse'
    const stroke: HandwritingStroke = { id: newStrokeId(), color, size, input, points: [point] }
    currentStrokeRef.current = stroke
    setCurrentStroke(stroke)
  }

  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (activePointerRef.current !== event.pointerId) return
    if (event.pointerType === 'pen') penDetectedRef.current = true
    event.preventDefault()
    const points = pointsFromEvent(event)
    if (activeToolRef.current === 'eraser') {
      const next = points.reduce((strokes, point) => eraseAt(point, strokes), erasingStrokesRef.current || drawing.strokes)
      erasingStrokesRef.current = next
      updatePreviewOnNextFrame()
      return
    }
    const stroke = currentStrokeRef.current
    if (!stroke) return
    const appended = points.reduce<HandwritingPoint[]>((result, point) => {
      const previous = result[result.length - 1] || stroke.points[stroke.points.length - 1]
      return pointDistance(previous, point) < .0007 ? result : [...result, point]
    }, [])
    if (!appended.length) return
    const next = { ...stroke, points: [...stroke.points, ...appended] }
    currentStrokeRef.current = next
    updatePreviewOnNextFrame()
  }

  const finish = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (activePointerRef.current !== event.pointerId) return
    event.preventDefault()
    if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current)
    previewFrameRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    activePointerRef.current = null
    smoothedPressureRef.current = null
    if (activeToolRef.current === 'eraser') {
      const strokes = erasingStrokesRef.current
      if (strokes && strokes.length !== drawing.strokes.length) onCommit({ ...drawing, strokes })
      erasingStrokesRef.current = null
      setErasingStrokes(null)
      return
    }
    const stroke = currentStrokeRef.current
    if (stroke) onCommit({ ...drawing, strokes: [...drawing.strokes, stroke] })
    currentStrokeRef.current = null
    setCurrentStroke(null)
  }

  const visibleStrokes = erasingStrokes || drawing.strokes
  return <div className={expanded ? 'handwriting-canvas expanded' : 'handwriting-canvas'}>
    <svg
      role="img"
      aria-label={tool === 'pen' ? '手写笔记画布，当前为画笔' : '手写笔记画布，当前为橡皮擦'}
      viewBox="0 0 1000 600"
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      <title>手写笔记画布</title>
      {visibleStrokes.flatMap(stroke => pathsForStroke(stroke).map((path, index) => <path key={`${stroke.id}-${index}`} d={path.d} fill="none" stroke={stroke.color} strokeWidth={path.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>))}
      {currentStroke && pathsForStroke(currentStroke).map((path, index) => <path key={index} d={path.d} fill="none" stroke={currentStroke.color} strokeWidth={path.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>)}
    </svg>
    {!visibleStrokes.length && !currentStroke && <span>在这里书写，支持触控笔、触摸和鼠标</span>}
  </div>
}

interface HandwritingEditorProps {
  drawing: HandwritingDrawing
  tool: 'pen' | 'eraser'
  color: string
  size: number
  expanded?: boolean
  canUndo: boolean
  canRedo: boolean
  onToolChange: (tool: 'pen' | 'eraser') => void
  onColorChange: (color: string) => void
  onSizeChange: (size: number) => void
  onCommit: (drawing: HandwritingDrawing) => void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onExpand?: () => void
}

function HandwritingEditor(props: HandwritingEditorProps) {
  return <div className={props.expanded ? 'handwriting-editor expanded' : 'handwriting-editor'}>
    <div className="handwriting-toolbar" role="toolbar" aria-label="手写工具">
      <button className={props.tool === 'pen' ? 'active' : ''} aria-label="画笔" title="画笔" onClick={() => props.onToolChange('pen')}><Pencil size={15}/><span>画笔</span></button>
      <button className={props.tool === 'eraser' ? 'active' : ''} aria-label="橡皮擦" title="橡皮擦" onClick={() => props.onToolChange('eraser')}><Eraser size={15}/><span>橡皮</span></button>
      <div className="handwriting-colors" role="group" aria-label="笔迹颜色">
        <span>颜色</span>
        <div className="handwriting-swatches">
          {COMMON_INK_COLORS.map(item => <button
            key={item.value}
            type="button"
            className={props.color.toLowerCase() === item.value ? 'selected' : ''}
            aria-label={item.label}
            aria-pressed={props.color.toLowerCase() === item.value}
            title={item.label}
            style={{ '--ink-color': item.value } as CSSProperties}
            onClick={() => props.onColorChange(item.value)}
          />)}
        </div>
        <label className="handwriting-custom-color" title="自定义颜色">
          <input aria-label="自定义笔迹颜色" type="color" value={props.color} onChange={event => props.onColorChange(event.target.value)}/>
          <span>自定义</span>
        </label>
      </div>
      <label className="handwriting-size"><span>粗细</span><input aria-label="笔迹粗细" type="range" min="1" max="12" value={props.size} onChange={event => props.onSizeChange(Number(event.target.value))}/><output aria-label={`当前笔迹粗细 ${props.size}`}>{props.size}</output></label>
      <span className="handwriting-toolbar-spacer"/>
      <button aria-label="撤销" title="撤销" disabled={!props.canUndo} onClick={props.onUndo}><Undo2 size={15}/></button>
      <button aria-label="重做" title="重做" disabled={!props.canRedo} onClick={props.onRedo}><Redo2 size={15}/></button>
      <button aria-label="清空手写" title="清空手写" disabled={!props.drawing.strokes.length} onClick={props.onClear}><Trash2 size={15}/></button>
      {props.onExpand && <button className="handwriting-expand" onClick={props.onExpand}><Maximize2 size={15}/><span>放大书写</span></button>}
    </div>
    <HandwritingCanvas drawing={props.drawing} tool={props.tool} color={props.color} size={props.size} expanded={props.expanded} onCommit={props.onCommit}/>
  </div>
}

function ExpandedHandwritingDialog({ editor, onClose }: { editor: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
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

  return <div className="handwriting-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="handwriting-dialog" role="dialog" aria-modal="true" aria-labelledby="handwriting-dialog-title">
      <header><div><span>HANDWRITING NOTE</span><h2 id="handwriting-dialog-title">手写笔记</h2></div><button aria-label="完成并关闭" onClick={onClose}><X size={19}/><span>完成</span></button></header>
      {editor}
    </section>
  </div>
}

export default function QuestionNotePanel({ questionId, note, onChange }: QuestionNotePanelProps) {
  const value = note || EMPTY_NOTE
  const drawing = value.drawing || emptyHandwritingDrawing()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'text' | 'handwriting'>('text')
  const [expanded, setExpanded] = useState(false)
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [color, setColor] = useState('#8f3028')
  const [size, setSize] = useState(3)
  const [past, setPast] = useState<HandwritingDrawing[]>([])
  const [future, setFuture] = useState<HandwritingDrawing[]>([])

  useEffect(() => {
    setExpanded(false)
    setPast([])
    setFuture([])
  }, [questionId])

  const change = (next: Partial<Pick<QuestionNote, 'text' | 'drawing'>>) => onChange({
    text: next.text ?? value.text,
    drawing: next.drawing ?? drawing,
    updatedAt: new Date().toISOString(),
  })

  const commitDrawing = (next: HandwritingDrawing) => {
    setPast(previous => [...previous.slice(-49), drawing])
    setFuture([])
    change({ drawing: next })
  }
  const undo = () => {
    const previous = past[past.length - 1]
    if (!previous) return
    setPast(items => items.slice(0, -1))
    setFuture(items => [drawing, ...items].slice(0, 50))
    change({ drawing: previous })
  }
  const redo = () => {
    const next = future[0]
    if (!next) return
    setPast(items => [...items.slice(-49), drawing])
    setFuture(items => items.slice(1))
    change({ drawing: next })
  }
  const clear = () => {
    if (!drawing.strokes.length || !window.confirm('确定清空这道题的全部手写笔记吗？')) return
    commitDrawing({ ...drawing, strokes: [] })
  }
  const editorProps = {
    drawing,
    tool,
    color,
    size,
    canUndo: Boolean(past.length),
    canRedo: Boolean(future.length),
    onToolChange: setTool,
    onColorChange: setColor,
    onSizeChange: setSize,
    onCommit: commitDrawing,
    onUndo: undo,
    onRedo: redo,
    onClear: clear,
  }

  return <section className="question-note-section">
    <button className="passage-answer-toggle question-note-toggle" aria-expanded={open} onClick={() => setOpen(previous => !previous)}>
      <NotebookPen size={17}/>{open ? '收起笔记' : '查看与编辑笔记'}{hasQuestionNote(note) && <em>已保存</em>}<ChevronDown className={open ? 'rotated' : ''} size={16}/>
    </button>
    {open && <div className="question-note-panel">
      <div className="question-note-tabs" role="tablist" aria-label="笔记类型">
        <button role="tab" aria-selected={mode === 'text'} className={mode === 'text' ? 'active' : ''} onClick={() => setMode('text')}>文字笔记</button>
        <button role="tab" aria-selected={mode === 'handwriting'} className={mode === 'handwriting' ? 'active' : ''} onClick={() => setMode('handwriting')}>手写笔记</button>
        <small>{value.updatedAt ? '已自动保存' : '输入或书写后自动保存'}</small>
      </div>
      {mode === 'text'
        ? <textarea aria-label="文字笔记" value={value.text} onChange={event => change({ text: event.target.value })} placeholder="记录思路、易错点、公式或复习提醒……"/>
        : <HandwritingEditor {...editorProps} onExpand={() => setExpanded(true)}/>}
    </div>}
    {expanded && <ExpandedHandwritingDialog onClose={() => setExpanded(false)} editor={<HandwritingEditor {...editorProps} expanded/>}/>}
  </section>
}
