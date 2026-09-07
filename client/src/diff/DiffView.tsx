import { Check } from '@phosphor-icons/react'
import type { ReactNode, RefObject } from 'react'
import type { DiffFile } from '@revu/shared'
import { basename, dirname } from '../files/scope'
import { Segmented } from '../shell/Segmented'
import { LineActionButton, type LineRef } from './LineActionButton'
import { splitRows, type DiffHunk, type DiffLine, type ParsedFile } from './parsePatch'
import { highlightLine, languageOf } from './highlight'

export type DiffMode = 'unified' | 'split'

type DiffViewProps = {
  file: DiffFile
  /** Undefined when the patch has no hunks for this file (binary, mode change). */
  parsed: ParsedFile | undefined
  mode: DiffMode
  /** Toolbar on its own row and "Split" instead of "Side by side". */
  compact: boolean
  viewed: boolean
  /** `side:line` of the line whose action menu is open, or null. */
  openMenu: string | null
  bodyRef: RefObject<HTMLDivElement | null>
  onMode: (mode: DiffMode) => void
  onToggleViewed: () => void
  onToggleMenu: (key: string | null) => void
  onCopyRef: (ref: LineRef) => void
  /** Last line the pointer or focus touched; feeds the `y` shortcut. */
  onTouchLine: (ref: LineRef) => void
  /** Rendered inside the scrolling body (the Ask pill). */
  children?: ReactNode
}

const MARKER: Record<DiffLine['kind'], string> = { add: '+ ', del: '- ', normal: '  ' }

function lineOf(path: string, line: DiffLine): LineRef {
  return { path, line: line.newLine ?? line.oldLine ?? 0 }
}

type LineProps = {
  path: string
  line: DiffLine
  side: 'old' | 'new'
  openMenu: string | null
  onToggleMenu: DiffViewProps['onToggleMenu']
  onCopyRef: DiffViewProps['onCopyRef']
}

function ActionSlot({ path, line, side, openMenu, onToggleMenu, onCopyRef }: LineProps) {
  const key = `${side}:${side === 'old' ? line.oldLine : line.newLine}`
  return (
    <LineActionButton
      lineRef={lineOf(path, line)}
      menuOpen={openMenu === key}
      onToggleMenu={() => onToggleMenu(openMenu === key ? null : key)}
      onCopyRef={onCopyRef}
    />
  )
}

function Code({ line, marker, language }: { line: DiffLine; marker: string; language: string | null }) {
  return (
    <span className="diff-code">
      <span className="diff-marker" aria-hidden>
        {marker}
      </span>
      <span className="diff-text">{highlightLine(line.text, language)}</span>
    </span>
  )
}

type HunkProps = Omit<LineProps, 'line' | 'side'> & { hunk: DiffHunk }

function UnifiedHunk({ path, hunk, ...menu }: HunkProps) {
  const language = languageOf(path)
  return (
    <>
      <div className="drow drow-hunk">
        <span className="gutter">···</span>
        <span className="gutter" />
        <span className="line-action-spacer" />
        <span className="diff-code">{hunk.header}</span>
      </div>
      {hunk.lines.map((line, i) => {
        const side = line.kind === 'del' ? 'old' : 'new'
        return (
          <div
            key={i}
            className={`drow drow-${line.kind}`}
            data-path={path}
            data-side={side}
            data-line={side === 'old' ? line.oldLine : line.newLine}
          >
            <span className="gutter">{line.oldLine}</span>
            <span className="gutter">{line.newLine}</span>
            <ActionSlot path={path} line={line} side={side} {...menu} />
            <Code line={line} marker={MARKER[line.kind]} language={language} />
          </div>
        )
      })}
    </>
  )
}

function SplitHunk({ path, hunk, ...menu }: HunkProps) {
  const language = languageOf(path)
  return (
    <>
      <div className="srow">
        <div className="side side-left side-hunk">
          <span className="gutter">···</span>
          <span className="diff-code">{hunk.header}</span>
        </div>
        <div className="side side-hunk">
          <span className="gutter" />
        </div>
      </div>
      {splitRows(hunk.lines).map(({ left, right }, i) => (
        <div key={i} className="srow">
          <div
            className={`side side-left${left ? ` side-${left.kind}` : ''}`}
            data-path={left ? path : undefined}
            data-side={left ? 'old' : undefined}
            data-line={left?.oldLine ?? undefined}
          >
            <span className="gutter">{left?.oldLine}</span>
            {left && <Code line={left} marker="  " language={language} />}
          </div>
          <div
            className={`side${right ? ` side-${right.kind}` : ''}`}
            data-path={right ? path : undefined}
            data-side={right ? 'new' : undefined}
            data-line={right?.newLine ?? undefined}
          >
            <span className="gutter">{right?.newLine}</span>
            {right ? <ActionSlot path={path} line={right} side="new" {...menu} /> : <span className="line-action-spacer" />}
            {right && <Code line={right} marker="  " language={language} />}
          </div>
        </div>
      ))}
    </>
  )
}

function lineRefFrom(target: EventTarget | null): LineRef | null {
  if (!(target instanceof Element)) return null
  const row = target.closest<HTMLElement>('[data-path][data-line]')
  if (!row?.dataset.path) return null
  const line = Number(row.dataset.line)
  return Number.isFinite(line) ? { path: row.dataset.path, line } : null
}

/** One file's diff: header (path, counts, view toggle, viewed) over the scrolling merged or side-by-side body. */
export function DiffView({
  file,
  parsed,
  mode,
  compact,
  viewed,
  openMenu,
  bodyRef,
  onMode,
  onToggleViewed,
  onToggleMenu,
  onCopyRef,
  onTouchLine,
  children,
}: DiffViewProps) {
  const menu = { path: file.path, openMenu, onToggleMenu, onCopyRef }
  const touch = (target: EventTarget | null) => {
    const ref = lineRefFrom(target)
    if (ref) onTouchLine(ref)
  }
  return (
    <>
      <div className={`file-header${compact ? ' file-header-compact' : ''}`}>
        <span className="file-title">
          <span className="file-dir">{dirname(file.path)}</span>
          <span className="file-name">{basename(file.path)}</span>
        </span>
        <span className="count-add">+{file.additions}</span>
        <span className="count-del">−{file.deletions}</span>
        <div className="file-toolbar">
          <Segmented<DiffMode>
            label="Diff view"
            value={mode}
            options={[
              { value: 'unified', label: 'Merged' },
              { value: 'split', label: compact ? 'Split' : 'Side by side' },
            ]}
            onChange={onMode}
          />
          <button type="button" className="btn btn-secondary toolbar-btn" aria-pressed={viewed} onClick={onToggleViewed}>
            {viewed ? (
              <>
                Viewed <Check size={12} weight="bold" />
              </>
            ) : (
              'Mark viewed'
            )}
          </button>
        </div>
      </div>
      <div
        ref={bodyRef}
        className="diff-body"
        onMouseOver={(e) => touch(e.target)}
        onFocus={(e) => touch(e.target)}
      >
        {!parsed || parsed.hunks.length === 0 ? (
          <p className="notice">Binary file or no textual changes.</p>
        ) : (
          <div className={mode === 'unified' ? 'diff-unified' : 'diff-split'}>
            {parsed.hunks.map((hunk, i) =>
              mode === 'unified' ? <UnifiedHunk key={i} hunk={hunk} {...menu} /> : <SplitHunk key={i} hunk={hunk} {...menu} />,
            )}
          </div>
        )}
        {children}
      </div>
    </>
  )
}
