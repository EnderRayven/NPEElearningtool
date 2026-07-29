export interface ScreenWakeLockSentinel {
  readonly released: boolean
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
}

interface ScreenWakeLock {
  request: (type: 'screen') => Promise<ScreenWakeLockSentinel>
}

type NavigatorWithScreenWakeLock = Navigator & { wakeLock?: ScreenWakeLock }

function getScreenWakeLock() {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as NavigatorWithScreenWakeLock).wakeLock
}

export function isScreenWakeLockSupported() {
  return typeof getScreenWakeLock()?.request === 'function'
}

export function requestScreenWakeLock() {
  const wakeLock = getScreenWakeLock()
  if (!wakeLock) return Promise.reject(new Error('Screen Wake Lock API is not supported'))
  return wakeLock.request('screen')
}
