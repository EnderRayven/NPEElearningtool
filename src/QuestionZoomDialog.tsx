import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject, type WheelEvent as ReactWheelEvent } from 'react'
import { Move, RotateCw, Ruler, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import AssetGallery from './AssetGallery'
import type { QuestionImageSource } from './questionImages'
import type { Question } from './types'
import { useDialogFocus } from './useDialogFocus'
import { useModalScrollLock } from './useModalScrollLock'

interface QuestionZoomDialogProps {
  question: Question
  imageSource: QuestionImageSource
  onClose: () => void
}

type Point = { x: number; y: number }
type ProtractorColor = '#9f2e25' | '#276c8e' | '#4f5963'
type ProtractorInteraction = { kind: 'move' | 'rotate' | 'resize' | 'pin'; input: 'pointer' | 'mouse'; pinIndex?: number; pointerOffset?: Point; lastPointerAngle?: number; radiusOffset?: number }
type ProtractorHandle = 'center' | 'left' | 'right' | 'resize'

interface ProtractorState {
  center: Point
  radius: number
  rotation: number
  pins: Point[]
}

const PROTRACTOR_VIEWBOX = { centerX: 200, centerY: 200, arcRadius: 180 }
const PROTRACTOR_INNER_RADIUS = 126
const PROTRACTOR_MIN_RADIUS = 105
const PROTRACTOR_DEFAULT_RADIUS = 250
const PROTRACTOR_MAX_RADIUS = 360
const PROTRACTOR_PIN_LIMIT = 3
const QUESTION_ZOOM_MIN = .6
const QUESTION_ZOOM_MAX = 4
const QUESTION_ZOOM_STEP = .1
const PROTRACTOR_COLORS: Array<{ value: ProtractorColor; label: string }> = [
  { value: '#9f2e25', label: '砖红' },
  { value: '#276c8e', label: '蓝色' },
  { value: '#4f5963', label: '深灰' },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function degreesToRadians(degrees: number) {
  return degrees * Math.PI / 180
}

function normalizedAngle(degrees: number) {
  return ((degrees % 360) + 360) % 360
}

function protractorPoint(angle: number, radius = PROTRACTOR_VIEWBOX.arcRadius): Point {
  const radians = degreesToRadians(angle)
  return {
    x: PROTRACTOR_VIEWBOX.centerX + radius * Math.cos(radians),
    y: PROTRACTOR_VIEWBOX.centerY - radius * Math.sin(radians),
  }
}

function directionAngleForPoint(point: Point, center: Point, rotation: number) {
  const worldAngle = Math.atan2(-(point.y - center.y), point.x - center.x) * 180 / Math.PI
  return normalizedAngle(worldAngle - rotation)
}

function smallestAngleBetween(first: number, second: number) {
  const difference = Math.abs(first - second)
  return Math.round(Math.min(difference, 360 - difference))
}

function initialProtractor(stage: HTMLElement): ProtractorState {
  const rect = stage.getBoundingClientRect()
  const radius = clamp(Math.min(rect.width * .3, rect.height * .5, PROTRACTOR_DEFAULT_RADIUS), PROTRACTOR_MIN_RADIUS, PROTRACTOR_MAX_RADIUS)
  return {
    center: { x: rect.width / 2, y: rect.height * .58 },
    radius,
    rotation: 0,
    pins: [],
  }
}

function Protractor({ stageRef, color }: { stageRef: RefObject<HTMLDivElement | null>; color: ProtractorColor }) {
  const [protractor, setProtractor] = useState<ProtractorState | null>(null)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [activeHandle, setActiveHandle] = useState<ProtractorHandle | null>(null)
  const interactionRef = useRef<ProtractorInteraction | null>(null)
  const wheelRotationRemainderRef = useRef(0)

  useEffect(() => {
    if (protractor || !stageRef.current) return
    setProtractor(initialProtractor(stageRef.current))
  }, [protractor, stageRef])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [stageRef])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const addExternalPin = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && (target.closest('.question-protractor') || target.closest('.question-protractor-pin-layer') || target.closest('button'))) return
      const rect = stage.getBoundingClientRect()
      const point = { x: event.clientX - rect.left + stage.scrollLeft, y: event.clientY - rect.top + stage.scrollTop }
      setProtractor(previous => {
        if (!previous || Math.hypot(point.x - previous.center.x, point.y - previous.center.y) < previous.radius * .84) return previous
        const pins = previous.pins.length >= PROTRACTOR_PIN_LIMIT ? [...previous.pins.slice(1), point] : [...previous.pins, point]
        return { ...previous, pins }
      })
    }
    stage.addEventListener('click', addExternalPin)
    return () => stage.removeEventListener('click', addExternalPin)
  }, [stageRef])

  useEffect(() => {
    const finishInteraction = () => { interactionRef.current = null }
    const updateInteraction = (clientX: number, clientY: number) => {
      const interaction = interactionRef.current
      const stage = stageRef.current
      if (!interaction || !stage) return
      const rect = stage.getBoundingClientRect()
      const point = { x: clientX - rect.left + stage.scrollLeft, y: clientY - rect.top + stage.scrollTop }
      setProtractor(previous => {
        if (!previous) return previous
        if (interaction.kind === 'move') {
          const pointerOffset = interaction.pointerOffset ?? { x: 0, y: 0 }
          return {
            ...previous,
            center: {
              x: clamp(point.x + pointerOffset.x, 0, Math.max(rect.width, stage.scrollWidth)),
              y: clamp(point.y + pointerOffset.y, 0, Math.max(rect.height, stage.scrollHeight)),
            },
          }
        }
        if (interaction.kind === 'rotate') {
          // Match the screen/canvas coordinate system used by Mac trackpads and the reference tool:
          // dragging down on the left handle rotates in the same direction as the pointer movement.
          const pointerAngle = Math.atan2(point.y - previous.center.y, point.x - previous.center.x) * 180 / Math.PI
          const lastPointerAngle = interaction.lastPointerAngle ?? pointerAngle
          let angleDelta = pointerAngle - lastPointerAngle
          if (angleDelta > 180) angleDelta -= 360
          if (angleDelta < -180) angleDelta += 360
          interaction.lastPointerAngle = pointerAngle
          return { ...previous, rotation: previous.rotation + angleDelta }
        }
        if (interaction.kind === 'resize') {
          const radius = clamp(Math.hypot(point.x - previous.center.x, point.y - previous.center.y) + (interaction.radiusOffset ?? 0), PROTRACTOR_MIN_RADIUS, Math.min(PROTRACTOR_MAX_RADIUS, rect.width * .48, rect.height * .72))
          return { ...previous, radius }
        }
        const pinIndex = interaction.pinIndex ?? 0
        const pins = [...previous.pins]
        const pointerOffset = interaction.pointerOffset ?? { x: 0, y: 0 }
        pins[pinIndex] = { x: point.x + pointerOffset.x, y: point.y + pointerOffset.y }
        return { ...previous, pins }
      })
    }
    const moveInteraction = (event: PointerEvent) => {
      if (interactionRef.current?.input !== 'pointer') return
      updateInteraction(event.clientX, event.clientY)
    }
    const moveMouseInteraction = (event: MouseEvent) => {
      if (interactionRef.current?.input !== 'mouse') return
      updateInteraction(event.clientX, event.clientY)
    }
    window.addEventListener('pointermove', moveInteraction)
    window.addEventListener('mousemove', moveMouseInteraction)
    window.addEventListener('pointerup', finishInteraction)
    window.addEventListener('mouseup', finishInteraction)
    window.addEventListener('pointercancel', finishInteraction)
    return () => {
      window.removeEventListener('pointermove', moveInteraction)
      window.removeEventListener('mousemove', moveMouseInteraction)
      window.removeEventListener('pointerup', finishInteraction)
      window.removeEventListener('mouseup', finishInteraction)
      window.removeEventListener('pointercancel', finishInteraction)
    }
  }, [stageRef])

  if (!protractor) return null

  const wrapperStyle = {
    left: `${protractor.center.x}px`,
    top: `${protractor.center.y}px`,
    width: `${protractor.radius * 2}px`,
    height: `${protractor.radius * 1.26}px`,
    '--protractor-color': color,
  } as CSSProperties
  const pinAngles = protractor.pins.map(pin => directionAngleForPoint(pin, protractor.center, protractor.rotation))
  const measuredAngle = pinAngles.length >= 2 ? smallestAngleBetween(pinAngles[0], pinAngles[1]) : null
  const arcPath = `M ${PROTRACTOR_VIEWBOX.centerX - PROTRACTOR_VIEWBOX.arcRadius} ${PROTRACTOR_VIEWBOX.centerY} A ${PROTRACTOR_VIEWBOX.arcRadius} ${PROTRACTOR_VIEWBOX.arcRadius} 0 0 1 ${PROTRACTOR_VIEWBOX.centerX + PROTRACTOR_VIEWBOX.arcRadius} ${PROTRACTOR_VIEWBOX.centerY}`
  const innerArcPath = `M ${PROTRACTOR_VIEWBOX.centerX - PROTRACTOR_INNER_RADIUS} ${PROTRACTOR_VIEWBOX.centerY} A ${PROTRACTOR_INNER_RADIUS} ${PROTRACTOR_INNER_RADIUS} 0 0 1 ${PROTRACTOR_VIEWBOX.centerX + PROTRACTOR_INNER_RADIUS} ${PROTRACTOR_VIEWBOX.centerY}`

  const stagePointForClient = (clientX: number, clientY: number) => {
    const stage = stageRef.current
    if (!stage) return null
    const rect = stage.getBoundingClientRect()
    return { x: clientX - rect.left + stage.scrollLeft, y: clientY - rect.top + stage.scrollTop }
  }
  const svgPointForClient = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const rect = svg.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const point = {
      x: (clientX - rect.left) / rect.width * 400,
      y: (clientY - rect.top) / rect.height * 250,
    }
    const radians = degreesToRadians(protractor.rotation)
    const dx = point.x - PROTRACTOR_VIEWBOX.centerX
    const dy = point.y - PROTRACTOR_VIEWBOX.centerY
    return {
      x: PROTRACTOR_VIEWBOX.centerX + dx * Math.cos(radians) + dy * Math.sin(radians),
      y: PROTRACTOR_VIEWBOX.centerY - dx * Math.sin(radians) + dy * Math.cos(radians),
    }
  }
  const interactionKindForSvgPoint = (point: Point): Exclude<ProtractorInteraction['kind'], 'pin'> | null => {
    const center = { x: PROTRACTOR_VIEWBOX.centerX, y: PROTRACTOR_VIEWBOX.centerY }
    const distance = Math.hypot(point.x - center.x, point.y - center.y)
    if (point.y <= center.y && distance <= PROTRACTOR_INNER_RADIUS) return 'move'
    if (Math.hypot(point.x - (center.x - PROTRACTOR_VIEWBOX.arcRadius), point.y - center.y) <= 32 || Math.hypot(point.x - (center.x + PROTRACTOR_VIEWBOX.arcRadius), point.y - center.y) <= 32) return 'rotate'
    if (Math.hypot(point.x - center.x, point.y - (center.y - PROTRACTOR_VIEWBOX.arcRadius)) <= 32) return 'resize'
    return null
  }
  const startInteraction = (kind: ProtractorInteraction['kind'], event: ReactPointerEvent<SVGElement> | ReactMouseEvent<SVGElement>, input: ProtractorInteraction['input'], pinIndex?: number, adjustments?: Pick<ProtractorInteraction, 'pointerOffset' | 'lastPointerAngle' | 'radiusOffset'>) => {
    event.preventDefault()
    event.stopPropagation()
    interactionRef.current = { kind, input, pinIndex, ...adjustments }
    if (input === 'pointer') {
      const pointerEvent = event as ReactPointerEvent<SVGElement>
      pointerEvent.currentTarget.setPointerCapture?.(pointerEvent.pointerId)
    }
  }
  const startHandleInteraction = (kind: Exclude<ProtractorInteraction['kind'], 'pin'>, event: ReactPointerEvent<SVGElement>) => {
    const point = stagePointForClient(event.clientX, event.clientY)
    if (!point) return
    const pointerOffset = { x: protractor.center.x - point.x, y: protractor.center.y - point.y }
    const pointerAngle = Math.atan2(point.y - protractor.center.y, point.x - protractor.center.x) * 180 / Math.PI
    const distance = Math.hypot(point.x - protractor.center.x, point.y - protractor.center.y)
    const input = event.pointerType === 'mouse' ? 'mouse' : 'pointer'
    startInteraction(kind, event, input, undefined, {
      pointerOffset: kind === 'move' ? pointerOffset : undefined,
      lastPointerAngle: kind === 'rotate' ? pointerAngle : undefined,
      radiusOffset: kind === 'resize' ? protractor.radius - distance : undefined,
    })
  }
  const startMouseHandleInteraction = (kind: Exclude<ProtractorInteraction['kind'], 'pin'>, event: ReactMouseEvent<SVGElement>) => {
    if (interactionRef.current) return
    const point = stagePointForClient(event.clientX, event.clientY)
    if (!point) return
    const pointerOffset = { x: protractor.center.x - point.x, y: protractor.center.y - point.y }
    const pointerAngle = Math.atan2(point.y - protractor.center.y, point.x - protractor.center.x) * 180 / Math.PI
    const distance = Math.hypot(point.x - protractor.center.x, point.y - protractor.center.y)
    startInteraction(kind, event, 'mouse', undefined, {
      pointerOffset: kind === 'move' ? pointerOffset : undefined,
      lastPointerAngle: kind === 'rotate' ? pointerAngle : undefined,
      radiusOffset: kind === 'resize' ? protractor.radius - distance : undefined,
    })
  }
  const startPinInteraction = (event: ReactPointerEvent<SVGElement>, pinIndex: number) => {
    const point = stagePointForClient(event.clientX, event.clientY)
    const pin = protractor.pins[pinIndex]
    if (!point || !pin) return
    startInteraction('pin', event, event.pointerType === 'mouse' ? 'mouse' : 'pointer', pinIndex, { pointerOffset: { x: pin.x - point.x, y: pin.y - point.y } })
  }
  const startMousePinInteraction = (event: ReactMouseEvent<SVGElement>, pinIndex: number) => {
    if (interactionRef.current) return
    const point = stagePointForClient(event.clientX, event.clientY)
    const pin = protractor.pins[pinIndex]
    if (!point || !pin) return
    startInteraction('pin', event, 'mouse', pinIndex, { pointerOffset: { x: pin.x - point.x, y: pin.y - point.y } })
  }
  const startSvgPointerFallback = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.target instanceof Element && event.target.closest('.question-protractor-handle-hit,.question-protractor-move-hit,.question-protractor-pin,.question-protractor-arc-hit')) return
    const point = svgPointForClient(event.currentTarget, event.clientX, event.clientY)
    const kind = point && interactionKindForSvgPoint(point)
    if (kind) startHandleInteraction(kind, event)
  }
  const startSvgMouseFallback = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (interactionRef.current) return
    if (event.target instanceof Element && event.target.closest('.question-protractor-handle-hit,.question-protractor-move-hit,.question-protractor-pin,.question-protractor-arc-hit')) return
    const point = svgPointForClient(event.currentTarget, event.clientX, event.clientY)
    const kind = point && interactionKindForSvgPoint(point)
    if (kind) startMouseHandleInteraction(kind, event)
  }
  const addPin = (event: ReactMouseEvent<SVGPathElement>) => {
    event.stopPropagation()
    const stage = stageRef.current
    if (!stage) return
    const point = stagePointForClient(event.clientX, event.clientY)
    if (!point) return
    setProtractor(previous => {
      if (!previous) return previous
      const pins = previous.pins.length >= PROTRACTOR_PIN_LIMIT ? [...previous.pins.slice(1), point] : [...previous.pins, point]
      return { ...previous, pins }
    })
  }
  const clearPins = () => setProtractor(previous => previous ? { ...previous, pins: [] } : previous)
  const adjustRotationWithWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    // On macOS, a pinch gesture is reported as a Ctrl+wheel event; leave it to the browser.
    if (event.ctrlKey) return
    const rawDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
    if (!Number.isFinite(rawDelta) || rawDelta === 0) return
    event.preventDefault()
    event.stopPropagation()
    const deltaInPixels = event.deltaMode === 1 ? rawDelta * 16 : event.deltaMode === 2 ? rawDelta * 800 : rawDelta
    const sensitivity = event.altKey || event.shiftKey ? .02 : .04
    // Scroll up increases the protractor angle; accumulate small trackpad deltas for smooth 0.1° steps.
    wheelRotationRemainderRef.current += -deltaInPixels * sensitivity
    const appliedRotation = Math.trunc(wheelRotationRemainderRef.current * 10) / 10
    if (appliedRotation === 0) return
    wheelRotationRemainderRef.current -= appliedRotation
    setProtractor(previous => previous ? { ...previous, rotation: previous.rotation + appliedRotation } : previous)
  }

  return <>
    {stageSize.width > 0 && stageSize.height > 0 && <svg className="question-protractor-pin-layer" style={{ '--protractor-color': color } as CSSProperties} viewBox={`0 0 ${stageSize.width} ${stageSize.height}`} aria-label="题目角度测量线">
      {protractor.pins.map((pin, index) => {
        const angle = pinAngles[index]
        const labelPoint = { x: protractor.center.x + (pin.x - protractor.center.x) * .42, y: protractor.center.y + (pin.y - protractor.center.y) * .42 }
        return <g key={`${pin.x}-${pin.y}-${index}`}>
          <line className="question-protractor-pin-line" x1={protractor.center.x} y1={protractor.center.y} x2={pin.x} y2={pin.y}/>
          <g className="question-protractor-angle-label" transform={`translate(${labelPoint.x} ${labelPoint.y})`} aria-label={`第 ${index + 1} 个图钉方向 ${Math.round(angle)} 度`}>
            <rect x="-20" y="-11" width="40" height="22" rx="11"/>
            <text textAnchor="middle" y="4">{Math.round(angle)}°</text>
          </g>
          <g className="question-protractor-pin-group" transform={`translate(${pin.x} ${pin.y})`}>
            <path className="question-protractor-pin" d="M 0 0 C -2 -3 -8 -6 -8 -11 C -8 -17 -4 -21 0 -21 C 4 -21 8 -17 8 -11 C 8 -6 2 -3 0 0 Z" onClick={event => event.stopPropagation()} onPointerDown={event => startPinInteraction(event, index)} onMouseDown={event => startMousePinInteraction(event, index)} aria-label={`第 ${index + 1} 个图钉 ${Math.round(angle)} 度`}/>
            <circle className="question-protractor-pin-core" cx="0" cy="-12" r="2.5"/>
          </g>
        </g>
      })}
    </svg>}
    <div className="question-protractor" style={wrapperStyle} aria-label="可操作量角器" onClick={event => event.stopPropagation()} onWheelCapture={adjustRotationWithWheel}>
      <svg viewBox="0 0 400 250" role="img" aria-label="量角器。刻度精确到 1 度，内圈可移动，触控笔拖动两侧可旋转，顶部可调节大小，滚轮可调节角度，点击弧线可放置图钉" onPointerDown={startSvgPointerFallback} onMouseDown={startSvgMouseFallback}>
        <g transform={`rotate(${protractor.rotation} ${PROTRACTOR_VIEWBOX.centerX} ${PROTRACTOR_VIEWBOX.centerY})`}>
          <path className="question-protractor-fill" d={`${arcPath} L ${PROTRACTOR_VIEWBOX.centerX - PROTRACTOR_VIEWBOX.arcRadius} ${PROTRACTOR_VIEWBOX.centerY} Z`}/>
          <path className="question-protractor-move-hit" d={`${innerArcPath} L ${PROTRACTOR_VIEWBOX.centerX - PROTRACTOR_INNER_RADIUS} ${PROTRACTOR_VIEWBOX.centerY} Z`} onPointerDown={event => startHandleInteraction('move', event)} onMouseDown={event => startMouseHandleInteraction('move', event)}/>
          <path className="question-protractor-arc-hit" d={arcPath} onClick={addPin}/>
          <path className="question-protractor-baseline question-protractor-axis-guide horizontal" d={`M ${PROTRACTOR_VIEWBOX.centerX - PROTRACTOR_VIEWBOX.arcRadius} ${PROTRACTOR_VIEWBOX.centerY} H ${PROTRACTOR_VIEWBOX.centerX + PROTRACTOR_VIEWBOX.arcRadius}`}/>
          <path className="question-protractor-inner-arc" d={innerArcPath}/>
          <line className="question-protractor-axis-guide vertical" x1={PROTRACTOR_VIEWBOX.centerX} y1={PROTRACTOR_VIEWBOX.centerY} x2={protractorPoint(90, PROTRACTOR_INNER_RADIUS).x} y2={protractorPoint(90, PROTRACTOR_INNER_RADIUS).y}/>
          <g className="question-protractor-center-mark" aria-hidden="true">
            <line x1={PROTRACTOR_VIEWBOX.centerX - 18} y1={PROTRACTOR_VIEWBOX.centerY} x2={PROTRACTOR_VIEWBOX.centerX - 5} y2={PROTRACTOR_VIEWBOX.centerY}/>
            <line x1={PROTRACTOR_VIEWBOX.centerX + 5} y1={PROTRACTOR_VIEWBOX.centerY} x2={PROTRACTOR_VIEWBOX.centerX + 18} y2={PROTRACTOR_VIEWBOX.centerY}/>
            <line x1={PROTRACTOR_VIEWBOX.centerX} y1={PROTRACTOR_VIEWBOX.centerY - 18} x2={PROTRACTOR_VIEWBOX.centerX} y2={PROTRACTOR_VIEWBOX.centerY - 5}/>
            <line x1={PROTRACTOR_VIEWBOX.centerX} y1={PROTRACTOR_VIEWBOX.centerY + 5} x2={PROTRACTOR_VIEWBOX.centerX} y2={PROTRACTOR_VIEWBOX.centerY + 18}/>
          </g>
          {Array.from({ length: 181 }, (_, angle) => {
            const tickLength = angle % 10 === 0 ? 30 : angle % 5 === 0 ? 22 : 14
            const outer = protractorPoint(angle)
            const inner = protractorPoint(angle, PROTRACTOR_VIEWBOX.arcRadius - tickLength)
            return <g key={angle} className={angle % 10 === 0 ? 'question-protractor-tick major' : angle % 5 === 0 ? 'question-protractor-tick medium' : 'question-protractor-tick'}>
              {angle % 10 === 0 && angle !== 0 && angle !== 180 &&
                <line className="question-protractor-major-guide" x1={PROTRACTOR_VIEWBOX.centerX} y1={PROTRACTOR_VIEWBOX.centerY} x2={protractorPoint(angle, PROTRACTOR_INNER_RADIUS).x} y2={protractorPoint(angle, PROTRACTOR_INNER_RADIUS).y}/>
              }
              <path d={`M ${outer.x} ${outer.y} L ${inner.x} ${inner.y}`}/>
              {angle % 10 === 0 && <>
                <text className="question-protractor-scale-outer" x={protractorPoint(angle, 153).x} y={protractorPoint(angle, 153).y + 3} textAnchor="middle">{180 - angle}</text>
                <text className="question-protractor-scale-inner" x={protractorPoint(angle, 130).x} y={protractorPoint(angle, 130).y + 3} textAnchor="middle">{angle}</text>
              </>}
            </g>
          })}
          <g className={activeHandle === 'center' ? 'question-protractor-handle-zone active' : 'question-protractor-handle-zone'} onPointerEnter={() => setActiveHandle('center')} onPointerLeave={() => setActiveHandle(current => current === 'center' ? null : current)}>
            <circle className="question-protractor-handle-hit" cx={PROTRACTOR_VIEWBOX.centerX} cy={PROTRACTOR_VIEWBOX.centerY} r="28" onPointerDown={event => startHandleInteraction('move', event)} onMouseDown={event => startMouseHandleInteraction('move', event)} aria-label="拖动中心移动量角器"/>
          </g>
          <g className={activeHandle === 'left' ? 'question-protractor-handle-zone active' : 'question-protractor-handle-zone'} onPointerEnter={() => setActiveHandle('left')} onPointerLeave={() => setActiveHandle(current => current === 'left' ? null : current)}>
            <circle className="question-protractor-handle-hit" cx={PROTRACTOR_VIEWBOX.centerX - PROTRACTOR_VIEWBOX.arcRadius} cy={PROTRACTOR_VIEWBOX.centerY} r="25" onPointerDown={event => startHandleInteraction('rotate', event)} onMouseDown={event => startMouseHandleInteraction('rotate', event)} aria-label="拖动左端旋转量角器"/>
            <circle className="question-protractor-handle-visual" cx={PROTRACTOR_VIEWBOX.centerX - PROTRACTOR_VIEWBOX.arcRadius} cy={PROTRACTOR_VIEWBOX.centerY} r="11"/>
          </g>
          <g className={activeHandle === 'right' ? 'question-protractor-handle-zone active' : 'question-protractor-handle-zone'} onPointerEnter={() => setActiveHandle('right')} onPointerLeave={() => setActiveHandle(current => current === 'right' ? null : current)}>
            <circle className="question-protractor-handle-hit" cx={PROTRACTOR_VIEWBOX.centerX + PROTRACTOR_VIEWBOX.arcRadius} cy={PROTRACTOR_VIEWBOX.centerY} r="25" onPointerDown={event => startHandleInteraction('rotate', event)} onMouseDown={event => startMouseHandleInteraction('rotate', event)} aria-label="拖动右端旋转量角器"/>
            <circle className="question-protractor-handle-visual" cx={PROTRACTOR_VIEWBOX.centerX + PROTRACTOR_VIEWBOX.arcRadius} cy={PROTRACTOR_VIEWBOX.centerY} r="11"/>
          </g>
          <g className={activeHandle === 'resize' ? 'question-protractor-handle-zone active' : 'question-protractor-handle-zone'} onPointerEnter={() => setActiveHandle('resize')} onPointerLeave={() => setActiveHandle(current => current === 'resize' ? null : current)}>
            <circle className="question-protractor-handle-hit" cx={PROTRACTOR_VIEWBOX.centerX} cy={PROTRACTOR_VIEWBOX.centerY - PROTRACTOR_VIEWBOX.arcRadius} r="25" onPointerDown={event => startHandleInteraction('resize', event)} onMouseDown={event => startMouseHandleInteraction('resize', event)} aria-label="拖动顶部调节量角器大小"/>
            <circle className="question-protractor-handle-visual question-protractor-resize" cx={PROTRACTOR_VIEWBOX.centerX} cy={PROTRACTOR_VIEWBOX.centerY - PROTRACTOR_VIEWBOX.arcRadius} r="10"/>
          </g>
        </g>
      </svg>
      <span className="question-protractor-hint"><Move size={11}/>内圈拖动 · 外部点击放图钉 · 触控笔拖两端/滚轮调角度 · 顶部调大小{pinAngles.length > 0 && <strong>{measuredAngle === null ? `${Math.round(pinAngles[0])}°` : `夹角 ${measuredAngle}°`}</strong>}</span>
      <button className="question-protractor-clear" type="button" onClick={clearPins} disabled={!protractor.pins.length} aria-label="清除量角器图钉" title="清除图钉"><Trash2 size={12}/></button>
    </div>
  </>
}

