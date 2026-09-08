import { useEffect, useSyncExternalStore } from 'react'
import type { PickerItem } from '../chat/Picker'

export type SearchTargets = { placeholder: string; items: PickerItem[]; onPick: (item: PickerItem) => void }

let current: SearchTargets | null = null
const listeners = new Set<() => void>()

function set(next: SearchTargets | null) {
  current = next
  listeners.forEach((l) => l())
}

/** What ⌘K searches right now, published by whichever screen is mounted (files of the open diff, PRs of the inbox). */
export function useSearchTargets(): SearchTargets | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

/** Publish `targets` while mounted; cleared on unmount so a stale screen never answers a search. */
export function usePublishSearchTargets(targets: SearchTargets | null): void {
  useEffect(() => {
    set(targets)
    return () => set(null)
  }, [targets])
}
