import type { ReactNode } from 'react'
import type { DiffFile } from '@review/shared'
import { basename, dirname } from '../files/scope'

type FileHeaderProps = {
  file: DiffFile
  /** Toolbar on its own full-width row. */
  compact: boolean
  /** Toolbar contents, pushed right. */
  children?: ReactNode
}

/** Center-pane file header: directory, basename, +/− counts and the toolbar slot. */
export function FileHeader({ file, compact, children }: FileHeaderProps) {
  return (
    <div className={`file-header${compact ? ' file-header-compact' : ''}`}>
      <span className="file-title">
        <span className="file-dir">{dirname(file.path)}</span>
        <span className="file-name">{basename(file.path)}</span>
      </span>
      <span className="count-add">+{file.additions}</span>
      <span className="count-del">−{file.deletions}</span>
      <div className="file-toolbar">{children}</div>
    </div>
  )
}
