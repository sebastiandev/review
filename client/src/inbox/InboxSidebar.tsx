import { CaretDown } from '@phosphor-icons/react'
import type { InboxRow, RepoSummary } from '@review/shared'
import { fetchLine, relativeTime } from './inboxRows'
import { StatePill } from './StatePill'

export const repoLabel = (repo: RepoSummary) => `${repo.owner}/${repo.name}`

type InboxSidebarProps = {
  repos: RepoSummary[]
  repo: RepoSummary
  /** Already sorted: manually added first. */
  rows: InboxRow[]
  selectedPrId: number | null
  repoMenuOpen: boolean
  syncing: boolean
  now: number
  width: number
  onSelectRepo: (repoId: number) => void
  onToggleRepoMenu: () => void
  onOpenPr: (prId: number) => void
  onAddPr: () => void
  onRefresh: () => void
  onDone: (prId: number) => void
  onStartResize: (e: React.PointerEvent<HTMLElement>) => void
}

/** PR-mode sidebar on the inbox: repo selector, "Assigned to you" header, fetch line and one row per PR. */
export function InboxSidebar({
  repos,
  repo,
  rows,
  selectedPrId,
  repoMenuOpen,
  syncing,
  now,
  width,
  onSelectRepo,
  onToggleRepoMenu,
  onOpenPr,
  onAddPr,
  onRefresh,
  onDone,
  onStartResize,
}: InboxSidebarProps) {
  return (
    <aside className="sidebar" style={{ width }}>
      <div className="inbox-head menu-anchor">
        <button type="button" className="selector" aria-haspopup="menu" aria-expanded={repoMenuOpen} onClick={onToggleRepoMenu}>
          <span className="dot dot-renamed" aria-hidden />
          <span className="selector-label">{repoLabel(repo)}</span>
          <CaretDown size={12} className="selector-glyph" />
        </button>
        {repoMenuOpen && (
          <div className="menu sidebar-menu" role="menu">
            {repos.map((r) => (
              <button
                key={r.id}
                type="button"
                role="menuitem"
                className={`menu-row${r.id === repo.id ? ' menu-row-current' : ''}`}
                onClick={() => onSelectRepo(r.id)}
              >
                <span className="menu-row-label">{repoLabel(r)}</span>
                <span className="menu-row-note mono">{r.activeCount}</span>
              </button>
            ))}
            <button type="button" role="menuitem" className="menu-footer-row" disabled title="Settings — phase 5">
              Manage repositories…
            </button>
          </div>
        )}
      </div>
      <div className="inbox-title-row">
        <span className="inbox-title">Assigned to you</span>
        <span className="inbox-count">{rows.length}</span>
        <button type="button" className="btn btn-ghost btn-xs inbox-add" title="Review a PR that isn't assigned to you" onClick={onAddPr}>
          Add PR
        </button>
        <button type="button" className="btn btn-ghost btn-xs" disabled={syncing} onClick={onRefresh}>
          {syncing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div className="inbox-fetch">
        {fetchLine({ syncedAt: repo.syncedAt, provider: repo.provider, assigned: repo.reviewRequestedCount, now })}
      </div>
      <div className="pr-list">
        {rows.map((pr) => (
          <div
            key={pr.id}
            role="button"
            tabIndex={0}
            className={`pr-row${pr.id === selectedPrId ? ' pr-row-on' : ''}`}
            aria-current={pr.id === selectedPrId || undefined}
            onClick={() => onOpenPr(pr.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onOpenPr(pr.id)
              }
            }}
          >
            <div className="pr-row-meta">
              <span>#{pr.number}</span>
              <StatePill state={pr.state} isDraft={pr.isDraft} />
              <span className="pr-row-time">{relativeTime(pr.updatedAt, now)}</span>
              <button
                type="button"
                className="btn btn-ghost pr-row-done"
                title="Mark as done"
                onClick={(e) => {
                  e.stopPropagation()
                  onDone(pr.id)
                }}
              >
                Done
              </button>
            </div>
            <div className="pr-row-title">{pr.title}</div>
            <div className="pr-row-stats">
              <span>{pr.changedFiles} files</span>
              <span className="count-add">+{pr.additions}</span>
              <span className="count-del">−{pr.deletions}</span>
              {pr.addedByUser && <span className="added-pill">added by you</span>}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="notice">Nothing assigned in this repository.</p>}
      </div>
      <div className="sidebar-resize" role="separator" aria-orientation="vertical" title="Drag to resize" onPointerDown={onStartResize} />
    </aside>
  )
}
