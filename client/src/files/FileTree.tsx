import { Check } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { DiffFile } from '@review/shared'
import { basename } from './scope'

type FileTreeProps = {
  files: DiffFile[]
  selectedPath: string | null
  viewed: ReadonlySet<string>
  /** Comment-count badge per path; absent or 0 renders nothing. */
  badges?: Record<string, number>
  width: number
  /** Scope selector (diff mode) or the PR header block. */
  header: ReactNode
  /** PR-mode footer: worktree line + Submit review. */
  footer?: ReactNode
  onSelect: (path: string) => void
  onToggleViewed: (path: string) => void
  onStartResize: (e: React.PointerEvent<HTMLElement>) => void
}

const STATUS_CLASS: Record<DiffFile['status'], string> = {
  added: 'dot-added',
  renamed: 'dot-renamed',
  deleted: 'dot-deleted',
  modified: 'dot-modified',
}

/** Workspace sidebar: a header slot, the FILES overline with the viewed count, one row per changed file, a footer slot. */
export function FileTree({
  files,
  selectedPath,
  viewed,
  badges,
  width,
  header,
  footer,
  onSelect,
  onToggleViewed,
  onStartResize,
}: FileTreeProps) {
  const viewedCount = files.filter((f) => viewed.has(f.path)).length

  return (
    <aside className="sidebar" style={{ width }}>
      {header}
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
          const badge = badges?.[file.path] ?? 0
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
              {badge > 0 && (
                <span className="file-badge" title={`${badge} comments`}>
                  {badge}
                </span>
              )}
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
      {footer}
      <div className="sidebar-resize" role="separator" aria-orientation="vertical" title="Drag to resize" onPointerDown={onStartResize} />
    </aside>
  )
}
