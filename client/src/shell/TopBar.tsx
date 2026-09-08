import { MagnifyingGlass } from '@phosphor-icons/react'
import { Segmented } from './Segmented'
import type { Mode } from './useMode'

type TopBarProps = {
  mode: Mode
  /** The server was started with `review diff`: PR mode cannot be selected. */
  modeLocked: boolean
  onMode: (mode: Mode) => void
  /** What ⌘K would search on this screen; null disables the box. */
  searchHint: string | null
  onSearch: () => void
  onToggleShortcuts: () => void
  onToggleDock: () => void
}

/** 46px top bar: mark + wordmark, mode toggle, search affordance, then ? / Dock on the right. Themes live in Settings → Appearance. */
export function TopBar({ mode, modeLocked, onMode, searchHint, onSearch, onToggleShortcuts, onToggleDock }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          &lt;/&gt;
        </span>
        <span className="brand-name">Review</span>
      </div>
      <Segmented<Mode>
        label="Mode"
        value={mode}
        options={[
          { value: 'pr', label: 'PR mode', disabled: modeLocked, title: modeLocked ? 'started with `review diff`' : undefined },
          { value: 'diff', label: 'Diff mode' },
        ]}
        onChange={onMode}
      />
      <button type="button" className="search" disabled={!searchHint} title={searchHint ?? 'Nothing to search here'} onClick={onSearch}>
        <MagnifyingGlass size={13} />
        <span className="search-label">{searchHint ?? 'Search'}</span>
        <span className="search-hint">⌘K</span>
      </button>
      <div className="topbar-actions">
        <button type="button" className="btn btn-secondary topbar-btn" title="Keyboard shortcuts" onClick={onToggleShortcuts}>
          ?
        </button>
        <button type="button" className="btn btn-secondary topbar-btn" onClick={onToggleDock}>
          Dock
        </button>
      </div>
    </header>
  )
}
