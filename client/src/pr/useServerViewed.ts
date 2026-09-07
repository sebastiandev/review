import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { PrDetail } from '@review/shared'
import { putViewed, type ViewedMark } from '../api'
import type { ViewedState } from '../files/useViewed'
import { keys } from './queries'

/** Viewed marks of a PR, keyed by head sha and stored server-side; toggling writes through and updates the cached detail. */
export function useServerViewed(prId: number, detail: PrDetail | undefined): ViewedState {
  const client = useQueryClient()
  const headSha = detail?.pr.headSha
  const marks = detail?.viewed

  const viewed = useMemo(() => new Set((marks ?? []).filter((m) => m.headSha === headSha).map((m) => m.path)), [marks, headSha])

  const toggle = useCallback(
    (path: string) => {
      if (!headSha) return
      const next = viewed.has(path) ? null : headSha
      void putViewed(prId, path, next).then((all: ViewedMark[]) => {
        client.setQueryData<PrDetail>(keys.pr(prId), (current) => (current ? { ...current, viewed: all } : current))
      })
    },
    [client, prId, headSha, viewed],
  )

  return { viewed, toggle }
}
