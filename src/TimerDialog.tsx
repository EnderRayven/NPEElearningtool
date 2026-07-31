import { Fragment, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { History, Pause, Play, RotateCcw, Square, Timer, Trash2, X } from 'lucide-react'
import { completeCountdown, deleteTimerHistory, finishTimerSession, getCountdownRemainingMs, getTimerElapsedMs, loadCountdownState, loadTimerData, pauseCountdown, pauseTimer, resetCountdown as resetCountdownState, resetCurrentTimer, saveCountdownState, saveTimerData, startCountdown, startTimer, type CountdownState, type CountdownStatus, type TimerData, type TimerHistoryRecord, type TimerState, type TimerStatus } from './timer'
import { useDialogFocus } from './useDialogFocus'
import { useModalScrollLock } from './useModalScrollLock'

type TimerView = 'large' | 'mini'

type TimerDialogProps = {
  view: TimerView
  onViewChange: (view: TimerView) => void
  onClose: () => void
}

type TimerStyle = 'focus' | 'flip' | 'countdown'
type TimerFaceStyle = 'focus' | 'flip'
type CountdownPickerField = 'hours' | 'minutes' | 'seconds'
type CountdownPicker = Record<CountdownPickerField, number>
type PickerWheelEvent = ReactWheelEvent<HTMLDivElement> & { webkitDirectionInvertedFromDevice?: boolean }
const countdownMorphFields: CountdownPickerField[] = ['hours', 'minutes', 'seconds']
const PICKER_STEP_PX = 36
const PICKER_WHEEL_RESET_MS = 180
const PICKER_MOTION_MS = 240

const TIMER_STYLE_STORAGE_KEY = 'npee:timer-style:v1'
const TIMER_FACE_STYLE_STORAGE_KEY = 'npee:timer-face-style:v1'

function loadTimerStyle(): TimerStyle {
  try {
    const savedStyle = localStorage.getItem(TIMER_STYLE_STORAGE_KEY)
    return savedStyle === 'flip' || savedStyle === 'countdown' ? savedStyle : 'focus'
  } catch {
    return 'focus'
  }
}

function saveTimerStyle(style: TimerStyle) {
  try {
    localStorage.setItem(TIMER_STYLE_STORAGE_KEY, style)
  } catch {
    // The visual preference is optional when browser storage is unavailable.
  }
}

function loadTimerFaceStyle(): TimerFaceStyle {
  try {
    const savedStyle = localStorage.getItem(TIMER_FACE_STYLE_STORAGE_KEY)
    if (savedStyle === 'focus' || savedStyle === 'flip') return savedStyle
    return loadTimerStyle() === 'flip' ? 'flip' : 'focus'
  } catch {
    return 'focus'
  }
}

function saveTimerFaceStyle(style: TimerFaceStyle) {
  try {
    localStorage.setItem(TIMER_FACE_STYLE_STORAGE_KEY, style)
  } catch {
    // The visual preference is optional when browser storage is unavailable.
  }
}

const statusCopy: Record<TimerStatus, { label: string; hint: string }> = {
  idle: { label: '准备开始', hint: '开始后记录学习时长' },
  running: { label: '正在计时', hint: '切换页面后仍会继续' },
  paused: { label: '已暂停', hint: '可继续或结束并保存' },
  ended: { label: '已结束', hint: '时长已保存' },
}

const countdownStatusCopy: Record<CountdownStatus, { label: string; hint: string }> = {
  idle: { label: '准备开始', hint: '选择时间后开始倒计时' },
  running: { label: '正在倒计时', hint: '切换页面后仍会继续' },
  paused: { label: '已暂停', hint: '可以继续或重新设置时间' },
  ended: { label: '已结束', hint: '本次倒计时已完成' },
}

const countdownPresets = [
  { label: '5 分钟', durationMs: 5 * 60 * 1000 },
  { label: '10 分钟', durationMs: 10 * 60 * 1000 },
  { label: '15 分钟', durationMs: 15 * 60 * 1000 },
  { label: '25 分钟', durationMs: 25 * 60 * 1000 },
  { label: '30 分钟', durationMs: 30 * 60 * 1000 },
  { label: '45 分钟', durationMs: 45 * 60 * 1000 },
  { label: '1 小时', durationMs: 60 * 60 * 1000 },
  { label: '2 小时', durationMs: 2 * 60 * 60 * 1000 },
]

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':')
}

