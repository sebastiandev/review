import { describe, expect, it } from 'vitest'
import { readDismissed, toggleDismissed, writeDismissed } from './dismissedFindings'

/** In-memory stand-in for localStorage. */
function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

describe('dismissed findings persistence', () => {
  it('round-trips a set of ids', () => {
    const storage = memoryStorage()
    writeDismissed(storage, new Set([3, 11]))
    expect(readDismissed(storage)).toEqual(new Set([3, 11]))
  })

  it('reads empty when nothing was stored', () => {
    expect(readDismissed(memoryStorage())).toEqual(new Set())
  })

  it('reads empty on malformed storage and drops non-numeric entries', () => {
    expect(readDismissed(memoryStorage({ 'review.dismissedFindings': '{not json' }))).toEqual(new Set())
    expect(readDismissed(memoryStorage({ 'review.dismissedFindings': '[1,"x",2]' }))).toEqual(new Set([1, 2]))
  })
})

describe('toggleDismissed', () => {
  it('adds and removes without mutating the input', () => {
    const initial: ReadonlySet<number> = new Set([1])
    const added = toggleDismissed(initial, 2, true)
    expect(added).toEqual(new Set([1, 2]))
    expect(toggleDismissed(added, 1, false)).toEqual(new Set([2]))
    expect(initial).toEqual(new Set([1]))
  })
})
