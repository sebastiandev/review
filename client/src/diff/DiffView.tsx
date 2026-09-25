import { ArrowsOutLineVertical, CheckSquare, Square, ArrowUp, ArrowDown, ChatTeardropDots } from '@phosphor-icons/react'
import { Fragment, useState, useEffect, type ReactNode, type RefObject } from 'react'
import { ConversationPill } from '../pr/ConversationPill'
import { useConversations } from '../pr/CommentAttention'
import { FoldCaret } from '../pr/AttentionParts'
import type { DiffFile } from '@review/shared'
import { Segmented } from '../shell/Segmented'
import { DiffToolbarAppearance } from './DiffToolbarAppearance'
import { FileHeader } from './FileHeader'
import type { LineRef } from './LineActionButton'
import { LineMenu } from './LineMenu'
import { splitRows, type DiffHunk, type DiffLine, type ParsedFile } from './parsePatch'
import { highlightLine, languageOf } from './highlight'
import type { ContextGap } from './contextGaps'
import { useExpandedContext, type ExpandedContext } from './useExpandedContext'

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
  /** Raw markdown stays on interface mono; code diffs take the user's code face (`--font-code`). */
  codeFace?: boolean
  /** Full new-side content of a file, for expanding unchanged context; null when the source has none (patch files). */
  loadFile: (path: string) => Promise<string | null>
  onSelectLine?: (ref: LineRef, extend: boolean) => void
  fileNav?: { index: number; count: number; onStep: (direction: 1 | -1) => void }
  conversationsControl?: ReactNode
  revealKey?: number
  onBodyReady?: () => void
}

const MARKER: Record<DiffLine['kind'], string> = { add: '+ ', del: '- ', normal: '  ' }
const NO_ARTIFACTS: Record<string, ReactNode> = {}
const NO_HUNKS: DiffHunk[] = []

/** Both sides' conversations remain reachable when they share a displayed row. */
function splitArtifact(artifacts: Record<string, ReactNode>, left: DiffLine | null, right: DiffLine | null): ReactNode {
  const fromRight = right?.newLine != null ? artifacts[lineKey('new', right.newLine)] : undefined
  const fromLeft = left?.oldLine != null ? artifacts[lineKey('old', left.oldLine)] : undefined
  return fromRight && fromLeft ? <>{fromLeft}{fromRight}</> : fromRight ?? fromLeft
}

function lineNumber(line: DiffLine, side: 'old' | 'new'): number {
  return (side === 'old' ? line.oldLine : line.newLine) ?? 0
}

