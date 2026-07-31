import { useEffect } from 'react'

interface ScrollLockSnapshot {
  htmlOverflow: string
  htmlOverscroll: string
  bodyOverflow: string
  bodyOverscroll: string
  bodyPaddingRight: string
}

let activeLocks = 0
let snapshot: ScrollLockSnapshot | null = null
const rootClassCounts = new Map<string, number>()

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
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyPaddingRight: body.style.paddingRight,
    }
    const scrollbarWidth = window.innerWidth - html.clientWidth
    html.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`
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
    html.style.overflow = snapshot.htmlOverflow
    html.style.overscrollBehavior = snapshot.htmlOverscroll
    body.style.overflow = snapshot.bodyOverflow
    body.style.overscrollBehavior = snapshot.bodyOverscroll
    body.style.paddingRight = snapshot.bodyPaddingRight
    snapshot = null
  }
}

export function useModalScrollLock(active = true, rootClassName?: string) {
  useEffect(() => {
    if (!active) return
    return acquireModalScrollLock(rootClassName)
  }, [active, rootClassName])
}
