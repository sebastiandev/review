import { CaretDown, Check, FolderOpen } from '@phosphor-icons/react'
import type { DiffDocument, DiffFile } from '@review/shared'
import { basename, scopeKind } from './scope'

type FileTreeProps = {
  document: DiffDocument
  selectedPath: string | null
  viewed: ReadonlySet<string>
  scopeMenuOpen: boolean
  width: number
  onSelect: (path: string) => void
  onToggleViewed: (path: string) => void
  onToggleScopeMenu: () => void
  onStartResize: (e: React.PointerEvent<HTMLElement>) => void
}

const STATUS_CLASS: Record<DiffFile['status'], string> = {
  added: 'dot-added',
  renamed: 'dot-renamed',
  deleted: 'dot-deleted',
  modified: 'dot-modified',
}

/** Diff-mode sidebar: scope selector, FILES overline with the viewed count, and one row per changed file. */
export function FileTree({
  document,
  selectedPath,
  viewed,
  scopeMenuOpen,
  width,
  onSelect,
  onToggleViewed,
  onToggleScopeMenu,
  onStartResize,
}: FileTreeProps) {
  const { source, files } = document
  const kind = scopeKind(source)
  const viewedCount = files.filter((f) => viewed.has(f.path)).length
  const meta = [source.kind === 'repo' && source.base ? `vs ${source.base}` : null, `${files.length} changed files`]
    .filter(Boolean)
    .join(' · ')

  return (
    <aside className="sidebar" style={{ width }}>
      <div className="sidebar-head menu-anchor">
        <button
          type="button"
          className="selector"
          aria-haspopup="menu"
          aria-expanded={scopeMenuOpen}
          onClick={onToggleScopeMenu}
        >
          <FolderOpen size={14} className="selector-glyph" />
          <span className="selector-path">{source.path}</span>
          <CaretDown size={12} className="selector-glyph" />
        </button>
        {scopeMenuOpen && (
          <div className="menu sidebar-menu" role="menu">
            <button type="button" role="menuitem" className="menu-row menu-row-current" onClick={onToggleScopeMenu}>
              <span className="menu-row-label mono">{source.path}</span>
              <span className="menu-row-note">{kind}</span>
            </button>
            <button type="button" role="menuitem" className="menu-footer-row" disabled title="coming soon">
              Open folder or .diff…
            </button>
          </div>
        )}
        <div className="sidebar-title">{basename(source.path)}</div>
        <div className="sidebar-meta">{meta}</div>
      </div>
      <div className="overline-row">
        <span>Files</span>
        <span className="overline-count">
          {viewedCount}/{files.length} viewed
        </span>
      </div>
      <div className="file-list">
        {files.map((file) => {
          const selected = file.path === selectedPath
          const isViewed = viewed.has(file.path)
          return (
            <div
              key={file.path}
              role="button"
              tabIndex={0}
              className={`file-row${selected ? ' file-row-on' : ''}`}
              aria-current={selected || undefined}
              onClick={() => onSelect(file.path)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(file.path)
                }
              }}
            >
              <span className={`dot ${STATUS_CLASS[file.status]}`} title={file.status} />
              <span className="file-row-name" title={file.path}>
                {basename(file.path)}
              </span>
              <button
                type="button"
                className={`viewed-box${isViewed ? ' viewed-box-on' : ''}`}
                aria-pressed={isViewed}
                title="Mark viewed"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleViewed(file.path)
                }}
              >
                {isViewed && <Check size={10} weight="bold" />}
              </button>
            </div>
          )
        })}
      </div>
      <div
        className="sidebar-resize"
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        onPointerDown={onStartResize}
      />
    </aside>
  )
}
