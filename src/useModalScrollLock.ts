import { useLayoutEffect } from 'react'

interface ScrollLockSnapshot {
  htmlOverflow: string
  htmlScrollbarGutter: string
  htmlOverscroll: string
  bodyOverflow: string
  bodyOverscroll: string
  bodyPaddingRight: string
  scrollX: number
  scrollY: number
}

let activeLocks = 0
let snapshot: ScrollLockSnapshot | null = null
const rootClassCounts = new Map<string, number>()
const MODAL_BACKDROP_SELECTOR = [
  '.modal-backdrop',
  '.notes-modal-backdrop',
  '.timer-modal-backdrop',
  '.dashboard-question-backdrop',
  '.confirm-dialog-backdrop',
  '.handwriting-dialog-backdrop',
  '.question-zoom-backdrop',
  '.record-manager-backdrop',
  '.settings-panel-backdrop',
  '.settings-backdrop',
  '.update-dialog-backdrop',
  '.notes-create-backdrop',
  '.editor-exit-prompt-backdrop',
].join(',')

function elementFromTarget(target: EventTarget | null) {
  if (target instanceof Element) return target
  if (target instanceof Node) return target.parentElement
  return null
}

function isScrollable(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  return ['auto', 'scroll', 'overlay'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1
}

function hasScrollableModalAncestor(target: EventTarget | null) {
  const element = elementFromTarget(target)
  const backdrop = element?.closest(MODAL_BACKDROP_SELECTOR)
  if (!element || !backdrop) return false
  let candidate: HTMLElement | null = element instanceof HTMLElement ? element : element.parentElement
  while (candidate && candidate !== backdrop) {
    if (isScrollable(candidate)) return true
    candidate = candidate.parentElement
  }
  return false
}

function preventBackgroundScroll(event: Event) {
  if (hasScrollableModalAncestor(event.target)) return
  event.preventDefault()
  event.stopPropagation()
}

function restoreLockedScroll() {
  if (activeLocks <= 0 || !snapshot) return
  if (window.scrollX !== snapshot.scrollX || window.scrollY !== snapshot.scrollY) window.scrollTo(snapshot.scrollX, snapshot.scrollY)
}

function installScrollGuards() {
  document.addEventListener('wheel', preventBackgroundScroll, { capture: true, passive: false })
  document.addEventListener('touchmove', preventBackgroundScroll, { capture: true, passive: false })
  window.addEventListener('scroll', restoreLockedScroll, { capture: true })
}

function uninstallScrollGuards() {
  document.removeEventListener('wheel', preventBackgroundScroll, true)
  document.removeEventListener('touchmove', preventBackgroundScroll, true)
  window.removeEventListener('scroll', restoreLockedScroll, true)
}

function retainRootClass(className?: string) {
  if (!className) return
  const count = rootClassCounts.get(className) || 0
  rootClassCounts.set(className, count + 1)
  document.documentElement.classList.add(className)
}

function releaseRootClass(className?: string) {
  if (!className) return
  const count = rootClassCounts.get(className) || 0
  if (count <= 1) {
    rootClassCounts.delete(className)
    document.documentElement.classList.remove(className)
    return
  }
  rootClassCounts.set(className, count - 1)
}

function acquireModalScrollLock(rootClassName?: string) {
  const html = document.documentElement
  const body = document.body
  if (activeLocks === 0) {
    snapshot = {
      htmlOverflow: html.style.overflow,
      htmlScrollbarGutter: html.style.scrollbarGutter,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyPaddingRight: body.style.paddingRight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    }
    const scrollbarWidth = window.innerWidth - html.clientWidth
    html.style.overflow = 'hidden'
    html.style.scrollbarGutter = 'auto'
    html.style.overscrollBehavior = 'none'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`
    installScrollGuards()
  }
  activeLocks += 1
  retainRootClass(rootClassName)

  let released = false
  return () => {
    if (released) return
    released = true
    releaseRootClass(rootClassName)
    activeLocks = Math.max(0, activeLocks - 1)
    if (activeLocks > 0 || !snapshot) return
    uninstallScrollGuards()
    html.style.overflow = snapshot.htmlOverflow
    html.style.scrollbarGutter = snapshot.htmlScrollbarGutter
    html.style.overscrollBehavior = snapshot.htmlOverscroll
    body.style.overflow = snapshot.bodyOverflow
    body.style.overscrollBehavior = snapshot.bodyOverscroll
    body.style.paddingRight = snapshot.bodyPaddingRight
    snapshot = null
  }
}

export function useModalScrollLock(active = true, rootClassName?: string) {
  useLayoutEffect(() => {
    if (!active) return
    return acquireModalScrollLock(rootClassName)
  }, [active, rootClassName])
}
