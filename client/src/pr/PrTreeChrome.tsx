import { ArrowSquareOut } from '@phosphor-icons/react'
import type { PrDetail, Verdict } from '@review/shared'
import { ReviewedPill } from '../inbox/ReviewedPill'
import { worktreeLabel, type WorktreeState } from './useWorktree'

type PrTreeHeaderProps = {
  pr: PrDetail['pr']
  /** Verdict submitted on the current head, if any. */
  submittedVerdict: Verdict | null
  onBack: () => void
  onDone: () => void
}

/** PR-mode sidebar header: `← All PRs`, the PR title, its branch, and a `Done` ghost action. */
export function PrTreeHeader({ pr, submittedVerdict, onBack, onDone }: PrTreeHeaderProps) {
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
      <div className="sidebar-meta pr-head-meta" title={pr.headRef}>
        <span className="pr-head-branch">{pr.headRef}</span>
        <ReviewedPill verdict={submittedVerdict} />
        <a href={pr.url} target="_blank" rel="noreferrer" className="pr-head-link" title="Open on GitHub">
          GitHub <ArrowSquareOut size={12} />
        </a>
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