function formatCountdownDuration(milliseconds: number) {
  return formatDuration(Math.max(0, milliseconds) + 999)
}

function pickerFromDuration(durationMs: number): CountdownPicker {
  const totalSeconds = Math.floor(durationMs / 1000)
  return {
    hours: Math.min(99, Math.floor(totalSeconds / 3600)),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  }
}

function durationFromPicker(picker: CountdownPicker) {
  return ((picker.hours * 60 + picker.minutes) * 60 + picker.seconds) * 1000
}

function padPickerValue(value: number) {
  return String(value).padStart(2, '0')
}

function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function TimerStatusBadge({ status }: { status: TimerStatus }) {
  return <span className={`timer-status-badge ${status}`}><i aria-hidden="true"/>{statusCopy[status].label}</span>
}

function FlipTimerDigit({ current, next }: { current: string; next: string }) {
  const isChanging = current !== next
  return <div className={isChanging ? 'flip-timer-digit is-changing' : 'flip-timer-digit'} aria-hidden="true">
    <div className="flip-timer-half flip-timer-half-top"><span>{next}</span></div>
    <div className="flip-timer-half flip-timer-half-bottom"><span>{current}</span></div>
    {isChanging && <>
      <div className="flip-timer-half flip-timer-half-top flip-timer-top-flap"><span>{current}</span></div>
      <div className="flip-timer-half flip-timer-half-bottom flip-timer-bottom-flap"><span>{next}</span></div>
    </>}
  </div>
}

function FlipTimerClock({ milliseconds, isRunning, morph = false }: { milliseconds: number; isRunning: boolean; morph?: boolean }) {
  const display = formatDuration(milliseconds)
  const previousDisplayRef = useRef(display)
  const previousDisplay = previousDisplayRef.current
  const previousDigits = previousDisplay.replace(/:/g, '')
  useEffect(() => {
    if (previousDisplayRef.current === display) return
    const settleTimer = window.setTimeout(() => { previousDisplayRef.current = display }, 520)
    return () => window.clearTimeout(settleTimer)
  }, [display])
  const parts = display.split(':')
  let digitIndex = 0
  return <div className={`flip-timer-clock ${isRunning ? 'is-running' : ''}`} role="img" aria-label={`计时 ${display}`}>
    {parts.map((part, partIndex) => <Fragment key={partIndex}>
      <div
        className={`flip-timer-group ${partIndex === 0 ? 'hours' : partIndex === 1 ? 'minutes' : 'seconds'}`}
        data-countdown-flip-field={morph ? countdownMorphFields[partIndex] : undefined}
      >
        {part.split('').map((digit, partDigitIndex) => {
          const current = previousDigits[digitIndex] || digit
          digitIndex += 1
          return <FlipTimerDigit current={current} next={digit} key={`${partIndex}-${partDigitIndex}-${digit}`}/>
        })}
      </div>
      {partIndex < parts.length - 1 && <span className="flip-timer-separator" aria-hidden="true">:</span>}
    </Fragment>)}
  </div>
}

