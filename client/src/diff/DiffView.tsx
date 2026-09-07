import { Check } from '@phosphor-icons/react'
import { Fragment, type ReactNode, type RefObject } from 'react'
import type { DiffFile } from '@review/shared'
import { Segmented } from '../shell/Segmented'
import { FileHeader } from './FileHeader'
import { ChatMarker, LineActionButton, type LineRef } from './LineActionButton'
import { splitRows, type DiffHunk, type DiffLine, type ParsedFile } from './parsePatch'
import { highlightLine, languageOf } from './highlight'

export type DiffMode = 'unified' | 'split'

/** Whether a line's chat card is showing or minimized to its gutter marker. */
export type LineThreadState = 'open' | 'minimized'

/** Key of one rendered line inside a file: `side:line`. Shared by `openMenu` and `threads`. */
export function lineKey(side: 'old' | 'new', line: number): string {
  return `${side}:${line}`
}

type DiffViewProps = {
  file: DiffFile
  /** Undefined when the patch has no hunks for this file (binary, mode change). */
  parsed: ParsedFile | undefined
  mode: DiffMode
  /** Toolbar on its own row and "Split" instead of "Side by side". */
  compact: boolean
  viewed: boolean
  /** `lineKey` of the line whose action menu is open, or null. */
  openMenu: string | null
  /** Lines of this file that have a chat thread, by `lineKey`. */
  threads: Record<string, LineThreadState>
  bodyRef: RefObject<HTMLDivElement | null>
  onMode: (mode: DiffMode) => void
  onToggleViewed: () => void
  onToggleMenu: (key: string | null) => void
  /** PR mode only: enables "Add review comment" in the line menu. */
  onComment?: (ref: LineRef) => void
  onAsk: (ref: LineRef) => void
  onCopyRef: (ref: LineRef) => void
  /** Reopen (or minimize, if showing) the chat card of the thread on `lineKey`. */
  onToggleThread: (key: string) => void
  /** Last line the pointer or focus touched; feeds the `y` shortcut. */
  onTouchLine: (ref: LineRef) => void
  /** Line-anchored artifacts (comments, composer) rendered under the row, by `lineKey`. */
  artifacts?: Record<string, ReactNode>
  /** Extra header controls placed before the view toggle (the markdown Rich / Raw diff control). */
  toolbar?: ReactNode
  /** Header controls placed after the view toggle (the `Agent review` button). */
  headerActions?: ReactNode
  /** Rendered inside the scrolling body (the Ask pill). */
  children?: ReactNode
}

const MARKER: Record<DiffLine['kind'], string> = { add: '+ ', del: '- ', normal: '  ' }
const NO_ARTIFACTS: Record<string, ReactNode> = {}

/** The artifact under a side-by-side row: the right (new) line's, else the left (old) line's. */
function splitArtifact(artifacts: Record<string, ReactNode>, left: DiffLine | null, right: DiffLine | null): ReactNode {
  const fromRight = right?.newLine != null ? artifacts[lineKey('new', right.newLine)] : undefined
  const fromLeft = left?.oldLine != null ? artifacts[lineKey('old', left.oldLine)] : undefined
  return fromRight ?? fromLeft
}

function lineNumber(line: DiffLine, side: 'old' | 'new'): number {
  return (side === 'old' ? line.oldLine : line.newLine) ?? 0
}

type LineProps = {
  path: string
  line: DiffLine
  side: 'old' | 'new'
  openMenu: string | null
  threads: DiffViewProps['threads']
  artifacts: Record<string, ReactNode>
  onToggleMenu: DiffViewProps['onToggleMenu']
  onComment: DiffViewProps['onComment']
  onAsk: DiffViewProps['onAsk']
  onCopyRef: DiffViewProps['onCopyRef']
  onToggleThread: DiffViewProps['onToggleThread']
}

