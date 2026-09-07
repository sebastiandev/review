import { ClockCounterClockwise, Gear, Tray } from '@phosphor-icons/react'

type RailProps = {
  prMode: boolean
  view: 'inbox' | 'files' | 'past' | 'settings'
  onInbox: () => void
}

/** 48px icon rail. Inbox is live in PR mode; Past reviews and Settings stay inert until phase 5. */
export function Rail({ prMode, view, onInbox }: RailProps) {
  const inboxOn = prMode && view !== 'past' && view !== 'settings'
  return (
    <nav className="rail" aria-label="Sections">
      <button
        type="button"
        className={`rail-btn${inboxOn ? ' rail-btn-on' : ''}`}
        disabled={!prMode}
        title={prMode ? 'Inbox' : 'PR mode'}
        aria-label="Inbox"
        aria-current={inboxOn || undefined}
        onClick={onInbox}
      >
        <Tray size={16} />
      </button>
      <button type="button" className="rail-btn" disabled title="Past reviews — phase 5" aria-label="Past reviews">
        <ClockCounterClockwise size={16} />
      </button>
      <button type="button" className="rail-btn" disabled title="Settings — phase 5" aria-label="Settings">
        <Gear size={16} />
      </button>
      <div className="rail-avatar" title="No account — phase 6" aria-hidden />
    </nav>
  )
}