function CountdownPickerColumn({ field, label, value, max, disabled, onChange }: { field: CountdownPickerField; label: string; value: number; max: number; disabled: boolean; onChange: (value: number) => void }) {
  function getRelativeValue(sourceValue: number, offset: number) {
    const range = max + 1
    return (sourceValue + offset + range * 2) % range
  }

  const previousTwo = getRelativeValue(value, -2)
  const previous = getRelativeValue(value, -1)
  const next = getRelativeValue(value, 1)
  const nextTwo = getRelativeValue(value, 2)
  const dragRef = useRef<{ pointerId: number; lastY: number; accumulated: number; moved: boolean; value: number } | null>(null)
  const suppressClickRef = useRef(false)
  const previousValueRef = useRef(value)
  const valueRef = useRef(value)
  const wheelAccumulatedRef = useRef(0)
  const wheelResetTimerRef = useRef<number | null>(null)
  const lastWheelAtRef = useRef(0)
  const [motion, setMotion] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    const previousValue = previousValueRef.current
    if (previousValue === value) return
    const range = max + 1
    const movedUp = (value - previousValue + range) % range
    const movedDown = (previousValue - value + range) % range
    setMotion(movedUp <= movedDown ? 'up' : 'down')
    previousValueRef.current = value
    const settleTimer = window.setTimeout(() => setMotion(null), PICKER_MOTION_MS)
    return () => window.clearTimeout(settleTimer)
  }, [max, value])

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => () => {
    if (wheelResetTimerRef.current !== null) window.clearTimeout(wheelResetTimerRef.current)
  }, [])

  function vibrate() {
    if (typeof navigator !== 'undefined') navigator.vibrate?.(6)
  }

  function getAdjacentValue(sourceValue: number, direction: -1 | 1) {
    if (direction > 0) return sourceValue === max ? 0 : sourceValue + 1
    return sourceValue === 0 ? max : sourceValue - 1
  }

  function changeBy(direction: -1 | 1, sourceValue = valueRef.current) {
    if (disabled) return
    const targetValue = getAdjacentValue(sourceValue, direction)
    valueRef.current = targetValue
    onChange(targetValue)
    vibrate()
    return targetValue
  }

  function changeBySteps(direction: -1 | 1, steps: number) {
    let nextValue = valueRef.current
    for (let step = 0; step < steps; step += 1) nextValue = changeBy(direction, nextValue) ?? nextValue
    return nextValue
  }

  function getPickerWheelDelta(event: PickerWheelEvent) {
    const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
    const isPreciseScroll = event.deltaMode === 0 && Math.abs(event.deltaY) < 40
    const hasDeviceDirectionFlag = typeof event.webkitDirectionInvertedFromDevice === 'boolean'
    const shouldCompensateDirection = event.webkitDirectionInvertedFromDevice === true || (isMac && isPreciseScroll && !hasDeviceDirectionFlag)
    const logicalDeltaY = shouldCompensateDirection ? -event.deltaY : event.deltaY
    return -logicalDeltaY
  }

  function handleWheel(event: PickerWheelEvent) {
    event.preventDefault()
    event.stopPropagation()
    const timestamp = Date.now()
    if (timestamp - lastWheelAtRef.current > PICKER_WHEEL_RESET_MS) wheelAccumulatedRef.current = 0
    lastWheelAtRef.current = timestamp
    const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
    wheelAccumulatedRef.current += getPickerWheelDelta(event) * deltaScale
    let nextValue = valueRef.current
    while (wheelAccumulatedRef.current >= PICKER_STEP_PX) {
      nextValue = changeBy(1, nextValue) ?? nextValue
      wheelAccumulatedRef.current -= PICKER_STEP_PX
    }
    while (wheelAccumulatedRef.current <= -PICKER_STEP_PX) {
      nextValue = changeBy(-1, nextValue) ?? nextValue
      wheelAccumulatedRef.current += PICKER_STEP_PX
    }
    if (wheelResetTimerRef.current !== null) window.clearTimeout(wheelResetTimerRef.current)
    wheelResetTimerRef.current = window.setTimeout(() => {
      wheelAccumulatedRef.current = 0
      wheelResetTimerRef.current = null
    }, PICKER_WHEEL_RESET_MS)
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    suppressClickRef.current = drag.moved
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = null
    event.stopPropagation()
  }

  return <div
    className={`${disabled ? 'countdown-picker-column disabled' : 'countdown-picker-column'} ${field}${motion ? ` is-step-${motion}` : ''}`}
    data-countdown-picker-field={field}
    aria-disabled={disabled}
    onWheel={handleWheel}
    onPointerDown={event => {
      if (disabled) return
      wheelAccumulatedRef.current = 0
      dragRef.current = { pointerId: event.pointerId, lastY: event.clientY, accumulated: 0, moved: false, value: valueRef.current }
      event.currentTarget.setPointerCapture(event.pointerId)
      event.stopPropagation()
    }}
    onPointerMove={event => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId || disabled) return
      const delta = drag.lastY - event.clientY
      drag.lastY = event.clientY
      drag.accumulated += delta
      while (drag.accumulated >= PICKER_STEP_PX) {
        drag.value = changeBy(1, drag.value) ?? drag.value
        drag.accumulated -= PICKER_STEP_PX
        drag.moved = true
      }
      while (drag.accumulated <= -PICKER_STEP_PX) {
        drag.value = changeBy(-1, drag.value) ?? drag.value
        drag.accumulated += PICKER_STEP_PX
        drag.moved = true
      }
      if (drag.moved) event.preventDefault()
      event.stopPropagation()
    }}
    onPointerUp={finishPointer}
    onPointerCancel={finishPointer}
  >
    <button type="button" disabled={disabled} aria-label={`${label}减二`} onClick={event => { if (suppressClickRef.current) { event.preventDefault(); event.stopPropagation(); suppressClickRef.current = false; return } changeBySteps(-1, 2) }}>{padPickerValue(previousTwo)}</button>
    <button type="button" disabled={disabled} aria-label={`${label}减一`} onClick={event => { if (suppressClickRef.current) { event.preventDefault(); event.stopPropagation(); suppressClickRef.current = false; return } changeBy(-1) }}>{padPickerValue(previous)}</button>
    <strong key={value} className={motion ? `is-step-${motion}` : undefined} aria-label={`当前${label}${padPickerValue(value)}`}>{padPickerValue(value)}</strong>
    <button type="button" disabled={disabled} aria-label={`${label}加一`} onClick={event => { if (suppressClickRef.current) { event.preventDefault(); event.stopPropagation(); suppressClickRef.current = false; return } changeBy(1) }}>{padPickerValue(next)}</button>
    <button type="button" disabled={disabled} aria-label={`${label}加二`} onClick={event => { if (suppressClickRef.current) { event.preventDefault(); event.stopPropagation(); suppressClickRef.current = false; return } changeBySteps(1, 2) }}>{padPickerValue(nextTwo)}</button>
    <small>{label}</small>
  </div>
}

