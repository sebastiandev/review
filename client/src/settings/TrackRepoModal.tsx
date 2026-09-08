import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from '@phosphor-icons/react'
import type { RepoSummary } from '@review/shared'
import { trackRepo, type TrackRepoRequest } from '../api'
import { keys, useAccountRepos } from '../pr/queries'
import { Modal } from '../shell/Modal'
import { Segmented } from '../shell/Segmented'
import { parseRepoSlug, untrackedAccountRepos } from './accountRepos'

type Provider = TrackRepoRequest['provider']

type TrackRepoModalProps = {
  repos: RepoSummary[]
  onClose: () => void
  onTracked: (count: number) => void
}

/** "Track a repository": type `owner/name`, or pick from the connected account, then track them all. */
export function TrackRepoModal({ repos, onClose, onTracked }: TrackRepoModalProps) {
  const client = useQueryClient()
  const [provider, setProvider] = useState<Provider>('github')
  const [slug, setSlug] = useState('')
  const [picks, setPicks] = useState<Set<string>>(new Set())
  const [autoReview, setAutoReview] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const account = useAccountRepos(provider === 'github')
  const candidates = untrackedAccountRepos(account.data ?? [], repos)

  const typed = parseRepoSlug(slug)
  const requests: TrackRepoRequest[] = [
    ...(typed ? [{ provider, ...typed, autoReview }] : []),
    ...candidates.filter((r) => picks.has(`${r.owner}/${r.name}`)).map((r) => ({ provider: 'github' as const, owner: r.owner, name: r.name, autoReview })),
  ]

  const track = useMutation({
    mutationFn: async () => {
      for (const req of requests) await trackRepo(req)
      return requests.length
    },
    onSuccess: (count) => {
      void client.invalidateQueries({ queryKey: keys.repos })
      void client.invalidateQueries({ queryKey: keys.accountRepos })
      onTracked(count)
    },
    onError: (e) => setMessage(`Could not track: ${e instanceof Error ? e.message : String(e)}`),
  })

  const togglePick = (key: string) =>
    setPicks((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const confirmLabel = requests.length > 1 ? `Track ${requests.length} repositories` : 'Track repository'

  return (
    <Modal label="Track a repository" maxWidth={500} onClose={onClose}>
      <div className="sheet-head">
        <h4>Track a repository</h4>
        <button type="button" className="ichat-btn modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="field">
        <label htmlFor="track-repo-input">Repository</label>
        <div className="add-input-row">
          <input
            id="track-repo-input"
            className="input mono add-input"
            value={slug}
            placeholder="owner/name"
            autoFocus
            onChange={(e) => setSlug(e.target.value)}
          />
          <Segmented<Provider>
            label="Provider"
            value={provider}
            options={[
              { value: 'github', label: 'GitHub' },
              { value: 'gitlab', label: 'GitLab', disabled: true, title: 'GitLab is not connected yet' },
            ]}
            onChange={setProvider}
          />
        </div>
        {slug.trim() && !typed && <p className="modal-error">Type it as owner/name.</p>}
      </div>
      {message && <p className="modal-error">{message}</p>}
      <div className="overline modal-overline">Or pick from your account</div>
      <div className="pick-list">
        {account.isPending && <p className="notice">Loading repositories…</p>}
        {account.isError && <p className="notice">Could not list the account's repositories.</p>}
        {account.isSuccess && candidates.length === 0 && <p className="notice">Every repository on the account is already tracked.</p>}
        {candidates.map((r) => {
          const key = `${r.owner}/${r.name}`
          const picked = picks.has(key)
          return (
            <button key={key} type="button" className="pick-row" aria-pressed={picked} onClick={() => togglePick(key)}>
              <span className={`checkbox${picked ? ' checkbox-on' : ''}`}>{picked && <Check size={10} weight="bold" />}</span>
              <span className="pick-text">
                <span className="pick-title mono">{key}</span>
                <span className="pick-meta">
                  {r.openPrCount} open PR{r.openPrCount === 1 ? '' : 's'}
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
          aria-checked={autoReview}
          className={`checkbox${autoReview ? ' checkbox-on' : ''}`}
          onClick={() => setAutoReview((v) => !v)}
        >
          {autoReview && <Check size={10} weight="bold" />}
        </button>
        <span>Run the automatic review on this repository too</span>
      </label>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" disabled={requests.length === 0 || track.isPending} onClick={() => track.mutate()}>
          {track.isPending ? 'Tracking…' : confirmLabel}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
