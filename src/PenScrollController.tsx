import { useEffect } from 'react'

const PEN_DRAG_THRESHOLD = 6
const PEN_SCROLL_IGNORE_SELECTOR = [
  '.draftbook-window',
  '.draftbook-fab',
  '.handwriting-canvas',
  '.handwriting-toolbar',
  '.handwriting-size-popover',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
].join(',')
const PEN_SCROLL_MODAL_BACKDROP_SELECTOR = [
  '.modal-backdrop',
  '.notes-modal-backdrop',
  '.timer-modal-backdrop',
  '.dashboard-question-backdrop',
  '.confirm-dialog-backdrop',
].join(',')

type PenScrollState = {
  pointerId: number
  startX: number
  startY: number
  startScrollTop: number
  scrollTarget: HTMLElement
  dragging: boolean
}

function elementFromTarget(target: EventTarget | null) {
  if (target instanceof Element) return target
  if (target instanceof Node) return target.parentElement
  return null
}

function isVerticalScrollable(element: HTMLElement) {
  const overflowY = window.getComputedStyle(element).overflowY
  return (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && element.scrollHeight > element.clientHeight + 1
}

function findScrollTarget(target: EventTarget | null) {
  const element = elementFromTarget(target)
  if (!element || element.closest(PEN_SCROLL_IGNORE_SELECTOR)) return null

  const modalBackdrop = element.closest(PEN_SCROLL_MODAL_BACKDROP_SELECTOR)
  if (modalBackdrop) {
    let modalCandidate: HTMLElement | null = element instanceof HTMLElement ? element : element.parentElement
    while (modalCandidate && modalCandidate !== modalBackdrop) {
      if (isVerticalScrollable(modalCandidate)) return modalCandidate
      modalCandidate = modalCandidate.parentElement
    }
    return null
  }

  let candidate: HTMLElement | null = element instanceof HTMLElement ? element : element.parentElement
  while (candidate && candidate !== document.body) {
    if (isVerticalScrollable(candidate)) return candidate
    candidate = candidate.parentElement
  }

  const documentScroller = document.scrollingElement
  return documentScroller && documentScroller.scrollHeight > documentScroller.clientHeight + 1
    ? documentScroller as HTMLElement
    : null
}

function clearSelection() {
  const selection = window.getSelection()
  if (selection?.rangeCount) selection.removeAllRanges()
}

export default function PenScrollController() {
  useEffect(() => {
    let state: PenScrollState | null = null
    let suppressClickUntil = 0

    const stop = () => {
      if (!state) return
      if (state.dragging) suppressClickUntil = performance.now() + 250
      document.documentElement.classList.remove('pen-scroll-active')
      state = null
    }

    const start = (event: PointerEvent) => {
      if (event.pointerType !== 'pen' || event.button !== 0) return
      const scrollTarget = findScrollTarget(event.target)
      if (!scrollTarget) return
      state = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startScrollTop: scrollTarget.scrollTop,
        scrollTarget,
        dragging: false,
      }
    }

    const move = (event: PointerEvent) => {
      if (!state || event.pointerId !== state.pointerId) return
      const deltaX = event.clientX - state.startX
      const deltaY = event.clientY - state.startY
      if (!state.dragging) {
        if (Math.abs(deltaY) < PEN_DRAG_THRESHOLD) return
        state.dragging = true
        document.documentElement.classList.add('pen-scroll-active')
        clearSelection()
      }
      event.preventDefault()
      state.scrollTarget.scrollTop = state.startScrollTop - deltaY
    }

    const preventSelection = (event: Event) => {
      if (state?.dragging) event.preventDefault()
    }

    const suppressClick = (event: MouseEvent) => {
      if (performance.now() >= suppressClickUntil) return
      suppressClickUntil = 0
      event.preventDefault()
      event.stopPropagation()
    }

    document.addEventListener('pointerdown', start, { capture: true })
    document.addEventListener('pointermove', move, { capture: true, passive: false })
    document.addEventListener('pointerup', stop, { capture: true })
    document.addEventListener('pointercancel', stop, { capture: true })
    document.addEventListener('selectstart', preventSelection, { capture: true })
    document.addEventListener('click', suppressClick, { capture: true })
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', stop)
    return () => {
      stop()
      document.removeEventListener('pointerdown', start, true)
      document.removeEventListener('pointermove', move, true)
      document.removeEventListener('pointerup', stop, true)
      document.removeEventListener('pointercancel', stop, true)
      document.removeEventListener('selectstart', preventSelection, true)
      document.removeEventListener('click', suppressClick, true)
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', stop)
    }
  }, [])

  return null
}
