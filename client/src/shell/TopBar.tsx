import { MagnifyingGlass } from '@phosphor-icons/react'
import type { DiffTheme, UiTheme } from '../theme/useTheme'
import { Segmented } from './Segmented'
import { ThemeMenu } from './ThemeMenu'

type Mode = 'pr' | 'diff'

type TopBarProps = {
  uiTheme: UiTheme
  diffTheme: DiffTheme
  themeMenuOpen: boolean
  onToggleThemeMenu: () => void
  onUiTheme: (theme: UiTheme) => void
  onDiffTheme: (theme: DiffTheme) => void
  onToggleShortcuts: () => void
  onToggleDock: () => void
}

/** 46px top bar: mark + wordmark, mode toggle, search affordance, then Theme / ? / Dock on the right. */
export function TopBar({
  uiTheme,
  diffTheme,
  themeMenuOpen,
  onToggleThemeMenu,
  onUiTheme,
  onDiffTheme,
  onToggleShortcuts,
  onToggleDock,
}: TopBarProps) {
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
        value="diff"
        options={[
          { value: 'pr', label: 'PR mode', disabled: true, title: 'coming soon' },
          { value: 'diff', label: 'Diff mode' },
        ]}
        onChange={() => {}}
      />
      <div className="search" aria-hidden>
        <MagnifyingGlass size={13} />
        <span>Search files</span>
        <span className="search-hint">⌘K</span>
      </div>
      <div className="topbar-actions">
        <div className="menu-anchor">
          <button
            type="button"
            className="btn btn-secondary topbar-btn"
            aria-haspopup="menu"
            aria-expanded={themeMenuOpen}
            onClick={onToggleThemeMenu}
          >
            Theme
          </button>
          {themeMenuOpen && (
            <ThemeMenu uiTheme={uiTheme} diffTheme={diffTheme} onUiTheme={onUiTheme} onDiffTheme={onDiffTheme} />
          )}
        </div>
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
