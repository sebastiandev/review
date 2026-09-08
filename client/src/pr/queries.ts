import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UserSettings, Verdict } from '@review/shared'
import { fetchAccount, fetchAccountRepos, fetchConfig, fetchInbox, fetchPastReviews, fetchPrDetail, fetchRepos, fetchSettings, fetchWorktrees, patchSettings } from '../api'
import { useServerEvent } from '../events/useServerEvents'

/** Query keys of PR-mode server state, in one place so events and mutations invalidate the same keys. */
export const keys = {
  repos: ['repos'] as const,
  settings: ['settings'] as const,
  config: ['config'] as const,
  account: ['account'] as const,
  accountRepos: ['account', 'repos'] as const,
  worktrees: ['worktrees'] as const,
  pastReviews: (verdict: Verdict | null) => ['past-reviews', verdict] as const,
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

/** Agents, models and commands opencode offers. Shared by the dock pickers and Settings → Review agent. */
export function useConfig() {
  return useQuery({ queryKey: keys.config, queryFn: fetchConfig, staleTime: Infinity })
}

/** `PATCH /api/settings`; the settings and config queries pick up the result at once. */
export function useUpdateSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<UserSettings>) => patchSettings(patch),
    onSuccess: (settings) => {
      client.setQueryData(keys.settings, settings)
      void client.invalidateQueries({ queryKey: keys.config })
    },
  })
}

export function useAccount() {
  return useQuery({ queryKey: keys.account, queryFn: fetchAccount, staleTime: Infinity })
}

export function useAccountRepos(enabled: boolean) {
  return useQuery({ queryKey: keys.accountRepos, queryFn: fetchAccountRepos, enabled, staleTime: 60_000 })
}

export function useWorktrees(enabled = true) {
  return useQuery({ queryKey: keys.worktrees, queryFn: fetchWorktrees, enabled, staleTime: 30_000 })
}

export function usePastReviews(verdict: Verdict | null) {
  return useQuery({ queryKey: keys.pastReviews(verdict), queryFn: () => fetchPastReviews(verdict), staleTime: 30_000 })
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

/**
 * Refetches inbox and repo counts when a sync ends, the open PR when its review lands, the PR plus
 * every inbox on each agent-run event (the event names the PR, not its repo), and the worktree
 * inventory when one appears or goes.
 */
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
        void client.invalidateQueries({ queryKey: ['past-reviews'] })
        break
      case 'worktree.ready':
      case 'worktree.removed':
        void client.invalidateQueries({ queryKey: keys.worktrees })
        break
      case 'review.queued':
      case 'review.running':
      case 'review.ready':
      case 'review.failed':
        void client.invalidateQueries({ queryKey: keys.pr(event.prId) })
        void client.invalidateQueries({ queryKey: ['inbox'] })
        break
    }
  })
}