function CountdownSettings({ picker, durationMs, disabled, onPickerChange, onPreset }: { picker: CountdownPicker; durationMs: number; disabled: boolean; onPickerChange: (field: CountdownPickerField, value: number) => void; onPreset: (durationMs: number) => void }) {
  return <section className="countdown-settings" aria-label="倒计时设置">
    <div className="countdown-settings-heading"><div><span>COUNTDOWN</span><strong>设置时间</strong></div><small>上下滑动或滚动，每次移动一个刻度</small></div>
    <div className="countdown-picker">
      <CountdownPickerColumn field="hours" label="时" value={picker.hours} max={99} disabled={disabled} onChange={value => onPickerChange('hours', value)}/><b>:</b>
      <CountdownPickerColumn field="minutes" label="分" value={picker.minutes} max={59} disabled={disabled} onChange={value => onPickerChange('minutes', value)}/><b>:</b>
      <CountdownPickerColumn field="seconds" label="秒" value={picker.seconds} max={59} disabled={disabled} onChange={value => onPickerChange('seconds', value)}/>
    </div>
    <div className="countdown-preset-heading"><span>快速预设</span><small>{formatCountdownDuration(durationMs)}</small></div>
    <div className="countdown-presets">{countdownPresets.map(preset => <button className={durationMs === preset.durationMs ? 'active' : ''} type="button" disabled={disabled} key={preset.durationMs} onClick={() => onPreset(preset.durationMs)}>{preset.label}</button>)}</div>
  </section>
}