function ActionSlot({ path, line, side, openMenu, threads, onToggleMenu, onComment, onAsk, onCopyRef, onToggleThread }: LineProps) {
  const key = lineKey(side, lineNumber(line, side))
  const thread = threads[key]
  return (
    <>
      <LineActionButton
        lineRef={{ path, line: lineNumber(line, side), side, text: line.text }}
        menuOpen={openMenu === key}
        onToggleMenu={() => onToggleMenu(openMenu === key ? null : key)}
        onCloseMenu={() => onToggleMenu(null)}
        onComment={onComment}
        onAsk={onAsk}
        onCopyRef={onCopyRef}
      />
      {thread && <ChatMarker open={thread === 'open'} onClick={() => onToggleThread(key)} />}
    </>
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

function UnifiedHunk({ path, hunk, ...slot }: HunkProps) {
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
        const key = lineKey(side, lineNumber(line, side))
        const anchored = slot.threads[key] === 'open'
        const artifact = slot.artifacts[key]
        return (
          <Fragment key={i}>
            <div
              className={`drow drow-${line.kind}${anchored ? ' drow-anchored' : ''}`}
              data-path={path}
              data-side={side}
              data-line={side === 'old' ? line.oldLine : line.newLine}
            >
              <span className="gutter">{line.oldLine}</span>
              <span className="gutter">{line.newLine}</span>
              <ActionSlot path={path} line={line} side={side} {...slot} />
              <Code line={line} marker={MARKER[line.kind]} language={language} />
            </div>
            {artifact && <div className="artifacts">{artifact}</div>}
          </Fragment>
        )
      })}
    </>
  )
}

function SplitHunk({ path, hunk, ...slot }: HunkProps) {
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
      {splitRows(hunk.lines).map(({ left, right }, i) => {
        const artifact = splitArtifact(slot.artifacts, left, right)
        return (
          <Fragment key={i}>
            <div className="srow">
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
                className={`side${right ? ` side-${right.kind}` : ''}${right && slot.threads[lineKey('new', right.newLine ?? 0)] === 'open' ? ' side-anchored' : ''}`}
                data-path={right ? path : undefined}
                data-side={right ? 'new' : undefined}
                data-line={right?.newLine ?? undefined}
              >
                <span className="gutter">{right?.newLine}</span>
                {right ? <ActionSlot path={path} line={right} side="new" {...slot} /> : <span className="line-action-spacer" />}
                {right && <Code line={right} marker="  " language={language} />}
              </div>
            </div>
            {artifact && <div className="artifacts">{artifact}</div>}
          </Fragment>
        )
      })}
    </>
  )
}

function lineRefFrom(target: EventTarget | null): LineRef | null {
  if (!(target instanceof Element)) return null
  const row = target.closest<HTMLElement>('[data-path][data-line]')
  if (!row?.dataset.path) return null
  const line = Number(row.dataset.line)
  const side = row.dataset.side
  if (!Number.isFinite(line) || (side !== 'old' && side !== 'new')) return null
  return { path: row.dataset.path, line, side, text: row.querySelector('.diff-text')?.textContent ?? '' }
}

/** One file's diff: header (path, counts, view toggle, viewed) over the scrolling merged or side-by-side body. */
export function DiffView({
  file,
  parsed,
  mode,
  compact,
  viewed,
  openMenu,
  threads,
  bodyRef,
  onMode,
  onToggleViewed,
  onToggleMenu,
  onComment,
  onAsk,
  onCopyRef,
  onToggleThread,
  onTouchLine,
  artifacts = NO_ARTIFACTS,
  toolbar,
  headerActions,
  children,
}: DiffViewProps) {
  const slot = { path: file.path, openMenu, threads, artifacts, onToggleMenu, onComment, onAsk, onCopyRef, onToggleThread }
  const touch = (target: EventTarget | null) => {
    const ref = lineRefFrom(target)
    if (ref) onTouchLine(ref)
  }
  return (
    <>
      <FileHeader file={file} compact={compact}>
        {toolbar}
        <Segmented<DiffMode>
          label="Diff view"
          value={mode}
          options={[
            { value: 'unified', label: 'Merged' },
            { value: 'split', label: compact ? 'Split' : 'Side by side' },
          ]}
          onChange={onMode}
        />
        {headerActions}
        <button type="button" className="btn btn-secondary toolbar-btn" aria-pressed={viewed} onClick={onToggleViewed}>
          {viewed ? (
            <>
              Viewed <Check size={12} weight="bold" />
            </>
          ) : (
            'Mark viewed'
          )}
        </button>
      </FileHeader>
      <div ref={bodyRef} className="diff-body" onMouseOver={(e) => touch(e.target)} onFocus={(e) => touch(e.target)}>
        {!parsed || parsed.hunks.length === 0 ? (
          <p className="notice">Binary file or no textual changes.</p>
        ) : (
          <div className={mode === 'unified' ? 'diff-unified' : 'diff-split'}>
            {parsed.hunks.map((hunk, i) =>
              mode === 'unified' ? <UnifiedHunk key={i} hunk={hunk} {...slot} /> : <SplitHunk key={i} hunk={hunk} {...slot} />,
            )}
          </div>
        )}
        {children}
      </div>
    </>
  )
}
