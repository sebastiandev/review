import { ClockCounterClockwise, Gear, Tray } from '@phosphor-icons/react'

const ITEMS = [
  { label: 'Inbox', Icon: Tray },
  { label: 'Past reviews', Icon: ClockCounterClockwise },
  { label: 'Settings', Icon: Gear },
]

/** 48px icon rail. In diff mode its items are inert placeholders for PR mode; the avatar slot stays pinned bottom. */
export function Rail() {
  return (
    <nav className="rail" aria-label="Sections">
      {ITEMS.map(({ label, Icon }) => (
        <button key={label} type="button" className="rail-btn" disabled title="PR mode" aria-label={label}>
          <Icon size={16} />
        </button>
      ))}
      <div className="rail-avatar" title="No account · PR mode" aria-hidden />
    </nav>
  )
}
