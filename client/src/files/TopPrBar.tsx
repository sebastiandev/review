import type { ReactNode } from 'react'
import type { DiffFile } from '@review/shared'
import { basename } from './scope'

type TopPrBarProps = {
  files: DiffFile[]
  selectedPath: string | null
  /** Leading content: the scope path (diff mode) or `←`, the `#n ▾` chip and the PR title (PR mode). */
  lead: ReactNode
  onSelect: (path: string) => void
}

/** Replaces the sidebar in the `tight` layout: a lead slot, then one chip per file, scrolling horizontally. */
export function TopPrBar({ files, selectedPath, lead, onSelect }: TopPrBarProps) {
  return (
    <div className="toppr">
      {lead}
      <div className="toppr-chips">
        {files.map((file) => (
          <button
            key={file.path}
            type="button"
            className={`chip${file.path === selectedPath ? ' chip-on' : ''}`}
            title={file.path}
            onClick={() => onSelect(file.path)}
          >
            {basename(file.path)}
          </button>
        ))}
      </div>
    </div>
  )
}
