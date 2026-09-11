import { useState } from 'react'
import { CaretDown, CaretRight } from '@phosphor-icons/react'
import { ChatMarkdown } from '../chat/ChatMarkdown'
import { relativeTime } from '../inbox/inboxRows'

type PrDescriptionProps = {
  author: string
  body: string
  headRef: string
  createdAt: string
  now: number
}

const OPEN_KEY = 'review.descriptionOpen'

/**
 * The PR's description in the dock, above the chat: a foldable panel with `author · branch · opened`
 * and the body as markdown. The fold state is remembered across PRs.
 */
export function PrDescription({ author, body, headRef, createdAt, now }: PrDescriptionProps) {
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== 'false')
  const toggle = () => {
    setOpen((v) => {
      localStorage.setItem(OPEN_KEY, String(!v))
      return !v
    })
  }
  return (
    <section className={open ? 'description description-open' : 'description'}>
      <button type="button" className="description-head" aria-expanded={open} onClick={toggle}>
        {open ? <CaretDown size={12} /> : <CaretRight size={12} />}
        <span className="description-title">Description</span>
        <span className="description-meta">
          {author} · {headRef} · opened {relativeTime(createdAt, now)}
        </span>
      </button>
      {open && (
        <div className="description-body">
          {body.trim() ? <ChatMarkdown text={body} /> : <p className="description-empty">No description.</p>}
        </div>
      )}
    </section>
  )
}
