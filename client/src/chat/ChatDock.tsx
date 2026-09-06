import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { ChatPart, DiffSelection, PermissionAsk, PermissionReply } from '@revu/shared'
import { quoteSelection, splitQuotes, type Quote } from './quotes'

export const DOCK_MIN_WIDTH = 320
const DOCK_STORAGE_KEY = 'revu.dockWidth'

/** Selections the user asked about; a new `id` appends them to the composer. */
export type QuoteRequest = { id: number; selections: DiffSelection[] }

type ChatDockProps = {
  open: boolean
  parts: ChatPart[]
  idle: boolean
  permissions: PermissionAsk[]
  error: string | null
  quoteRequest: QuoteRequest | null
  onSend: (text: string, selections: DiffSelection[]) => void
  onPermission: (id: string, response: PermissionReply) => void
  onJumpTo: (path: string, start: number, end: number) => void
}

function storedDockWidth(): number {
  const stored = Number(localStorage.getItem(DOCK_STORAGE_KEY))
  return stored >= DOCK_MIN_WIDTH ? stored : 400
}

/** Dock width in px, persisted; `startResize` begins a pointer drag on the left edge. */
export function useDockWidth() {
  const [width, setWidth] = useState(storedDockWidth)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    localStorage.setItem(DOCK_STORAGE_KEY, String(width))
  }, [width])

  const startResize = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
    const onMove = (move: globalThis.PointerEvent) => {
      const max = window.innerWidth - 400
      setWidth(Math.min(max, Math.max(DOCK_MIN_WIDTH, window.innerWidth - move.clientX)))
    }
    const onUp = () => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [])

  return { width, dragging, startResize }
}

type QuoteBlockProps = { quote: Quote; onJumpTo: ChatDockProps['onJumpTo'] }

function QuoteBlock({ quote, onJumpTo }: QuoteBlockProps) {
  const range = quote.startLine === quote.endLine ? `${quote.startLine}` : `${quote.startLine}-${quote.endLine}`
  return (
    <div className="quote">
      <button type="button" className="quote-header" onClick={() => onJumpTo(quote.path, quote.startLine, quote.endLine)}>
        {quote.path}:{range}
      </button>
      <pre className="quote-code">{quote.text}</pre>
    </div>
  )
}

type PartViewProps = { part: ChatPart; onJumpTo: ChatDockProps['onJumpTo'] }

function PartView({ part, onJumpTo }: PartViewProps) {
  const [expanded, setExpanded] = useState(false)
  switch (part.type) {
    case 'text':
      if (part.role === 'user') {
        return (
          <div className="turn turn-user">
            {splitQuotes(part.text).map((segment, i) =>
              segment.kind === 'quote' ? (
                <QuoteBlock key={i} quote={segment.quote} onJumpTo={onJumpTo} />
              ) : (
                <p key={i} className="turn-text">
                  {segment.text.trim()}
                </p>
              ),
            )}
          </div>
        )
      }
      return (
        <div className="turn turn-assistant">
          <p className="turn-text">{part.text}</p>
        </div>
      )
    case 'tool':
      return (
        <div className={`part-tool part-tool-${part.status}`}>
          <button type="button" className="part-toggle" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            <span className="part-chevron" aria-hidden>
              {expanded ? '▾' : '▸'}
            </span>
            <span className="part-tool-name">{part.tool}</span> {part.title}
          </button>
          {expanded && part.output && <pre className="part-output">{part.output}</pre>}
        </div>
      )
    case 'reasoning':
      return (
        <div className="part-reasoning">
          <button type="button" className="part-toggle" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            <span className="part-chevron" aria-hidden>
              {expanded ? '▾' : '▸'}
            </span>
            reasoning
          </button>
          {expanded && <p className="part-reasoning-text">{part.text}</p>}
        </div>
      )
  }
}

type PermissionRowProps = { ask: PermissionAsk; onPermission: ChatDockProps['onPermission'] }

function PermissionRow({ ask, onPermission }: PermissionRowProps) {
  return (
    <div className="permission">
      <span className="permission-title">{ask.title}</span>
      <span className="permission-actions">
        <button type="button" onClick={() => onPermission(ask.id, 'once')}>
          Allow once
        </button>
        <button type="button" onClick={() => onPermission(ask.id, 'always')}>
          Always
        </button>
        <button type="button" onClick={() => onPermission(ask.id, 'reject')}>
          Reject
        </button>
      </span>
    </div>
  )
}

type ComposerProps = {
  idle: boolean
  quoteRequest: QuoteRequest | null
  onSend: ChatDockProps['onSend']
}

function Composer({ idle, quoteRequest, onSend }: ComposerProps) {
  const [draft, setDraft] = useState('')
  const [attached, setAttached] = useState<DiffSelection[]>([])
  const textarea = useRef<HTMLTextAreaElement>(null)
  const consumed = useRef<number | null>(null)

  useEffect(() => {
    if (!quoteRequest || consumed.current === quoteRequest.id) return
    consumed.current = quoteRequest.id
    const quoted = quoteRequest.selections.map(quoteSelection).join('')
    const next = draft.length && !draft.endsWith('\n') ? `${draft}\n${quoted}` : `${draft}${quoted}`
    setDraft(next)
    setAttached((current) => [...current, ...quoteRequest.selections])
    const element = textarea.current
    if (element) {
      element.focus()
      requestAnimationFrame(() => element.setSelectionRange(next.length, next.length))
    }
  }, [quoteRequest, draft])

  const submit = () => {
    const text = draft.trim()
    if (!text || !idle) return
    onSend(text, attached)
    setDraft('')
    setAttached([])
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDraft('')
      setAttached([])
    }
  }

  return (
    <div className="composer">
      <textarea
        ref={textarea}
        className="composer-input"
        value={draft}
        placeholder="Ask about the diff…  ⌘↵ to send"
        rows={4}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="composer-actions">
        <button type="button" className="button-primary" disabled={!idle || !draft.trim()} onClick={submit}>
          Send
        </button>
      </div>
    </div>
  )
}

/** Right-hand chat dock: message list, pending permission asks and the composer. */
export function ChatDock({ open, parts, idle, permissions, error, quoteRequest, onSend, onPermission, onJumpTo }: ChatDockProps) {
  const { width, dragging, startResize } = useDockWidth()
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = list.current
    if (element) element.scrollTop = element.scrollHeight
  }, [parts, permissions])

  return (
    <aside className={`dock${dragging ? ' dock-dragging' : ''}`} style={{ width: open ? width : 0 }} inert={!open}>
      <div className="dock-resize" role="separator" aria-orientation="vertical" onPointerDown={startResize} />
      <div className="dock-inner" style={{ width }}>
        <div ref={list} className="dock-messages">
          {parts.map((part) => (
            <PartView key={part.id} part={part} onJumpTo={onJumpTo} />
          ))}
          {permissions.map((ask) => (
            <PermissionRow key={ask.id} ask={ask} onPermission={onPermission} />
          ))}
          {error && <p className="dock-error">{error}</p>}
        </div>
        <Composer idle={idle} quoteRequest={quoteRequest} onSend={onSend} />
      </div>
    </aside>
  )
}
