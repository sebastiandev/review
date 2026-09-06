import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Decoration,
  Diff,
  Hunk,
  parseDiff,
  tokenize,
  type ChangeData,
  type FileData,
  type HunkTokens,
  type TokenizeOptions,
} from 'react-diff-view'
import { refractor } from 'refractor'
import type { DiffDocument, DiffFile } from '@revu/shared'
import { languageForPath } from './language'

type DiffViewProps = {
  document: DiffDocument
}

/** Path the viewer identifies a parsed file by: the new path, or the old one for deletions. */
export function fileKey(file: FileData): string {
  return file.type === 'delete' ? file.oldPath : file.newPath
}

/** Row id: `<encoded path>:<side>:<line>`; stamped into data attributes after render. */
function anchorId(path: string, change: ChangeData): string {
  const side = change.type === 'delete' ? 'old' : 'new'
  const line = change.type === 'normal' ? change.newLineNumber : change.lineNumber
  return `${encodeURIComponent(path)}:${side}:${line}`
}

// react-diff-view targets refractor v2 (highlight returns an array); v5 returns a hast Root.
type Highlighter = Extract<TokenizeOptions, { highlight: true }>['refractor']
const highlighter = {
  highlight: (text: string, language: string) => refractor.highlight(text, language).children,
} as unknown as Highlighter

function useTokens(file: FileData, path: string): HunkTokens | null {
  return useMemo(() => {
    const language = languageForPath(path)
    if (!language) return null
    try {
      return tokenize(file.hunks, { highlight: true, refractor: highlighter, language })
    } catch {
      return null
    }
  }, [file, path])
}

type FileSectionProps = {
  file: FileData
  path: string
  meta: DiffFile | undefined
}

function FileSection({ file, path, meta }: FileSectionProps) {
  const [open, setOpen] = useState(true)
  const body = useRef<HTMLDivElement>(null)
  const tokens = useTokens(file, path)

  useLayoutEffect(() => {
    if (!body.current) return
    for (const tr of body.current.querySelectorAll<HTMLElement>('tr.diff-line[id]')) {
      const parts = tr.id.split(':')
      const line = parts.pop()
      const side = parts.pop()
      if (!line || !side) continue
      tr.dataset.path = path
      tr.dataset.side = side
      tr.dataset.line = line
    }
  }, [path, open, tokens])

  const status = meta?.status ?? file.type
  return (
    <section className="file" data-file-header>
      <button
        type="button"
        className="file-header"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-file-toggle
      >
        <span className="file-chevron" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        <span className="file-path">{path}</span>
        <span className="file-status">{status}</span>
        <span className="file-counts">
          <span className="file-adds">+{meta?.additions ?? 0}</span> <span className="file-dels">-{meta?.deletions ?? 0}</span>
        </span>
      </button>
      {open && (
        <div ref={body} className="file-body">
          {file.isBinary ? (
            <p className="file-binary">Binary file</p>
          ) : (
            <Diff
              viewType="unified"
              diffType={file.type}
              hunks={file.hunks}
              tokens={tokens}
              generateAnchorID={(change) => anchorId(path, change)}
            >
              {(hunks) =>
                hunks.flatMap((hunk) => [
                  <Decoration key={`h${hunk.content}`}>{hunk.content}</Decoration>,
                  <Hunk key={hunk.content} hunk={hunk} />,
                ])
              }
            </Diff>
          )}
        </div>
      )}
    </section>
  )
}

/** Renders a DiffDocument as per-file collapsible unified diffs. */
export function DiffView({ document }: DiffViewProps) {
  const files = useMemo(() => parseDiff(document.patch, { nearbySequences: 'zip' }), [document.patch])
  const metaByPath = useMemo(() => new Map(document.files.map((f) => [f.path, f])), [document.files])
  return (
    <div className="diff-files">
      {files.map((file) => {
        const path = fileKey(file)
        return <FileSection key={path} file={file} path={path} meta={metaByPath.get(path)} />
      })}
    </div>
  )
}