type LineProps = {
  oldLine?: number | null
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

function ActionSlot({ path, line, side, openMenu, threads, onToggleMenu, onComment, onAsk, onCopyRef, oldLine }: LineProps) {
  const key = lineKey(side, lineNumber(line, side))
  const thread = threads[key]
  return (
    <div className="diff-actions">
      <ConversationPill path={path} line={lineNumber(line, side)} side={side} oldLine={oldLine} />
      <button className={`line-chat-button${thread ? ' has-chat' : ''}${thread === 'open' ? ' selected' : ''}`} aria-label={`Ask agent about line ${lineNumber(line, side)}`} title="Ask the agent · right-click for review actions" onClick={() => onAsk({ path, line: lineNumber(line, side), side, text: line.text })} onContextMenu={(e) => { e.preventDefault(); onToggleMenu(key) }} onKeyDown={(e) => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); onToggleMenu(key) } }}><ChatTeardropDots size={12} /></button>
      {openMenu === key && <LineMenu lineRef={{ path, line: lineNumber(line, side), side, text: line.text }} onComment={onComment} onAsk={onAsk} onCopyRef={onCopyRef} />}
    </div>
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
  const conversations = useConversations()
  return (
    <>
      <div className="drow drow-hunk">
        <span className="gutter"><ArrowsOutLineVertical size={13} /></span>
        <span className="gutter" />
        <span className="line-action-spacer" />
        <span className="diff-code">{hunk.header}</span>
      </div>
      {hunk.lines.map((line, i) => {
        const side = line.kind === 'del' ? 'old' : 'new'
        const key = lineKey(side, lineNumber(line, side))
        const anchored = slot.threads[key] === 'open'
        const artifact = splitArtifact(slot.artifacts, line, line)
        const marked = conversations?.threads.filter((t) => { const c = t.comments[0]!; return c.path === path && c.line !== null && c.line === (c.side === 'LEFT' ? line.oldLine : line.newLine) }) ?? []
        return (
          <Fragment key={i}>
            <div
              className={`drow drow-${line.kind}${anchored ? ' drow-anchored' : ''}${marked.length ? ' conversation-marked' : ''}${marked.some((t) => t.unreadMentions.length || t.unreadReplies.length) ? ' conversation-unread' : ''}`}
              data-path={path}
              data-side={side}
              data-line={side === 'old' ? line.oldLine : line.newLine}
              data-range-start={anchored && slot.threads[lineKey(side, lineNumber(line, side) - 1)] !== 'open'}
              data-range-end={anchored && slot.threads[lineKey(side, lineNumber(line, side) + 1)] !== 'open'}
            >
              <button className="gutter" data-number={line.oldLine} data-gutter-side="old" disabled={line.oldLine == null}>{line.oldLine}</button>
              <button className="gutter" data-number={line.newLine} data-gutter-side="new" disabled={line.newLine == null}>{line.newLine}</button>
              <ActionSlot path={path} line={line} side={side} oldLine={line.kind === 'normal' ? line.oldLine : null} {...slot} />
              <span className="diff-sign">{MARKER[line.kind].trim()}</span><Code line={line} marker="" language={language} />
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
  const conversations = useConversations()
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
        const marked = conversations?.threads.filter((t) => { const c = t.comments[0]!; return c.path === path && c.line !== null && c.line === (c.side === 'LEFT' ? left?.oldLine : right?.newLine) }) ?? []
        return (
          <Fragment key={i}>
            <div className={`srow${marked.length ? ' conversation-marked' : ''}${marked.some((t) => t.unreadMentions.length || t.unreadReplies.length) ? ' conversation-unread' : ''}`}>
              <div
                className={`side side-left${left ? ` side-${left.kind}` : ' side-empty'}${left && slot.threads[lineKey('old', left.oldLine ?? 0)] === 'open' ? ' side-anchored' : ''}`}
                data-path={left ? path : undefined}
                data-side={left ? 'old' : undefined}
                data-line={left?.oldLine ?? undefined}
                data-range-start={left && slot.threads[lineKey('old', left.oldLine ?? 0)] === 'open' && slot.threads[lineKey('old', (left.oldLine ?? 0) - 1)] !== 'open'}
                data-range-end={left && slot.threads[lineKey('old', left.oldLine ?? 0)] === 'open' && slot.threads[lineKey('old', (left.oldLine ?? 0) + 1)] !== 'open'}
              >
                <button className="gutter" data-number={left?.oldLine} data-gutter-side="old" disabled={left?.oldLine == null}>{left?.oldLine}</button>
                {left && <Code line={left} marker={MARKER[left.kind]} language={language} />}
              </div>
              <div
                className={`side${right ? ` side-${right.kind}` : ' side-empty'}${right && slot.threads[lineKey('new', right.newLine ?? 0)] === 'open' ? ' side-anchored' : ''}`}
                data-path={right ? path : undefined}
                data-side={right ? 'new' : undefined}
                data-line={right?.newLine ?? undefined}
                data-range-start={right && slot.threads[lineKey('new', right.newLine ?? 0)] === 'open' && slot.threads[lineKey('new', (right.newLine ?? 0) - 1)] !== 'open'}
                data-range-end={right && slot.threads[lineKey('new', right.newLine ?? 0)] === 'open' && slot.threads[lineKey('new', (right.newLine ?? 0) + 1)] !== 'open'}
              >
                <button className="gutter" data-number={right?.newLine} data-gutter-side="new" disabled={right?.newLine == null}>{right?.newLine}</button>
                {right ? <ActionSlot path={path} line={right} side="new" oldLine={left?.oldLine} {...slot} /> : left ? <ActionSlot path={path} line={left} side="old" {...slot} /> : <span className="line-action-spacer" />}
                {right && <Code line={right} marker={MARKER[right.kind]} language={language} />}
              </div>
            </div>
            {artifact && <div className="artifacts">{artifact}</div>}
          </Fragment>
        )
      })}
    </>
  )
}

type GapProps = { gap: ContextGap; context: ExpandedContext; split: boolean }

/** The `⋯ expand N lines` control for a gap, or its expanded read-only lines. Nothing when the gap turns out empty. */
function GapRow({ gap, context, split, path }: GapProps & { path: string }) {
  const lines = context.lines[gap.id]
  if (context.isEmpty(gap)) return null
  if (!lines) {
    const count = gap.newEnd === null ? null : gap.newEnd - gap.newStart + 1
    const label = context.loading === gap.id ? 'Loading…' : count === null ? 'Expand to the end of the file' : `Expand ${count} unchanged line${count === 1 ? '' : 's'}`
    const button = (
      <button type="button" className="expand-btn" disabled={context.loading !== null} onClick={() => context.expand(gap)}>
        <ArrowsOutLineVertical size={12} />
        {label}
      </button>
    )
    return split ? (
      <div className="srow srow-expand">
        <div className="side side-left side-hunk">{button}</div>
        <div className="side side-hunk" />
      </div>
    ) : (
      <div className="drow drow-expand">{button}</div>
    )
  }
  const language = languageOf(path)
  // Expanded lines carry no data-path / data-line: no menu, no anchor, no selection range.
  return (
    <>
      {lines.map((line) =>
        split ? (
          <div key={line.newLine} className="srow srow-context">
            <div className="side side-left side-normal">
              <span className="gutter">{line.oldLine}</span>
              <Code line={line} marker="  " language={language} />
            </div>
            <div className="side side-normal">
              <span className="gutter">{line.newLine}</span>
              <span className="line-action-spacer" />
              <Code line={line} marker="  " language={language} />
            </div>
          </div>
        ) : (
          <div key={line.newLine} className="drow drow-normal drow-context">
            <span className="gutter">{line.oldLine}</span>
            <span className="gutter">{line.newLine}</span>
            <span className="line-action-spacer" />
            <Code line={line} marker="  " language={language} />
          </div>
        ),
      )}
      <div className={split ? 'srow srow-expand' : 'drow drow-expand'}>
        <button type="button" className="expand-btn" onClick={() => context.collapse(gap)}>
          Collapse
        </button>
      </div>
    </>
  )
}

