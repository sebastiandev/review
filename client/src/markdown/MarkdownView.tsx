import { createContext, createElement, useContext, useMemo, useRef, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import Markdown, { type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { DiffFile, DiffSelection } from '@review/shared'
import { FileHeader } from '../diff/FileHeader'
import { basename } from '../files/scope'
import { overlaps, type BlockLines } from './lineMap'
import { SelectionToolbar } from './SelectionToolbar'
import { useMarkdownSelection } from './useMarkdownSelection'

/** Below this center width the Selections aside stacks under the document. */
export const ASIDE_STACK_BELOW = 780
const ASIDE_TEXT_MAX = 90

/** A line thread anchored in this file, as the rich view needs it. */
export type MarkdownThread = {
  id: string
  startLine: number
  endLine: number
  /** The text the thread was opened on; shown in the aside. */
  text: string
  /** True while its inline chat card is showing. */
  open: boolean
}

type MarkdownViewProps = {
  file: DiffFile
  /** Full new-side file content. */
  content: string
  compact: boolean
  centerW: number
  threads: MarkdownThread[]
  /** Header controls (the Rich / Raw diff control). */
  toolbar: ReactNode
  onAsk: (selection: DiffSelection) => void
  /** PR mode only: comment on the selected range. */
  onComment?: (selection: DiffSelection) => void
  /** Reopen (or minimize, if showing) the chat card of one thread. */
  onToggleThread: (id: string) => void
}

type ThreadsContextValue = { threads: MarkdownThread[]; onToggle: (id: string) => void }
const ThreadsContext = createContext<ThreadsContextValue>({ threads: [], onToggle: () => {} })
/** True inside a block that already carries the highlight, so nested blocks do not repeat it. */
const InsideHitContext = createContext(false)

function linesOf(node: ExtraProps['node']): BlockLines | null {
  const position = node?.position
  return position ? { start: position.start.line, end: position.end.line } : null
}

function selectionIsCollapsed(): boolean {
  return document.getSelection()?.isCollapsed ?? true
}

type MarginMarkerProps = { count: number; open: boolean; onClick: (e: MouseEvent) => void }

/** 26×24 marker to the right of a block with threads: the count, or `−` while one is open. */
function MarginMarker({ count, open, onClick }: MarginMarkerProps) {
  return (
    <button
      type="button"
      className={`md-marker${open ? ' md-marker-open' : ''}`}
      title={open ? 'Minimize this chat' : 'Reopen this chat'}
      aria-pressed={open}
      onClick={onClick}
    >
      {open ? '−' : count}
    </button>
  )
}

type BlockProps = ExtraProps & HTMLAttributes<HTMLElement> & { children?: ReactNode }

type BlockOptions = {
  /** Render the marker; off for row-level blocks whose parent already carries it. */
  marker: boolean
  /** Stamp a wrapping div instead of the element itself (tables cannot hold a button). */
  wrap?: boolean
  /** Class the element itself gets (the wrapper carries the highlight classes). */
  className?: string
}

/** Component override for one block tag: stamps source lines, highlights threads, hosts the margin marker. */
function block(tag: string, { marker, wrap = false, className }: BlockOptions) {
  return function Block({ node, children, ...props }: BlockProps) {
    const lines = linesOf(node)
    const insideHit = useContext(InsideHitContext)
    const { threads, onToggle } = useContext(ThreadsContext)
    const hits = lines && !insideHit ? threads.filter((thread) => overlaps(thread, lines)) : []
    const open = hits.some((thread) => thread.open)

    const toggle = (e: MouseEvent) => {
      e.stopPropagation()
      const target = hits.find((thread) => thread.open) ?? hits[0]
      if (target) onToggle(target.id)
    }
    // A click that ends a drag-selection must not toggle the thread.
    const onBlockClick = (e: MouseEvent) => {
      if (selectionIsCollapsed()) toggle(e)
    }

    const stamp = {
      'data-line-start': lines?.start,
      'data-line-end': lines?.end,
      className: hits.length > 0 ? `md-hit${open ? ' md-hit-open' : ''}` : undefined,
      onClick: hits.length > 0 ? onBlockClick : undefined,
    }
    const markerNode = marker && hits.length > 0 ? <MarginMarker count={hits.length} open={open} onClick={toggle} /> : null
    const element = wrap
      ? createElement('div', stamp, createElement(tag, { ...props, className }, children), markerNode)
      : createElement(tag, { ...props, ...stamp }, children, markerNode)

    return hits.length > 0 ? <InsideHitContext.Provider value={true}>{element}</InsideHitContext.Provider> : element
  }
}

const components: Components = {
  p: block('p', { marker: true }),
  h1: block('h1', { marker: true }),
  h2: block('h2', { marker: true }),
  h3: block('h3', { marker: true }),
  h4: block('h4', { marker: true }),
  h5: block('h5', { marker: true }),
  h6: block('h6', { marker: true }),
  li: block('li', { marker: true }),
  pre: block('pre', { marker: true }),
  blockquote: block('blockquote', { marker: true }),
  table: block('table', { marker: true, wrap: true, className: 'table' }),
  tr: block('tr', { marker: false }),
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
}

function lineLabel(thread: MarkdownThread): string {
  return thread.startLine === thread.endLine ? `line ${thread.startLine}` : `lines ${thread.startLine}–${thread.endLine}`
}

function truncate(text: string): string {
  return text.length > ASIDE_TEXT_MAX ? `${text.slice(0, ASIDE_TEXT_MAX)}…` : text
}

/** Rendered markdown with selectable, line-anchored blocks, the selection toolbar and the Selections aside. */
export function MarkdownView({ file, content, compact, centerW, threads, toolbar, onAsk, onComment, onToggleThread }: MarkdownViewProps) {
  const doc = useRef<HTMLDivElement>(null)
  const { selection, clear } = useMarkdownSelection(doc)
  const context = useMemo(() => ({ threads, onToggle: onToggleThread }), [threads, onToggleThread])
  const stacked = centerW < ASIDE_STACK_BELOW

  const selectionRange = (): DiffSelection | null =>
    selection && { path: file.path, startLine: selection.startLine, endLine: selection.endLine, side: 'RIGHT', text: selection.text }

  const ask = () => {
    const range = selectionRange()
    if (!range) return
    onAsk(range)
    clear()
  }

  const comment = () => {
    const range = selectionRange()
    if (!range || !onComment) return
    onComment(range)
    clear()
  }

  const copyRef = () => {
    if (!selection) return
    void navigator.clipboard.writeText(`${file.path}:${selection.startLine}-${selection.endLine}\n${selection.text}`)
    clear()
  }

  return (
    <>
      <FileHeader file={file} compact={compact}>
        {toolbar}
      </FileHeader>
      <div className="md-body">
        <div className={`md-row${stacked ? ' md-row-stacked' : ''}`}>
          <div ref={doc} className="md-doc">
            <p className="md-hint">Select any text — a line, a phrase, a whole section — to comment or ask the agent about it.</p>
            <ThreadsContext.Provider value={context}>
              <Markdown remarkPlugins={[remarkGfm]} components={components}>
                {content}
              </Markdown>
            </ThreadsContext.Provider>
          </div>
          <aside className="md-aside" aria-label="Selections">
            <div className="overline md-aside-title">Selections</div>
            {threads.length === 0 && <p className="md-aside-empty">None yet.</p>}
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={`md-aside-card${thread.open ? ' md-aside-card-open' : ''}`}
                onClick={() => onToggleThread(thread.id)}
              >
                <span className="md-aside-ref">{lineLabel(thread)} · chat</span>
                <span className="md-aside-text">{truncate(thread.text)}</span>
              </button>
            ))}
          </aside>
        </div>
      </div>
      {selection && (
        <SelectionToolbar
          basename={basename(file.path)}
          rect={selection.rect}
          onComment={onComment ? comment : undefined}
          onAsk={ask}
          onCopyRef={copyRef}
        />
      )}
    </>
  )
}
