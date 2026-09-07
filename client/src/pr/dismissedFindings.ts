import { useCallback, useMemo, useState } from 'react'

const KEY = 'review.dismissedFindings'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

/** Finding ids dismissed client-side. Unreadable or malformed storage reads as empty. */
export function readDismissed(storage: Storage): Set<number> {
  const raw = storage.getItem(KEY)
  if (!raw) return new Set()
  try {
    const parsed: unknown = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : [])
  } catch {
    return new Set()
  }
}

export function writeDismissed(storage: Storage, ids: ReadonlySet<number>): void {
  storage.setItem(KEY, JSON.stringify([...ids]))
}

/** `ids` with `id` added (dismiss) or removed (undo). */
export function toggleDismissed(ids: ReadonlySet<number>, id: number, dismissed: boolean): Set<number> {
  const next = new Set(ids)
  if (dismissed) next.add(id)
  else next.delete(id)
  return next
}

export type DismissedFindings = {
  ids: ReadonlySet<number>
  set: (id: number, dismissed: boolean) => void
}

/** Dismissed finding ids, persisted in localStorage. The server never deletes findings, so this is the only record. */
export function useDismissedFindings(): DismissedFindings {
  const [ids, setIds] = useState<ReadonlySet<number>>(() => readDismissed(localStorage))
  const set = useCallback((id: number, dismissed: boolean) => {
    setIds((current) => {
      const next = toggleDismissed(current, id, dismissed)
      writeDismissed(localStorage, next)
      return next
    })
  }, [])
  return useMemo(() => ({ ids, set }), [ids, set])
}
