import { CheckSquare, Square, ChatTeardropDots } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { DiffFile } from '@review/shared'
import { basename, dirname } from './scope'
import { ConversationPill } from '../pr/ConversationPill'

type FileTreeProps = {
  files: DiffFile[]
  selectedPath: string | null
  viewed: ReadonlySet<string>
  /** Comment-count badge per path; absent or 0 renders nothing. */
  badges?: Record<string, number>
  chatCounts?: Record<string, number>
  chatPath?: string
  width: number
  /** Scope selector (diff mode) or the PR header block. */
  header: ReactNode
  /** PR-mode footer: worktree line + Submit review. */
  footer?: ReactNode
  onSelect: (path: string) => void
  onToggleViewed: (path: string) => void
  onStartResize: (e: React.PointerEvent<HTMLElement>) => void
}

/** Workspace sidebar: a header slot, the FILES overline with the viewed count, one row per changed file, a footer slot. */
export function FileTree({
  files,
  selectedPath,
  viewed,
  badges,
  chatCounts,
  chatPath,
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
              className={`file-row${selected ? ' file-row-on' : ''}${isViewed ? ' file-viewed' : ''}${chatPath === file.path ? ' file-chat-selected' : ''}`}
              aria-current={selected || undefined}
              onClick={() => onSelect(file.path)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  onSelect(file.path)
                }
              }}
            >
              <span className="file-row-label" title={file.path}>
                <span className="file-row-directory">{dirname(file.path) || '.'}</span>
                <span className="file-row-name">{basename(file.path)}</span>
              </span>
              <ConversationPill path={file.path} count={badge} onNavigate={() => onSelect(file.path)} />
              {!!chatCounts?.[file.path] && <span className="file-chat-count"><ChatTeardropDots size={11} />{chatCounts[file.path]}</span>}
              <button
                type="button"
                className="file-viewed-toggle"
                role="checkbox"
                aria-checked={isViewed}
                aria-label={isViewed ? 'Mark unviewed' : 'Mark viewed'}
                title={isViewed ? 'Mark unviewed' : 'Mark viewed'}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleViewed(file.path)
                }}
              >
                {isViewed ? <CheckSquare size={15} /> : <Square size={15} />}
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
