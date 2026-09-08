import { ClockCounterClockwise, Gear, Tray } from '@phosphor-icons/react'

export type RailView = 'inbox' | 'files' | 'past' | 'settings'

type RailProps = {
  prMode: boolean
  view: RailView
  onInbox: () => void
  onPast: () => void
  onSettings: () => void
}

/** 48px icon rail. Inbox is PR-mode only; Past reviews and Settings work in both modes. */
export function Rail({ prMode, view, onInbox, onPast, onSettings }: RailProps) {
  const inboxOn = prMode && (view === 'inbox' || view === 'files')
  const item = (on: boolean, label: string, onClick: () => void, icon: React.ReactNode, disabled = false) => (
    <button
      type="button"
      className={`rail-btn${on ? ' rail-btn-on' : ''}`}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-current={on || undefined}
      onClick={onClick}
    >
      {icon}
    </button>
  )
  return (
    <nav className="rail" aria-label="Sections">
      {item(inboxOn, prMode ? 'Inbox' : 'Inbox — PR mode only', onInbox, <Tray size={16} />, !prMode)}
      {item(view === 'past', 'Past reviews', onPast, <ClockCounterClockwise size={16} />)}
      {item(view === 'settings', 'Settings', onSettings, <Gear size={16} />)}
      <div className="rail-avatar" title="No account — phase 6" aria-hidden />
    </nav>
  )
}
