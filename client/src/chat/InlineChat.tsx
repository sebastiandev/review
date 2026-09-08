import { CaretDown, CaretRight } from '@phosphor-icons/react'
import type { ChatThreadRef } from '@review/shared'
import { ChatPanel, type ChatPanelProps } from './ChatDock'

type InlineChatProps = Omit<ChatPanelProps, 'placeholder' | 'autoFocus' | 'messagesClassName' | 'provenance'> & {
  thread: ChatThreadRef
  /** Collapsed shows only the header line; the conversation keeps running underneath. */
  folded: boolean
  onToggleFold: () => void
  onClose: () => void
}

/** `path:12-14` for a ranged anchor, `path:12` for one line. */
export function refLabel(thread: ChatThreadRef): string {
  const anchor = thread.anchor
  if (!anchor) return thread.id
  const range = anchor.startLine === anchor.endLine ? `${anchor.startLine}` : `${anchor.startLine}-${anchor.endLine}`
  return `${anchor.path}:${range}`
}

/**
 * The dock's chat, inlined under the line it is about: same turns, same agent · model · variant
 * pickers, same composer. Folds to a one-line header.
 */
export function InlineChat({ thread, folded, onToggleFold, onClose, ...panel }: InlineChatProps) {
  const turns = panel.parts.filter((p) => p.type === 'text').length
  return (
    <section className={`ichat${folded ? ' ichat-folded' : ''}`} aria-label="Inline chat">
      <div className="ichat-head">
        <button type="button" className="ichat-fold" aria-expanded={!folded} title={folded ? 'Unfold' : 'Fold'} onClick={onToggleFold}>
          {folded ? <CaretRight size={12} /> : <CaretDown size={12} />}
        </button>
        <span className="ichat-dot" aria-hidden />
        <span className="ichat-title">Chat</span>
        <span className="ichat-ref">{refLabel(thread)}</span>
        {folded && (
          <span className="ichat-summary">
            {turns} turn{turns === 1 ? '' : 's'}
            {!panel.idle && ' · agent working…'}
          </span>
        )}
        <button type="button" className="ichat-btn" title="Close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {!folded && <ChatPanel {...panel} placeholder="Ask about this line…" autoFocus messagesClassName="dock-messages ichat-messages" />}
    </section>
  )
}