function TimerHistory({ records, onDelete }: { records: TimerHistoryRecord[]; onDelete: (id: string) => void }) {
  return <section className="timer-history" aria-labelledby="timer-history-title">
    <div className="timer-history-heading">
      <div><span>HISTORY</span><strong id="timer-history-title"><History/>最近 10 次</strong></div>
      <small>{records.length}/10 条记录</small>
    </div>
    {records.length === 0 ? <div className="timer-history-empty"><History/><span>完成一次计时后，记录会显示在这里</span></div> : <div className="timer-history-list">
      {records.map(record => {
        const events = [
          ...record.pauseEvents.map((event, index) => ({ ...event, kind: 'pause' as const, label: record.pauseEvents.length > 1 ? `暂停 ${index + 1}` : '暂停' })),
          ...record.resumeEvents.map((event, index) => ({ ...event, kind: 'resume' as const, label: record.resumeEvents.length > 1 ? `继续 ${index + 1}` : '继续' })),
        ].sort((left, right) => left.at - right.at)
        return <article className="timer-history-item" key={record.id}>
        <div className="timer-history-item-heading">
          <div><strong>有效时长 {formatDuration(record.elapsedMs)}</strong><small>{record.pauseEvents.length ? `暂停 ${record.pauseEvents.length} 次` : '未暂停'}{record.resumeEvents.length ? ` · 继续 ${record.resumeEvents.length} 次` : ''}</small></div>
          <button type="button" aria-label={`删除 ${formatTimestamp(record.startedAt)} 的计时记录`} title="删除记录" onClick={() => onDelete(record.id)}><Trash2/></button>
        </div>
        <div className="timer-history-events">
          <span className="start"><i aria-hidden="true"/><b>开始</b><time>{formatTimestamp(record.startedAt)}</time></span>
          {events.map((event, index) => <span className={event.kind} key={`${record.id}-${event.kind}-${event.at}-${index}`}><i aria-hidden="true"/><b>{event.label}</b><time>{formatTimestamp(event.at)}</time></span>)}
          <span className="end"><i aria-hidden="true"/><b>结束</b><time>{formatTimestamp(record.endedAt)}</time></span>
        </div>
      </article>
      })}
    </div>}
  </section>
}

