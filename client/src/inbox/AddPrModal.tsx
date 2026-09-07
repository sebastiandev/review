import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from '@phosphor-icons/react'
import type { PrPreview } from '@review/shared'
import { ApiError, addPrs, fetchOpenPrs, resolvePr } from '../api'
import { keys } from '../pr/queries'
import { Modal } from '../shell/Modal'
import { relativeTime } from './inboxRows'
import { StatePill } from './StatePill'

type AddPrModalProps = {
  repoId: number
  repo: string
  /** Numbers already in the inbox, to refuse duplicates before asking the server. */
  inboxNumbers: ReadonlySet<number>
  now: number
  onClose: () => void
  onAdded: (count: number) => void
}

function resolveMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 404) return 'No pull request matches that.'
  return `Could not resolve: ${e instanceof Error ? e.message : String(e)}`
}

/** "Review a PR": resolve a URL / `#n` / number into a preview, or pick from the repo's open PRs, then add. */
export function AddPrModal({ repoId, repo, inboxNumbers, now, onClose, onAdded }: AddPrModalProps) {
  const client = useQueryClient()
  const [input, setInput] = useState('')
  const [resolved, setResolved] = useState<PrPreview | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [picks, setPicks] = useState<Set<number>>(new Set())
  const [reviewOnOpen, setReviewOnOpen] = useState(true)

  const open = useQuery({ queryKey: ['open-prs', repoId], queryFn: () => fetchOpenPrs(repoId), staleTime: 60_000 })
  const candidates = (open.data ?? []).filter((p) => !inboxNumbers.has(p.number))

  const resolve = useMutation({
    mutationFn: () => resolvePr(repoId, input.trim()),
    onMutate: () => {
      setMessage(null)
      setResolved(null)
    },
    onSuccess: (result) => {
      if ('untrackedRepo' in result) {
        const { owner, name } = result.untrackedRepo
        setMessage(`${owner}/${name} is not tracked — track it in Settings.`)
        return
      }
      if (result.preview.stored || inboxNumbers.has(result.preview.number)) {
        setMessage(`#${result.preview.number} is already in your list.`)
        return
      }
      setResolved(result.preview)
    },
    onError: (e) => setMessage(resolveMessage(e)),
  })

  const numbers = [...(resolved ? [resolved.number] : []), ...picks]
  const add = useMutation({
    mutationFn: () => addPrs(repoId, numbers, reviewOnOpen),
    onSuccess: (rows) => {
      void client.invalidateQueries({ queryKey: keys.inbox(repoId) })
      void client.invalidateQueries({ queryKey: keys.repos })
      onAdded(rows.length)
    },
    onError: (e) => setMessage(`Could not add: ${e instanceof Error ? e.message : String(e)}`),
  })

  const togglePick = (number: number) =>
    setPicks((current) => {
      const next = new Set(current)
      if (next.has(number)) next.delete(number)
      else next.add(number)
      return next
    })

  const confirmLabel = numbers.length > 1 ? `Add ${numbers.length} PRs to my list` : 'Add to my list'

  return (
    <Modal label="Review a PR" maxWidth={520} onClose={onClose}>
      <div className="sheet-head">
        <h4>Review a PR</h4>
        <span className="sheet-hint">{repo}</span>
        <button type="button" className="ichat-btn modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="modal-lede">Anything you paste here is added to your list even if it is not assigned to you.</p>
      <div className="field">
        <label htmlFor="add-pr-input">PR URL or number</label>
        <div className="add-input-row">
          <input
            id="add-pr-input"
            className="input mono add-input"
            value={input}
            placeholder="github.com/owner/repo/pull/415 · #415 · 415"
            autoFocus
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && input.trim()) {
                e.preventDefault()
                resolve.mutate()
              }
            }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            disabled={!input.trim() || resolve.isPending}
            onClick={() => resolve.mutate()}
          >
            {resolve.isPending ? 'Resolving…' : 'Resolve'}
          </button>
        </div>
      </div>
      {message && <p className="modal-error">{message}</p>}
      {resolved && (
        <div className="preview-card">
          <div className="pr-row-meta">
            <span>#{resolved.number}</span>
            <StatePill state={resolved.state} isDraft={resolved.isDraft} />
            <span className="pr-row-time">updated {relativeTime(resolved.updatedAt, now)}</span>
          </div>
          <div className="pr-row-title">{resolved.title}</div>
          <div className="pr-row-stats">
            <span>{resolved.author}</span>
            <span>{resolved.headRef}</span>
            <span>{resolved.changedFiles} files</span>
            <span className="count-add">+{resolved.additions}</span>
            <span className="count-del">−{resolved.deletions}</span>
          </div>
        </div>
      )}
      <div className="overline modal-overline">Or pick an open PR in this repo</div>
      <div className="pick-list">
        {open.isPending && <p className="notice">Loading open PRs…</p>}
        {open.isError && <p className="notice">Could not list open PRs.</p>}
        {open.isSuccess && candidates.length === 0 && <p className="notice">No other open PRs.</p>}
        {candidates.map((p) => {
          const picked = picks.has(p.number)
          return (
            <button key={p.number} type="button" className="pick-row" aria-pressed={picked} onClick={() => togglePick(p.number)}>
              <span className={`checkbox${picked ? ' checkbox-on' : ''}`}>{picked && <Check size={10} weight="bold" />}</span>
              <span className="pick-text">
                <span className="pick-title">{p.title}</span>
                <span className="pick-meta">
                  #{p.number} · {p.author} · {relativeTime(p.updatedAt, now)}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <label className="check-label">
        <button
          type="button"
          role="checkbox"
          aria-checked={reviewOnOpen}
          className={`checkbox${reviewOnOpen ? ' checkbox-on' : ''}`}
          onClick={() => setReviewOnOpen((v) => !v)}
        >
          {reviewOnOpen && <Check size={10} weight="bold" />}
        </button>
        <span>Run the automatic review once the worktree is ready</span>
      </label>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" disabled={numbers.length === 0 || add.isPending} onClick={() => add.mutate()}>
          {add.isPending ? 'Adding…' : confirmLabel}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <span className="modal-note">a worktree is created on open</span>
      </div>
    </Modal>
  )
}