export default function QuestionZoomDialog({ question, imageSource, onClose }: QuestionZoomDialogProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [protractorOpen, setProtractorOpen] = useState(false)
  const [protractorColor, setProtractorColor] = useState<ProtractorColor>('#9f2e25')
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose, { initialFocusSelector: '[aria-label="关闭放大查看"]' })
  useModalScrollLock(true, 'question-zoom-modal-open')
  useEffect(() => {
    setZoom(1)
    setProtractorOpen(false)
  }, [question.id])

  return <div ref={dialogRef} className="question-zoom-backdrop" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="question-zoom-dialog" role="dialog" aria-modal="true" aria-labelledby="question-zoom-title" onPointerDown={event => event.stopPropagation()}>
      <header className="question-zoom-header">
        <div className="question-zoom-heading"><span className="question-zoom-icon"><ZoomIn size={18}/></span><div><span>IMAGE VIEWER</span><h2 id="question-zoom-title">放大查看 · 第 {question.number} 题配图</h2></div></div>
        <div className="question-zoom-actions">
          <div className="question-zoom-scale" role="group" aria-label="查看缩放"><button type="button" onClick={() => setZoom(value => clamp(value - QUESTION_ZOOM_STEP, QUESTION_ZOOM_MIN, QUESTION_ZOOM_MAX))} disabled={zoom <= QUESTION_ZOOM_MIN} aria-label="缩小"><ZoomOut size={14}/></button><input className="question-zoom-range" type="range" min={QUESTION_ZOOM_MIN} max={QUESTION_ZOOM_MAX} step={QUESTION_ZOOM_STEP} value={zoom} onChange={event => setZoom(clamp(Number(event.target.value), QUESTION_ZOOM_MIN, QUESTION_ZOOM_MAX))} aria-label="题目缩放"/><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom(value => clamp(value + QUESTION_ZOOM_STEP, QUESTION_ZOOM_MIN, QUESTION_ZOOM_MAX))} disabled={zoom >= QUESTION_ZOOM_MAX} aria-label="放大"><ZoomIn size={14}/></button></div>
          <button className={protractorOpen ? 'question-zoom-tool active' : 'question-zoom-tool'} type="button" aria-pressed={protractorOpen} onClick={() => setProtractorOpen(value => !value)}><Ruler size={15}/>量角器</button>
          <button className="question-zoom-close" type="button" onClick={onClose} aria-label="关闭放大查看" data-dialog-initial-focus><X size={19}/></button>
        </div>
      </header>
      <div className="question-zoom-toolbar">
        <span>可拖动量角器中心定位，点击弧线刻度放置图钉测量角度。</span>
        {protractorOpen && <label>颜色<select value={protractorColor} onChange={event => setProtractorColor(event.target.value as ProtractorColor)} aria-label="量角器颜色">{PROTRACTOR_COLORS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
      </div>
      <div className="question-zoom-stage" ref={stageRef}>
        <div className="question-zoom-content" style={{ transform: `scale(${zoom})` }}>
          <AssetGallery sources={[imageSource]} alt="放大后的题目配图" eager/>
        </div>
        {protractorOpen && <Protractor stageRef={stageRef} color={protractorColor}/>}
      </div>
      <footer className="question-zoom-footer"><span><RotateCw size={13}/>量角器状态仅保留在本次查看中</span><button type="button" onClick={onClose}>完成查看</button></footer>
    </section>
  </div>
}
