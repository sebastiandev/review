import type { DiffDocument } from '@revu/shared'
import { basename } from './scope'

type TopPrBarProps = {
  document: DiffDocument
  selectedPath: string | null
  onSelect: (path: string) => void
}

/** Replaces the sidebar in the `tight` layout: scope path, then one chip per file, scrolling horizontally. */
export function TopPrBar({ document, selectedPath, onSelect }: TopPrBarProps) {
  return (
    <div className="toppr">
      <span className="toppr-scope">{document.source.path}</span>
      <div className="toppr-chips">
        {document.files.map((file) => (
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
