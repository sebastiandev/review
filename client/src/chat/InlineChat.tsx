import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ChatPart, ChatThreadRef, PermissionAsk, PermissionReply } from '@review/shared'
import { splitInlineCode } from './inlineCode'
import type { ThreadState } from './threadStore'

type InlineChatProps = {
  thread: ChatThreadRef
  state: ThreadState
  /** Plain text only; the caller attaches the turn settings. */
  onSend: (text: string) => void
  onPermission: (permissionID: string, reply: PermissionReply) => void
  onMinimize: () => void
  onClose: () => void
}

function InlinePart({ part }: { part: ChatPart }) {
  switch (part.type) {
    case 'text':
      if (part.role === 'user') return <div className="ichat-user">{part.text}</div>
      return (
        <div className="ichat-agent">
          {splitInlineCode(part.text).map((segment, i) =>
            segment.kind === 'code' ? <code key={i} className="ichat-code">{segment.text}</code> : segment.text,
          )}
        </div>
      )
    case 'tool':
      return (
        <div className={`ichat-tool ichat-tool-${part.status}`}>
          {part.tool} · {part.title}
        </div>
      )
    case 'reasoning':
      return <div className="ichat-tool">reasoning</div>
  }
}

function InlinePermission({ ask, onPermission }: { ask: PermissionAsk; onPermission: InlineChatProps['onPermission'] }) {
  return (
    <div className="permission">
      <span className="permission-title">{ask.title}</span>
      <span className="permission-actions">
        <button type="button" className="btn btn-primary btn-xs" onClick={() => onPermission(ask.id, 'once')}>
          Allow once
        </button>
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => onPermission(ask.id, 'always')}>
          Always
        </button>
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => onPermission(ask.id, 'reject')}>
          Reject
        </button>
      </span>
    </div>
  )
}

function refLabel(thread: ChatThreadRef): string {
  const anchor = thread.anchor
  if (!anchor) return thread.id
  const range = anchor.startLine === anchor.endLine ? `${anchor.startLine}` : `${anchor.startLine}-${anchor.endLine}`
  return `${anchor.path}:${range}`
}

/** Pane-level card for one line thread: header with the line reference, turns, and a one-line composer. */
export function InlineChat({ thread, state, onSend, onPermission, onMinimize, onClose }: InlineChatProps) {
  const [draft, setDraft] = useState('')
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = list.current
    if (element) element.scrollTop = element.scrollHeight
  }, [state.parts, state.permissions])

  const submit = () => {
    const text = draft.trim()
    if (!text || !state.idle) return
    onSend(text)
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
    // Escape is handled by the app-level key handler: menu → this card → overlays.
  }

  return (
    <section className="ichat" aria-label="Inline chat">
      <div className="ichat-head">
        <span className="ichat-dot" aria-hidden />
        <span className="ichat-title">Inline chat</span>
        <span className="ichat-ref">{refLabel(thread)}</span>
        <button type="button" className="ichat-btn" title="Minimize" aria-label="Minimize" onClick={onMinimize}>
          –
        </button>
        <button type="button" className="ichat-btn" title="Close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div ref={list} className="ichat-body">
        {state.parts.map((part) => (
          <InlinePart key={part.id} part={part} />
        ))}
        {state.permissions.map((ask) => (
          <InlinePermission key={ask.id} ask={ask} onPermission={onPermission} />
        ))}
        {state.error && <p className="dock-error">{state.error}</p>}
      </div>
      <div className="ichat-foot">
        <input
          className="input ichat-input"
          value={draft}
          placeholder="Ask about this line…"
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="button" className="btn btn-primary ichat-send" disabled={!state.idle || !draft.trim()} onClick={submit}>
          Send
        </button>
      </div>
    </section>
  )
}
