import { useEffect, useRef } from 'react'

const dialogStack: symbol[] = []
const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface DialogFocusOptions {
  active?: boolean
  closeOnEscape?: boolean
  initialFocusSelector?: string
}

function focusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(element => {
    const style = window.getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden' && !element.closest('[inert]')
  })
}

export function useDialogFocus<T extends HTMLElement>(
  onClose: () => void,
  { active = true, closeOnEscape = true, initialFocusSelector = '[data-dialog-initial-focus]' }: DialogFocusOptions = {},
) {
  const rootRef = useRef<T>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!active) return
    const token = Symbol('dialog')
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogStack.push(token)

    const focusInitial = () => {
      const root = rootRef.current
      if (!root || dialogStack.at(-1) !== token) return
      const preferred = root.querySelector<HTMLElement>(initialFocusSelector)
      const target = preferred || focusableElements(root)[0] || root
      target.focus({ preventScroll: true })
    }
    const frame = window.requestAnimationFrame(focusInitial)

    const onKeyDown = (event: KeyboardEvent) => {
      if (dialogStack.at(-1) !== token) return
      const root = rootRef.current
      if (!root) return
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault()
        event.stopImmediatePropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = focusableElements(root)
      if (!focusable.length) {
        event.preventDefault()
        root.focus({ preventScroll: true })
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const current = document.activeElement
      if (event.shiftKey && (current === first || !root.contains(current))) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!event.shiftKey && (current === last || !root.contains(current))) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown, true)
      const index = dialogStack.lastIndexOf(token)
      if (index >= 0) dialogStack.splice(index, 1)
      window.requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus({ preventScroll: true })
      })
    }
  }, [active, closeOnEscape, initialFocusSelector])

  return rootRef
}
