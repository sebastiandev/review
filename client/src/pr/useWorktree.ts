import { useEffect, useState } from 'react'
import type { WorktreeStage } from '@review/shared'
import { useServerEvent } from '../events/useServerEvents'

export type WorktreeState =
  { status: 'pending'; stage: WorktreeStage | 'creating' } | { status: 'ready'; path: string } | { status: 'failed'; message: string }

const STAGE_LABEL: Record<WorktreeStage | 'creating', string> = {
  creating: 'creating worktree',
  cloning: 'cloning',
  fetching: 'fetching',
  'checking-out': 'checking out',
  ready: 'ready',
}

/** `creating worktree` … `worktree ready` / `worktree failed`. */
export function worktreeLabel(state: WorktreeState): string {
  switch (state.status) {
    case 'pending':
      return STAGE_LABEL[state.stage]
    case 'ready':
      return 'worktree ready'
    case 'failed':
      return 'worktree failed'
  }
}

/**
 * Worktree progress of one PR, driven by `worktree.*` events. Seeded ready from `knownPath`
 * (the detail's `worktreePath`), else pending at `creating` until the first event.
 */
export function useWorktree(prId: number, knownPath: string | null | undefined): WorktreeState {
  const [state, setState] = useState<WorktreeState>({ status: 'pending', stage: 'creating' })

  useEffect(() => {
    setState({ status: 'pending', stage: 'creating' })
  }, [prId])

  // A detail fetched before `worktree.ready` landed still says null; only a known path may override events.
  useEffect(() => {
    if (knownPath) setState({ status: 'ready', path: knownPath })
  }, [knownPath])

  useServerEvent((event) => {
    if (!('prId' in event) || event.prId !== prId) return
    switch (event.type) {
      case 'worktree.progress':
        setState({ status: 'pending', stage: event.stage })
        break
      case 'worktree.ready':
        setState({ status: 'ready', path: event.path })
        break
      case 'worktree.failed':
        setState({ status: 'failed', message: event.message })
        break
      case 'worktree.removed':
        setState({ status: 'pending', stage: 'creating' })
        break
    }
  })

  return state
}
