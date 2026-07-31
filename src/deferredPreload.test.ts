import { afterEach, describe, expect, it, vi } from 'vitest'
import { scheduleDeferredPreloads } from './deferredPreload'

afterEach(() => {
  vi.useRealTimers()
})

describe('scheduleDeferredPreloads', () => {
  it('loads modules one at a time after their configured delays', async () => {
    vi.useFakeTimers()
    const loaded: string[] = []

    scheduleDeferredPreloads([
      { delayMs: 400, load: async () => { loaded.push('settings') } },
      { delayMs: 250, load: async () => { loaded.push('notes') } },
      { delayMs: 900, load: async () => { loaded.push('editor') } },
    ])

    await vi.advanceTimersByTimeAsync(399)
    expect(loaded).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(loaded).toEqual(['settings'])
    await vi.advanceTimersByTimeAsync(250)
    expect(loaded).toEqual(['settings', 'notes'])
    await vi.advanceTimersByTimeAsync(900)
    expect(loaded).toEqual(['settings', 'notes', 'editor'])
  })

  it('continues preloading after one module fails', async () => {
    vi.useFakeTimers()
    const loaded: string[] = []

    scheduleDeferredPreloads([
      { delayMs: 10, load: async () => { throw new Error('temporary load failure') } },
      { delayMs: 20, load: async () => { loaded.push('next') } },
    ])

    await vi.advanceTimersByTimeAsync(30)
    expect(loaded).toEqual(['next'])
  })

  it('cancels pending preload work when the app unmounts', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => {})
    const cancel = scheduleDeferredPreloads([{ delayMs: 100, load }])

    cancel()
    await vi.advanceTimersByTimeAsync(100)

    expect(load).not.toHaveBeenCalled()
  })
})
