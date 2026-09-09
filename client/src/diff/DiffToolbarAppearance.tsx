import { useEffect, useRef, useState } from 'react'
import { useAppearance } from '../theme/AppearanceContext'
import { DIFF_THEME_INFO, swatch } from '../theme/catalog'
import { DIFF_THEMES } from '../theme/useTheme'

/**
 * Diff-toolbar appearance controls: the diff-theme picker (swatch pair + label + ▾, 180px menu with ● on the
 * active set) and the Focus / Exit focus button. Renders nothing outside `AppearanceProvider`.
 */
export function DiffToolbarAppearance() {
  const appearance = useAppearance()
  const [menuOpen, setMenuOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!anchor.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setMenuOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [menuOpen])

  if (!appearance) return null
  const current = DIFF_THEME_INFO[appearance.diffTheme]
  return (
    <>
      <div ref={anchor} className="menu-anchor">
        <button
          type="button"
          className="btn btn-secondary toolbar-btn diff-theme-pick"
          title="Diff colours"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <SwatchPair add={current.add} del={current.del} size={9} />
          <span>{current.label}</span>
          <span className="diff-theme-caret">▾</span>
        </button>
        {menuOpen && (
          <div className="menu diff-theme-menu" role="menu" aria-label="Diff theme">
            {DIFF_THEMES.map((theme) => (
              <button
                key={theme}
                type="button"
                role="menuitemradio"
                aria-checked={appearance.diffTheme === theme}
                className={`menu-row diff-theme-item${appearance.diffTheme === theme ? ' diff-theme-item-on' : ''}`}
                onClick={() => {
                  appearance.onDiffTheme(theme)
                  setMenuOpen(false)
                }}
              >
                <SwatchPair add={DIFF_THEME_INFO[theme].add} del={DIFF_THEME_INFO[theme].del} size={9} />
                <span className="menu-row-label">{DIFF_THEME_INFO[theme].label}</span>
                <span className="diff-theme-mark">{appearance.diffTheme === theme ? '●' : ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn btn-secondary toolbar-btn"
        aria-pressed={appearance.focus}
        title="Hide everything but the files, the diff and chat"
        onClick={appearance.onToggleFocus}
      >
        {appearance.focus ? 'Exit focus' : 'Focus'}
      </button>
    </>
  )
}

/** Two square swatches, added then removed, at 0.85 alpha of the theme's tint bases. */
export function SwatchPair({ add, del, size }: { add: string; del: string; size: 9 | 12 }) {
  return (
    <span className={`swatch-pair swatch-pair-${size}`} aria-hidden>
      <span className="swatch" style={{ background: swatch(add) }} />
      <span className="swatch" style={{ background: swatch(del) }} />
    </span>
  )
}