function gapById(context: ExpandedContext, id: string): ContextGap | undefined {
  return context.gaps.find((g) => g.id === id)
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
  codeFace = true,
  loadFile,
  onSelectLine,
  fileNav,
  conversationsControl,
  revealKey,
  onBodyReady,
}: DiffViewProps) {
  const [folded, setFolded] = useState(false)
  useEffect(() => setFolded(false), [file.path, revealKey])
  useEffect(() => { if (!folded) onBodyReady?.() }, [folded, file.path, revealKey, onBodyReady])
  useEffect(() => {
    if (!openMenu) return
    const close = (e: PointerEvent) => { if (!(e.target instanceof Element) || !e.target.closest('.line-menu')) onToggleMenu(null) }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [openMenu, onToggleMenu])
  const context = useExpandedContext(file.path, parsed?.hunks ?? NO_HUNKS, loadFile)
  const slot = { path: file.path, openMenu, threads, artifacts, onToggleMenu, onComment, onAsk, onCopyRef, onToggleThread }
  const touch = (target: EventTarget | null) => {
    const ref = lineRefFrom(target)
    if (ref) onTouchLine(ref)
  }
  return (
    <>
      <div className="diff-toolbar">
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
        <DiffToolbarAppearance conversationsControl={conversationsControl} />
        {headerActions}
        <span className="diff-toolbar-hint">Click a line number or chat icon to ask the agent · shift-click for a range · J / K files</span>
      </div>
      <div ref={bodyRef} className={codeFace ? 'diff-body diff-body-code' : 'diff-body'} onMouseOver={(e) => touch(e.target)} onFocus={(e) => touch(e.target)} onContextMenu={(e) => {
        const ref = lineRefFrom(e.target)
        if (ref) { e.preventDefault(); onToggleMenu(lineKey(ref.side, ref.line)) }
      }} onClick={(e) => {
        const gutter = (e.target as HTMLElement).closest<HTMLElement>('[data-number]')
        if (!gutter) return
        const row = gutter.closest('.drow, .side')
        const ref: LineRef = { path: file.path, line: Number(gutter.dataset.number), side: gutter.dataset.gutterSide === 'old' ? 'old' : 'new', text: row?.querySelector('.diff-text')?.textContent ?? '' }
        if (onSelectLine) onSelectLine(ref, e.shiftKey); else onAsk(ref)
      }}>
        <div className="diff-file-card">
        <FileHeader file={file} compact={false} diffstat>
          <button className="file-fold" aria-label={folded ? 'Expand file' : 'Collapse file'} aria-expanded={!folded} onClick={() => setFolded((v) => !v)}><FoldCaret open={!folded} /></button>
          <ConversationPill path={file.path} />
          {fileNav && <span className="file-navigation"><button aria-label="Previous file" disabled={fileNav.index === 0} onClick={() => fileNav.onStep(-1)}><ArrowUp size={12} /></button><span>{fileNav.index + 1} / {fileNav.count}</span><button aria-label="Next file" disabled={fileNav.index >= fileNav.count - 1} onClick={() => fileNav.onStep(1)}><ArrowDown size={12} /></button></span>}
          <button type="button" className="btn btn-secondary viewed-toggle" aria-pressed={viewed} onClick={() => { onToggleViewed(); setFolded(!viewed) }}>{viewed ? <CheckSquare size={14} /> : <Square size={14} />}Viewed</button>
        </FileHeader>
        {!folded && (!parsed || parsed.hunks.length === 0 ? (
          <p className="notice">Binary file or no textual changes.</p>
        ) : (
          <div className={mode === 'unified' ? 'diff-unified' : 'diff-split'}>
            {context.error && <p className="notice">{context.error}</p>}
            {gapById(context, 'before') && <GapRow gap={gapById(context, 'before')!} context={context} split={mode === 'split'} path={file.path} />}
            {parsed.hunks.map((hunk, i) => (
              <Fragment key={i}>
                {mode === 'unified' ? <UnifiedHunk hunk={hunk} {...slot} /> : <SplitHunk hunk={hunk} {...slot} />}
                {gapById(context, i === parsed.hunks.length - 1 ? 'after' : `after:${i}`) && (
                  <GapRow gap={gapById(context, i === parsed.hunks.length - 1 ? 'after' : `after:${i}`)!} context={context} split={mode === 'split'} path={file.path} />
                )}
              </Fragment>
            ))}
          </div>
        ))}
        {!folded && children}
        </div>
      </div>
    </>
  )
}
