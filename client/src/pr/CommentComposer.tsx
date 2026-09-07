import { useState, type KeyboardEvent } from 'react'

type CommentComposerProps = {
  /** `{path}:{line}` shown above the textarea. */
  reference: string
  placeholder: string
  initial?: string
  submitLabel: string
  busy?: boolean
  onSubmit: (body: string) => void
  onCancel: () => void
  /** "Ask agent instead", pushed right; absent on edit and reply composers. */
  onAsk?: () => void
}

/** Textarea with Add to review · Cancel · Ask agent instead. `⌘⏎` submits; `esc` cancels. */
export function CommentComposer({
  reference,
  placeholder,
  initial = '',
  submitLabel,
  busy = false,
  onSubmit,
  onCancel,
  onAsk,
}: CommentComposerProps) {
  const [body, setBody] = useState(initial)
  const canSubmit = body.trim().length > 0 && !busy

  const submit = () => {
    if (canSubmit) onSubmit(body.trim())
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    }
  }

  return (
    <div className="composer-card">
      <div className="artifact-ref">{reference}</div>
      <textarea
        className="input composer-text"
        value={body}
        placeholder={placeholder}
        autoFocus
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="artifact-actions">
        <button type="button" className="btn btn-primary btn-xs" disabled={!canSubmit} onClick={submit}>
          {submitLabel}
        </button>
        <button type="button" className="btn btn-secondary btn-xs" onClick={onCancel}>
          Cancel
        </button>
        {onAsk && (
          <button type="button" className="btn btn-ghost btn-xs artifact-push" onClick={onAsk}>
            Ask agent instead
          </button>
        )}
      </div>
    </div>
  )
}
