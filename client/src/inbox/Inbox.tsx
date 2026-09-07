import type { InboxRow } from '@review/shared'
import { AgentStatus } from './AgentStatus'
import { relativeTime } from './inboxRows'
import { StatePill } from './StatePill'

type InboxProps = {
  repo: string
  subtitle: string
  /** Already sorted: manually added first. */
  rows: InboxRow[]
  selectedPrId: number | null
  now: number
  onOpenPr: (prId: number) => void
}

/** Center pane of the inbox: "Pending review", the live subtitle and one card per PR. */
export function Inbox({ repo, subtitle, rows, selectedPrId, now, onOpenPr }: InboxProps) {
  return (
    <div className="inbox">
      <div className="inbox-column">
        <h4 className="inbox-heading">Pending review</h4>
        <div className="inbox-subtitle">{subtitle}</div>
        {rows.map((pr) => (
          <div
            key={pr.id}
            role="button"
            tabIndex={0}
            className={`inbox-card${pr.id === selectedPrId ? ' inbox-card-on' : ''}`}
            onClick={() => onOpenPr(pr.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onOpenPr(pr.id)
              }
            }}
          >
            <div className="inbox-card-meta">
              <span>
                {repo} · #{pr.number}
              </span>
              <StatePill state={pr.state} isDraft={pr.isDraft} />
              <span className="pr-row-time">{relativeTime(pr.updatedAt, now)}</span>
            </div>
            <div className="inbox-card-title">{pr.title}</div>
            <div className="inbox-card-stats">
              <span className="mono">{pr.headRef}</span>
              <span>{pr.changedFiles} files</span>
              <span className="count-add">+{pr.additions}</span>
              <span className="count-del">−{pr.deletions}</span>
              <span>{pr.remoteCommentCount} comments</span>
              {pr.draftCommentCount > 0 && <span>{pr.draftCommentCount} pending</span>}
              {pr.addedByUser && <span className="added-pill">added by you</span>}
              <AgentStatus status={pr.agentStatus} verdict={pr.agentVerdict} />
            </div>
            {pr.specRef && (
              <div className="inbox-card-spec">
                <span className="inbox-card-spec-path">{pr.specRef}</span>
                <span className="inbox-card-spec-note">spec referenced in the description</span>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="inbox-subtitle">Nothing to review here.</p>}
      </div>
    </div>
  )
}
