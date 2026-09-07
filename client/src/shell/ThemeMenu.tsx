import { DIFF_THEMES, UI_THEMES, type DiffTheme, type UiTheme } from '../theme/useTheme'

type ThemeMenuProps = {
  uiTheme: UiTheme
  diffTheme: DiffTheme
  onUiTheme: (theme: UiTheme) => void
  onDiffTheme: (theme: DiffTheme) => void
}

const UI_NOTES: Record<UiTheme, string> = {
  nocturne: 'blue-grey ground, blurple accent',
  ember: 'warm ink, amber accent',
  slate: 'cool, high contrast',
}

// Swatches show the tints at full alpha so the pair reads at 12px.
const DIFF_SWATCHES: Record<DiffTheme, [add: string, del: string]> = {
  nocturne: ['rgb(111, 170, 126)', 'rgb(196, 123, 123)'],
  muted: ['rgb(140, 150, 170)', 'rgb(170, 140, 150)'],
  vivid: ['rgb(86, 190, 120)', 'rgb(226, 96, 96)'],
  paper: ['rgb(200, 205, 180)', 'rgb(205, 185, 170)'],
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Appearance menu: the three UI themes and the four diff themes as swatch pairs. Lives in the top bar until Settings exists. */
export function ThemeMenu({ uiTheme, diffTheme, onUiTheme, onDiffTheme }: ThemeMenuProps) {
  return (
    <div className="menu theme-menu" role="menu">
      <div className="overline menu-heading">Theme</div>
      {UI_THEMES.map((theme) => (
        <button
          key={theme}
          type="button"
          role="menuitemradio"
          aria-checked={uiTheme === theme}
          className={`menu-row${uiTheme === theme ? ' menu-row-current' : ''}`}
          onClick={() => onUiTheme(theme)}
        >
          <span className="menu-row-label">{capitalize(theme)}</span>
          <span className="menu-row-note">{UI_NOTES[theme]}</span>
        </button>
      ))}
      <div className="overline menu-heading menu-heading-divided">Diff theme</div>
      {DIFF_THEMES.map((theme) => (
        <button
          key={theme}
          type="button"
          role="menuitemradio"
          aria-checked={diffTheme === theme}
          className={`menu-row${diffTheme === theme ? ' menu-row-current' : ''}`}
          onClick={() => onDiffTheme(theme)}
        >
          <span className="swatch-pair" aria-hidden>
            <span className="swatch" style={{ background: DIFF_SWATCHES[theme][0] }} />
            <span className="swatch" style={{ background: DIFF_SWATCHES[theme][1] }} />
          </span>
          <span className="menu-row-label">{capitalize(theme)}</span>
        </button>
      ))}
    </div>
  )
}
