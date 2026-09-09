import { useEffect, useMemo, useRef, useState } from 'react'
import type { InboxRow, RepoSummary } from '@review/shared'
import { clampIndex, groupByRepo, groupCount, matchPrs, paletteCount, paletteRepoLabel, type PaletteRow } from './paletteRows'

type PrPaletteProps = {
  repos: RepoSummary[]
  /** Inbox rows across every tracked repo. */
  rows: InboxRow[]
  onOpen: (pr: InboxRow) => void
  onClose: () => void
}

/**
 * Screen 11 — "Open a pull request": top-anchored ⌘K palette. The input row is the header; results are
 * grouped by repository with fixed columns so titles ellipsize instead of colliding with the author.
 */
export function PrPalette({ repos, rows, onOpen, onClose }: PrPaletteProps) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const all = useMemo<PaletteRow[]>(() => {
    const labels = new Map(repos.map((r) => [r.id, paletteRepoLabel(r)]))
    return rows.map((pr) => ({ pr, repo: labels.get(pr.repoId) ?? '', author: pr.author }))
  }, [repos, rows])
  const matches = useMemo(() => matchPrs(all, query), [all, query])
  const groups = useMemo(() => groupByRepo(matches), [matches])
  const selected = clampIndex(index, matches.length)

  useEffect(() => input.current?.focus(), [])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex(clampIndex(selected + 1, matches.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex(clampIndex(selected - 1, matches.length))
    } else if (e.key === 'Enter') {
      const hit = matches[selected]
      if (!hit) return
      e.preventDefault()
      if (e.metaKey || e.ctrlKey) window.open(hit.pr.url, '_blank', 'noopener')
      else onOpen(hit.pr)
    }
  }

  let flat = 0
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" role="dialog" aria-label="Open a pull request" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-row">
          <span className="palette-glyph" aria-hidden>
            ⌕
          </span>
          <input
            ref={input}
            className="palette-input"
            placeholder="Open a pull request"
            value={query}
            aria-label="Open a pull request"
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            onKeyDown={onKeyDown}
          />
          <span className="palette-count">{paletteCount(matches.length, all.length, query)}</span>
        </div>
        <div ref={list} className="palette-results" role="listbox">
          {groups.map((group) => (
            <div key={group.repo}>
              <div className="palette-group">
                <span className="palette-group-name">{group.repo}</span>
                <span className="palette-group-count">{groupCount(group.rows.length)}</span>
              </div>
              {group.rows.map((row) => {
                const i = flat++
                const on = i === selected
                return (
                  <div
                    key={row.pr.id}
                    role="option"
                    aria-selected={on}
                    data-selected={on}
                    className={`palette-row${on ? ' palette-row-on' : ''}`}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => onOpen(row.pr)}
                  >
                    <span className="palette-num">#{row.pr.number}</span>
                    <span className="palette-title">{row.pr.title}</span>
                    <span className="palette-files">{row.pr.changedFiles} files</span>
                    <span className="palette-author">{row.author}</span>
                    <span className="palette-enter">↵</span>
                  </div>
                )
              })}
            </div>
          ))}
          {matches.length === 0 && (
            <div className="palette-empty">
              No pull request matches <span className="palette-query">{query}</span>
            </div>
          )}
        </div>
        <div className="palette-footer">
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>⌘↵ browser</span>
          <span className="palette-footer-right">esc close</span>
        </div>
      </div>
    </div>
  )
}
