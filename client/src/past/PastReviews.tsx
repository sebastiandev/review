import { useMutation, useQueryClient } from '@tanstack/react-query'
import { removeWorktrees, reopenPr } from '../api'
import { keys, usePastReviews, useWorktrees } from '../pr/queries'
import { formatBytes } from '../settings/bytes'
import { FILTER_LABEL, PAST_FILTERS, VERDICT_LABEL, filterVerdict, verdictPillClass, withWorktreePaths, type PastFilter } from './pastRows'

type PastSidebarProps = {
  filter: PastFilter
  width: number
  onFilter: (filter: PastFilter) => void
  onStartResize: (e: React.PointerEvent<HTMLElement>) => void
}

/** Past-reviews sidebar: the verdict filter list. */
export function PastSidebar({ filter, width, onFilter, onStartResize }: PastSidebarProps) {
  return (
    <aside className="sidebar" style={{ width }}>
      <div className="side-nav" role="listbox" aria-label="Filter">
        {PAST_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="option"
            aria-selected={f === filter}
            className={`side-nav-row${f === filter ? ' side-nav-row-on' : ''}`}
            onClick={() => onFilter(f)}
          >
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>
      <div className="sidebar-resize" role="separator" aria-orientation="vertical" title="Drag to resize" onPointerDown={onStartResize} />
    </aside>
  )
}

type PastReviewsProps = {
  filter: PastFilter
  onManageWorktrees: () => void
  onFlash: (text: string) => void
}

/** Screen 6: the table of submitted reviews with verdict, agent agreement and worktree, plus the disk total. */
export function PastReviews({ filter, onManageWorktrees, onFlash }: PastReviewsProps) {
  const client = useQueryClient()
  const reviews = usePastReviews(filterVerdict(filter))
  const worktrees = useWorktrees()
  const lines = withWorktreePaths(reviews.data ?? [], worktrees.data?.rows ?? [])

  const remove = useMutation({
    mutationFn: (prId: number) => removeWorktrees([prId]),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.worktrees }),
    onError: (e) => onFlash(`could not remove the worktree: ${e instanceof Error ? e.message : String(e)}`),
  })
  const reopen = useMutation({
    mutationFn: (prId: number) => reopenPr(prId),
    onSuccess: (_result, prId) => {
      void client.invalidateQueries({ queryKey: ['inbox'] })
      void client.invalidateQueries({ queryKey: keys.repos })
      const line = lines.find((l) => l.prId === prId)
      onFlash(line ? `#${line.number} is back in the inbox` : 'reopened')
    },
    onError: (e) => onFlash(`could not reopen: ${e instanceof Error ? e.message : String(e)}`),
  })
  const busy = remove.isPending || reopen.isPending

  const subtitle = (() => {
    const n = reviews.data?.length ?? 0
    const what = filter === 'all' ? 'review' : `${FILTER_LABEL[filter].toLowerCase()} review`
    return `${n} ${what}${n === 1 ? '' : 's'} · agent agreement is how the automatic reviewer earns trust`
  })()

  return (
    <div className="inbox">
      <div className="past-column">
        <h4 className="inbox-heading">Past reviews</h4>
        <div className="inbox-subtitle">{subtitle}</div>
        {reviews.isPending && <p className="notice">Loading reviews…</p>}
        {reviews.isError && <p className="notice">Could not load reviews: {String(reviews.error)}</p>}
        {reviews.isSuccess && lines.length === 0 && <p className="notice">No reviews submitted yet.</p>}
        {lines.length > 0 && (
          <table className="table past-table">
            <thead>
              <tr>
                <th>PR</th>
                <th>Title</th>
                <th>Your verdict</th>
                <th>Agent</th>
                <th>Worktree</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.submissionId}>
                  <td className="mono past-ref">
                    <a href={line.url} target="_blank" rel="noreferrer">
                      {line.repo}#{line.number}
                    </a>
                  </td>
                  <td className="past-title">{line.title}</td>
                  <td>
                    <span className={verdictPillClass(line.verdict)}>{VERDICT_LABEL[line.verdict]}</span>
                  </td>
                  <td className={`past-agent past-agent-${line.agentAgreement.replace(' ', '-')}`}>{line.agentAgreement}</td>
                  <td className="mono past-path">{line.worktreePath ?? '—'}</td>
                  <td className="past-action">
                    {line.worktreePath ? (
                      <button type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={() => remove.mutate(line.prId)}>
                        Remove worktree
                      </button>
                    ) : (
                      <button type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={() => reopen.mutate(line.prId)}>
                        Reopen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="past-foot">
          <button type="button" className="btn btn-secondary btn-xs" onClick={onManageWorktrees}>
            Manage worktrees
          </button>
          {worktrees.data && (
            <span className="past-total">
              {worktrees.data.rows.length} worktree{worktrees.data.rows.length === 1 ? '' : 's'} · {formatBytes(worktrees.data.totalBytes)} on disk
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
