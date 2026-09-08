import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, LOCAL_SCOPE, openLocalScope } from '../api'

const RECENT_KEY = 'review.recentScopes'
const RECENT_MAX = 6

function recentScopes(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

/** `path` first, duplicates removed, capped. */
export function rememberScope(recent: string[], path: string): string[] {
  return [path, ...recent.filter((p) => p !== path)].slice(0, RECENT_MAX)
}

type OpenScopeFormProps = {
  /** Shown above the form: why there is nothing yet, or what to change. */
  lede: string
  onOpened: () => void
  onCancel?: () => void
}

/** Diff mode's "what should I show": a repo folder (optionally vs a base ref) or a `.diff`/`.patch` file. */
export function OpenScopeForm({ lede, onOpened, onCancel }: OpenScopeFormProps) {
  const client = useQueryClient()
  const [target, setTarget] = useState('')
  const [base, setBase] = useState('')
  const [recent, setRecent] = useState<string[]>(recentScopes)
  const [error, setError] = useState<string | null>(null)

  const open = useMutation({
    mutationFn: (req: { target: string; base: string | null }) => openLocalScope(req),
    onSuccess: (_result, req) => {
      const next = rememberScope(recent, req.target)
      setRecent(next)
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      void client.invalidateQueries({ queryKey: ['diff', LOCAL_SCOPE] })
      void client.invalidateQueries({ queryKey: ['threads', LOCAL_SCOPE] })
      onOpened()
    },
    onError: (e) => setError(e instanceof ApiError && e.status === 404 ? 'That path does not exist on this machine.' : e instanceof Error ? e.message : String(e)),
  })

  const submit = (path: string) => {
    const trimmed = path.trim()
    if (!trimmed) return
    setError(null)
    open.mutate({ target: trimmed, base: base.trim() || null })
  }

  return (
    <div className="open-scope">
      <h4 className="inbox-heading">Diff mode</h4>
      <p className="inbox-subtitle">{lede}</p>
      <form
        className="open-scope-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit(target)
        }}
      >
        <div className="field">
          <label htmlFor="scope-target">Folder or patch file</label>
          <input
            id="scope-target"
            className="input mono"
            value={target}
            placeholder="~/src/project   ·   ~/Downloads/change.diff"
            autoFocus
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="scope-base">Compare against (optional, folders only)</label>
          <input id="scope-base" className="input mono" value={base} placeholder="main · origin/develop · a commit" onChange={(e) => setBase(e.target.value)} />
        </div>
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" disabled={!target.trim() || open.isPending}>
            {open.isPending ? 'Opening…' : 'Open'}
          </button>
          {onCancel && (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          <span className="modal-note">Uncommitted changes when no base is given. Paths are on the machine running the server.</span>
        </div>
      </form>
      {recent.length > 0 && (
        <>
          <div className="overline modal-overline">Recent</div>
          <div className="pick-list">
            {recent.map((path) => (
              <button key={path} type="button" className="pick-row" disabled={open.isPending} onClick={() => submit(path)}>
                <span className="pick-text">
                  <span className="pick-title mono">{path}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
