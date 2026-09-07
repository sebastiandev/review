import { CaretDown, FolderOpen } from '@phosphor-icons/react'
import type { DiffDocument } from '@review/shared'
import { basename, scopeKind, scopeLabel } from './scope'

type ScopeSelectorProps = {
  document: DiffDocument
  menuOpen: boolean
  onToggleMenu: () => void
}

/** Diff-mode sidebar header: the scope selector with its one-scope menu, then the scope name and change count. */
export function ScopeSelector({ document, menuOpen, onToggleMenu }: ScopeSelectorProps) {
  const { source, files } = document
  const label = scopeLabel(source)
  const meta = [source.kind === 'repo' && source.base ? `vs ${source.base}` : null, `${files.length} changed files`]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="sidebar-head menu-anchor">
      <button type="button" className="selector" aria-haspopup="menu" aria-expanded={menuOpen} onClick={onToggleMenu}>
        <FolderOpen size={14} className="selector-glyph" />
        <span className="selector-path">{label}</span>
        <CaretDown size={12} className="selector-glyph" />
      </button>
      {menuOpen && (
        <div className="menu sidebar-menu" role="menu">
          <button type="button" role="menuitem" className="menu-row menu-row-current" onClick={onToggleMenu}>
            <span className="menu-row-label mono">{label}</span>
            <span className="menu-row-note">{scopeKind(source)}</span>
          </button>
          <button type="button" role="menuitem" className="menu-footer-row" disabled title="coming soon">
            Open folder or .diff…
          </button>
        </div>
      )}
      <div className="sidebar-title">{basename(label)}</div>
      <div className="sidebar-meta">{meta}</div>
    </div>
  )
}