export default function TimerDialog({ view, onViewChange, onClose }: TimerDialogProps) {
  useModalScrollLock(view === 'large')
  const [timerData, setTimerData] = useState<TimerData>(loadTimerData)
  const [now, setNow] = useState(() => Date.now())
  const [timerStyle, setTimerStyle] = useState<TimerStyle>(loadTimerStyle)
  const [timerFaceStyle, setTimerFaceStyle] = useState<TimerFaceStyle>(loadTimerFaceStyle)
  const [countdownState, setCountdownState] = useState<CountdownState>(loadCountdownState)
  const [countdownPicker, setCountdownPicker] = useState<CountdownPicker>(() => pickerFromDuration(loadCountdownState().durationMs))
  const countdownPickerRef = useRef(countdownPicker)
  const countdownStageRef = useRef<HTMLDivElement | null>(null)
  const timerState = timerData.current
  const elapsedMs = getTimerElapsedMs(timerState, now)
  const countdownRemainingMs = getCountdownRemainingMs(countdownState, now)
  const copy = statusCopy[timerState.status]
  const countdownCopy = countdownStatusCopy[countdownState.status]
  const focusActive = timerState.status === 'running' || timerState.status === 'paused'
  const countdownActive = countdownState.status === 'running' || countdownState.status === 'paused'
  const timerMode = timerStyle === 'countdown' ? 'countdown' : 'timer'

  useEffect(() => {
    if (timerState.status !== 'running' && countdownState.status !== 'running') return
    const interval = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [timerState.status, countdownState.status])

  useEffect(() => {
    saveTimerData(timerData)
  }, [timerData])

  useEffect(() => {
    saveCountdownState(countdownState)
  }, [countdownState])

  useEffect(() => {
    if (countdownState.status !== 'running' || countdownRemainingMs > 0) return
    const timestamp = Date.now()
    setNow(timestamp)
    setCountdownState(previous => completeCountdown(previous, timestamp))
  }, [countdownRemainingMs, countdownState.status])

  useLayoutEffect(() => {
    const stage = countdownStageRef.current
    if (!stage || timerMode !== 'countdown' || countdownState.status === 'idle') return

    stage.classList.add('is-measuring')
    countdownMorphFields.forEach(field => {
      const pickerColumn = stage.querySelector<HTMLElement>(`[data-countdown-picker-field="${field}"]`)
      const flipGroup = stage.querySelector<HTMLElement>(`[data-countdown-flip-field="${field}"]`)
      const pickerValue = pickerColumn?.querySelector<HTMLElement>('strong')
      const flipValue = flipGroup?.querySelector<HTMLElement>('.flip-timer-half-top > span')
      if (!pickerColumn || !flipGroup || !pickerValue || !flipValue) return

      const pickerRect = pickerColumn.getBoundingClientRect()
      const flipRect = flipGroup.getBoundingClientRect()
      const pickerCenter = pickerRect.left + pickerRect.width / 2
      const flipCenter = flipRect.left + flipRect.width / 2
      const pickerMiddle = pickerRect.top + pickerRect.height / 2
      const flipMiddle = flipRect.top + flipRect.height / 2
      const pickerFontSize = Number.parseFloat(window.getComputedStyle(pickerValue).fontSize)
      const flipFontSize = Number.parseFloat(window.getComputedStyle(flipValue).fontSize)
      const handoffScale = Math.max(1, Math.min(4.5, (flipFontSize * .6) / pickerFontSize))
      const morphX = flipCenter - pickerCenter
      const morphY = flipMiddle - pickerMiddle

      pickerColumn.style.setProperty('--countdown-morph-x', `${morphX}px`)
      pickerColumn.style.setProperty('--countdown-morph-y', `${morphY}px`)
      pickerColumn.style.setProperty('--countdown-wheel-handoff-scale', String(handoffScale))
      flipGroup.style.setProperty('--countdown-morph-x', `${morphX}px`)
      flipGroup.style.setProperty('--countdown-morph-y', `${morphY}px`)
      flipGroup.style.setProperty('--countdown-flip-handoff-scale', '.6')
    })
    stage.classList.remove('is-measuring')
  }, [countdownState.status, timerMode])

  function requestClose() {
    if (countdownActive || focusActive) {
      onViewChange('mini')
      return
    }
    if (timerStyle === 'countdown') {
      const resetState = resetCountdownState(countdownState)
      setCountdownState(resetState)
      saveCountdownState(resetState)
      onClose()
      return
    }
    const resetData = resetCurrentTimer(timerData)
    setTimerData(resetData)
    saveTimerData(resetData)
    onClose()
  }
  const dialogRootRef = useDialogFocus<HTMLDivElement>(requestClose, {
    active: view === 'large',
    initialFocusSelector: '[aria-label="关闭计时器"]',
  })

  function updateTimer(update: (state: TimerState, now: number) => TimerState) {
    const timestamp = Date.now()
    setNow(timestamp)
    setTimerData(previous => ({ ...previous, current: update(previous.current, timestamp) }))
  }

  function updateCountdown(update: (state: CountdownState, now: number) => CountdownState) {
    const timestamp = Date.now()
    setNow(timestamp)
    setCountdownState(previous => update(previous, timestamp))
  }

  function chooseCountdownDuration(durationMs: number) {
    if (countdownActive) return
    const nextPicker = pickerFromDuration(durationMs)
    const nextState: CountdownState = { status: 'idle', durationMs, remainingMs: durationMs, runningAt: null }
    countdownPickerRef.current = nextPicker
    setCountdownPicker(nextPicker)
    setCountdownState(nextState)
  }

  function updateCountdownPicker(field: CountdownPickerField, value: number) {
    if (countdownActive) return
    const nextPicker = { ...countdownPickerRef.current, [field]: value }
    const durationMs = durationFromPicker(nextPicker)
    if (durationMs < 1_000) return
    countdownPickerRef.current = nextPicker
    setCountdownPicker(nextPicker)
    setCountdownState({ status: 'idle', durationMs, remainingMs: durationMs, runningAt: null })
  }

  function changeTimerMode(nextMode: 'timer' | 'countdown') {
    if (nextMode === timerMode) return
    if (nextMode === 'countdown' && focusActive) return
    if (nextMode === 'timer' && countdownActive) return
    const nextStyle: TimerStyle = nextMode === 'countdown' ? 'countdown' : timerFaceStyle
    setTimerStyle(nextStyle)
    saveTimerStyle(nextStyle)
  }

  function changeTimerFaceStyle(nextStyle: TimerFaceStyle) {
    if (timerMode !== 'timer' || nextStyle === timerFaceStyle) return
    setTimerFaceStyle(nextStyle)
    saveTimerFaceStyle(nextStyle)
    setTimerStyle(nextStyle)
    saveTimerStyle(nextStyle)
  }

  function finishCurrentTimer() {
    const timestamp = Date.now()
    setNow(timestamp)
    setTimerData(previous => finishTimerSession(previous, timestamp))
  }

  function deleteHistoryRecord(id: string) {
    setTimerData(previous => deleteTimerHistory(previous, id))
  }

  if (view === 'mini') {
    const showCountdown = countdownActive || (timerStyle === 'countdown' && !focusActive)
    const miniStatus = showCountdown ? countdownState.status : timerState.status
    const miniLabel = showCountdown ? countdownCopy.label : copy.label
    const miniDuration = showCountdown ? countdownRemainingMs : elapsedMs
    return <button className="timer-mini-window" type="button" aria-label="恢复计时器" onClick={() => onViewChange('large')}>
      <span className={`timer-mini-icon ${miniStatus}`}><Timer/></span>
      <span className="timer-mini-content"><strong>{showCountdown ? formatCountdownDuration(miniDuration) : formatDuration(miniDuration)}</strong><small><i className={miniStatus} aria-hidden="true"/>{miniLabel}</small></span>
      <span className="timer-mini-expand" aria-hidden="true">↗</span>
    </button>
  }

  return <div ref={dialogRootRef} className="timer-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) requestClose() }}>
    <section className="timer-dialog" role="dialog" aria-modal="true" aria-labelledby="timer-title" onClick={event => event.stopPropagation()}>
      <div className="timer-dialog-scroll">
        <div className="timer-dialog-toolbar">
          <div className="timer-dialog-heading">
            <span className="timer-dialog-icon"><Timer/></span>
            <div><span>STUDY TOOL</span><h2 id="timer-title">计时器</h2></div>
          </div>
          <div className="timer-mode-switch" role="tablist" aria-label="计时模式">
            <button className={timerMode === 'timer' ? 'active' : ''} type="button" role="tab" aria-selected={timerMode === 'timer'} disabled={countdownActive} onClick={() => changeTimerMode('timer')}>计时器</button>
            <button className={timerMode === 'countdown' ? 'active' : ''} type="button" role="tab" aria-selected={timerMode === 'countdown'} disabled={focusActive} onClick={() => changeTimerMode('countdown')}>倒计时</button>
          </div>
        </div>
        <p className="timer-dialog-description">{timerStyle === 'countdown' ? '设置一段倒计时时间，关闭大窗后会自动收起为右下角小窗。' : '记录一段专注学习时间，关闭大窗后会自动收起为右下角小窗。'}</p>
        {timerMode === 'countdown'
          ? <div ref={countdownStageRef} className={`countdown-transition-stage ${countdownState.status === 'idle' ? 'is-picker' : 'is-flip'}`}>
            <div className="countdown-transition-view is-picker" aria-hidden={countdownState.status !== 'idle'}>
              <CountdownSettings picker={countdownPicker} durationMs={countdownState.durationMs} disabled={countdownState.status !== 'idle'} onPickerChange={updateCountdownPicker} onPreset={chooseCountdownDuration}/>
            </div>
            <div className="countdown-transition-view is-flip" aria-hidden={countdownState.status === 'idle'}>
              <FlipTimerClock milliseconds={countdownRemainingMs} isRunning={countdownState.status === 'running'} morph/>
            </div>
          </div>
          : timerFaceStyle === 'flip'
          ? <FlipTimerClock milliseconds={elapsedMs} isRunning={timerState.status === 'running'}/>
          : <div className={`timer-clock ${timerState.status === 'running' ? 'is-running' : ''}`}>
            <div className="timer-clock-inner"><span>本次学习</span><strong>{formatDuration(elapsedMs)}</strong><TimerStatusBadge status={timerState.status}/></div>
          </div>}
        {timerMode === 'countdown'
          ? <>
            <div className="timer-dialog-state"><span className={`timer-state-dot ${countdownState.status}`} aria-hidden="true"/><div><strong>{countdownCopy.label}</strong><small>{countdownCopy.hint}</small></div></div>
            <div className="timer-controls countdown-controls">
              <button className="timer-control timer-start" type="button" disabled={countdownState.status === 'running'} onClick={() => updateCountdown(startCountdown)}><Play/>{countdownState.status === 'ended' ? '重新开始' : countdownState.status === 'paused' ? '继续倒计时' : '开始倒计时'}</button>
              <button className="timer-control" type="button" disabled={countdownState.status !== 'running'} onClick={() => updateCountdown(pauseCountdown)}><Pause/>暂停</button>
              <button className="timer-control timer-stop" type="button" disabled={countdownState.status === 'idle'} onClick={() => updateCountdown(resetCountdownState)}><RotateCcw/>重置</button>
            </div>
          </>
          : <>
            <div className="timer-dialog-state"><span className={`timer-state-dot ${timerState.status}`} aria-hidden="true"/><div><strong>{copy.label}</strong><small>{copy.hint}</small></div></div>
            <div className="timer-controls">
              <button className="timer-control timer-start" type="button" disabled={timerState.status === 'running'} onClick={() => updateTimer(startTimer)}><Play/>{timerState.status === 'ended' ? '重新开始' : timerState.status === 'paused' ? '继续计时' : '开始计时'}</button>
              <button className="timer-control" type="button" disabled={timerState.status !== 'running'} onClick={() => updateTimer(pauseTimer)}><Pause/>暂停</button>
              <button className="timer-control timer-stop" type="button" disabled={timerState.status !== 'running' && timerState.status !== 'paused'} onClick={finishCurrentTimer}><Square/>结束</button>
            </div>
          </>}
        {timerMode === 'timer' && <div className="timer-face-switch" role="tablist" aria-label="计时器样式">
          <button className={timerFaceStyle === 'focus' ? 'active' : ''} type="button" role="tab" aria-selected={timerFaceStyle === 'focus'} onClick={() => changeTimerFaceStyle('focus')}>秒表计时器</button>
          <button className={timerFaceStyle === 'flip' ? 'active' : ''} type="button" role="tab" aria-selected={timerFaceStyle === 'flip'} onClick={() => changeTimerFaceStyle('flip')}>翻页计时器</button>
        </div>}
        <small className="timer-dialog-footnote">{timerMode === 'countdown' ? '关闭只会收起界面，倒计时会继续；暂停后可重新打开继续。' : '关闭只会收起界面，不会结束计时；结束后关闭会清零本次计时。'}</small>
        {timerMode === 'timer' && <TimerHistory records={timerData.history} onDelete={deleteHistoryRecord}/>}
      </div>
    </section>
    <button className="dashboard-question-dialog-close" type="button" aria-label="关闭计时器" data-dialog-initial-focus onClick={requestClose}><X size={19}/></button>
  </div>
}
