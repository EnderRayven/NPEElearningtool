export interface DeferredPreloadTask {
  delayMs: number
  load: () => Promise<unknown>
}

export function scheduleDeferredPreloads(tasks: DeferredPreloadTask[]) {
  let cancelled = false
  let timeout: ReturnType<typeof setTimeout> | undefined
  let taskIndex = 0

  const scheduleNext = () => {
    if (cancelled || taskIndex >= tasks.length) return
    const task = tasks[taskIndex]
    taskIndex += 1
    timeout = setTimeout(() => {
      timeout = undefined
      if (cancelled) return
      void task.load()
        .catch(() => undefined)
        .finally(scheduleNext)
    }, Math.max(0, task.delayMs))
  }

  scheduleNext()

  return () => {
    cancelled = true
    if (timeout !== undefined) clearTimeout(timeout)
  }
}
