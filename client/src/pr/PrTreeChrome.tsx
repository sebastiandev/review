import type { PrDetail } from '@review/shared'
import { worktreeLabel, type WorktreeState } from './useWorktree'

type PrTreeHeaderProps = {
  pr: PrDetail['pr']
  onBack: () => void
  onDone: () => void
}

/** PR-mode sidebar header: `← All PRs`, the PR title, its branch, and a `Done` ghost action. */
export function PrTreeHeader({ pr, onBack, onDone }: PrTreeHeaderProps) {
  return (
    <div className="sidebar-head">
      <div className="pr-head-row">
        <button type="button" className="btn btn-ghost btn-xs pr-back" onClick={onBack}>
          ← All PRs
        </button>
        <button type="button" className="btn btn-ghost btn-xs artifact-push" title="Mark as done" onClick={onDone}>
          Done
        </button>
      </div>
      <div className="sidebar-title">
        <span className="mono pr-head-number">#{pr.number}</span> {pr.title}
      </div>
      <div className="sidebar-meta" title={pr.headRef}>
        {pr.headRef}
      </div>
    </div>
  )
}

type PrTreeFooterProps = {
  worktree: WorktreeState
  pendingCount: number
  onSubmit: () => void
}

/** PR-mode sidebar footer: worktree path (or its stage) and `Submit review · n`. */
export function PrTreeFooter({ worktree, pendingCount, onSubmit }: PrTreeFooterProps) {
  const line =
    worktree.status === 'ready'
      ? worktree.path
      : worktree.status === 'failed'
        ? `worktree failed: ${worktree.message}`
        : `${worktreeLabel(worktree)}…`
  return (
    <div className="pr-foot">
      <div className={`pr-foot-path${worktree.status === 'failed' ? ' pr-foot-failed' : ''}`} title={line}>
        {line}
      </div>
      <button type="button" className="btn btn-primary btn-block pr-submit" onClick={onSubmit}>
        Submit review · {pendingCount}
      </button>
    </div>
  )
}
