import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchInbox, fetchPrDetail, fetchRepos, fetchSettings } from '../api'
import { useServerEvent } from '../events/useServerEvents'

/** Query keys of PR-mode server state, in one place so events and mutations invalidate the same keys. */
export const keys = {
  repos: ['repos'] as const,
  settings: ['settings'] as const,
  inbox: (repoId: number) => ['inbox', repoId] as const,
  pr: (prId: number) => ['pr', prId] as const,
  file: (scope: string, path: string | null) => ['file', scope, path] as const,
}

/** Tracked repos. Fails once, without retry, when the server runs in diff mode; that failure is the mode probe. */
export function useRepos() {
  return useQuery({ queryKey: keys.repos, queryFn: fetchRepos, retry: false, staleTime: 30_000 })
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: fetchSettings, staleTime: Infinity })
}

export function useInbox(repoId: number | null) {
  return useQuery({
    queryKey: keys.inbox(repoId ?? 0),
    queryFn: () => fetchInbox(repoId ?? 0),
    enabled: repoId !== null,
    staleTime: 30_000,
  })
}

export function usePrDetail(prId: number | null) {
  return useQuery({
    queryKey: keys.pr(prId ?? 0),
    queryFn: () => fetchPrDetail(prId ?? 0),
    enabled: prId !== null,
    staleTime: 60_000,
  })
}

/** Refetches inbox and repo counts when a sync ends, and the open PR when its review lands. */
export function useSyncInvalidation(): void {
  const client = useQueryClient()
  useServerEvent((event) => {
    switch (event.type) {
      case 'sync.finished':
        void client.invalidateQueries({ queryKey: keys.inbox(event.repoId) })
        void client.invalidateQueries({ queryKey: keys.repos })
        break
      case 'sync.failed':
        void client.invalidateQueries({ queryKey: keys.repos })
        break
      case 'review.submitted':
        void client.invalidateQueries({ queryKey: keys.pr(event.prId) })
        break
    }
  })
}
