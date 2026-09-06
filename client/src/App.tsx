import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { DiffSelection, DiffSourceRef } from '@revu/shared'
import { fetchDiff } from './api'
import { ChatDock, type QuoteRequest } from './chat/ChatDock'
import { useChat } from './chat/useChat'
import { AskPill } from './diff/AskPill'
import { DiffView } from './diff/DiffView'
import { useDiffSelection } from './diff/useDiffSelection'
import { useTheme, type Theme } from './theme/useTheme'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
]

const FLASH_MS = 200

function sourceLabel(source: DiffSourceRef): string {
  if (source.kind === 'patch') return source.path
  return source.base ? `${source.path} · ${source.base}` : source.path
}

function isEditing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')
}

/** Scrolls the diff to `path:start` and flashes rows start..end with selection-bg. */
function jumpTo(pane: HTMLElement, path: string, start: number, end: number) {
  const escaped = CSS.escape(path)
  const first = pane.querySelector<HTMLElement>(`tr[data-path="${escaped}"][data-line="${start}"]`)
  if (!first) return
  first.scrollIntoView({ block: 'center' })
  const rows = [...pane.querySelectorAll<HTMLElement>(`tr[data-path="${escaped}"]`)].filter((tr) => {
    const line = Number(tr.dataset.line)
    return line >= start && line <= end
  })
  for (const tr of rows) tr.classList.add('flash')
  window.setTimeout(() => rows.forEach((tr) => tr.classList.remove('flash')), FLASH_MS)
}

/** Moves focus to the next/previous file header relative to the one nearest the top of the pane. */
function stepFileHeader(pane: HTMLElement, direction: 1 | -1) {
  const headers = [...pane.querySelectorAll<HTMLElement>('[data-file-toggle]')]
  if (headers.length === 0) return
  const paneTop = pane.getBoundingClientRect().top
  const focused = headers.indexOf(document.activeElement as HTMLElement)
  let index: number
  if (focused >= 0) {
    index = focused + direction
  } else {
    const firstBelow = headers.findIndex((h) => h.getBoundingClientRect().top > paneTop + 1)
    const below = firstBelow < 0 ? headers.length : firstBelow
    index = direction === 1 ? Math.min(below, headers.length - 1) : Math.max(0, below - 1)
  }
  const target = headers[Math.max(0, Math.min(headers.length - 1, index))]
  if (!target) return
  target.scrollIntoView({ block: 'start' })
  target.focus()
}

/** Application shell: title strip, diff pane with the Ask pill, and the chat dock. */
export function App() {
  const [theme, setTheme] = useTheme()
  const [dockOpen, setDockOpen] = useState(true)
  const [quoteRequest, setQuoteRequest] = useState<QuoteRequest | null>(null)
  const pane = useRef<HTMLDivElement>(null)
  const diff = useQuery({ queryKey: ['diff'], queryFn: fetchDiff })
  const chat = useChat()
  const { selections, rect: selectionRect, clear: clearSelection } = useDiffSelection(pane)

  const onAsk = useCallback(
    (selections: DiffSelection[]) => {
      setDockOpen(true)
      setQuoteRequest({ id: Date.now(), selections })
      clearSelection()
    },
    [clearSelection],
  )

  const onJumpTo = useCallback((path: string, start: number, end: number) => {
    if (pane.current) jumpTo(pane.current, path, start, end)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection()
        return
      }
      if (isEditing(e.target) || e.metaKey || e.ctrlKey || e.altKey || !pane.current) return
      if (e.key === 'j') stepFileHeader(pane.current, 1)
      if (e.key === 'k') stepFileHeader(pane.current, -1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearSelection])

  const pillPosition = (() => {
    if (!selectionRect || !pane.current) return null
    const paneRect = pane.current.getBoundingClientRect()
    return {
      left: selectionRect.right - paneRect.left + pane.current.scrollLeft + 8,
      top: selectionRect.bottom - paneRect.top + pane.current.scrollTop + 4,
    }
  })()

  return (
    <div className="app">
      <header className="strip">
        <span className="strip-source">{diff.data ? sourceLabel(diff.data.source) : '…'}</span>
        <span className="strip-mode">diff</span>
        <span className="strip-spacer" />
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {THEMES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={theme === option.value}
              className={theme === option.value ? 'segment segment-on' : 'segment'}
              onClick={() => setTheme(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="strip-toggle"
          aria-label={dockOpen ? 'Hide chat' : 'Show chat'}
          aria-expanded={dockOpen}
          onClick={() => setDockOpen((o) => !o)}
        >
          {dockOpen ? '›' : '‹'}
        </button>
      </header>
      <div className="body">
        <main ref={pane} className="diff-pane">
          {diff.isPending && <p className="notice">Loading diff…</p>}
          {diff.isError && <p className="notice">Could not load the diff: {String(diff.error)}</p>}
          {diff.data && <DiffView document={diff.data} />}
          {pillPosition && selections.length > 0 && (
            <AskPill selections={selections} left={pillPosition.left} top={pillPosition.top} onAsk={onAsk} />
          )}
        </main>
        <ChatDock
          open={dockOpen}
          parts={chat.parts}
          idle={chat.idle}
          permissions={chat.permissions}
          error={chat.error}
          quoteRequest={quoteRequest}
          onSend={chat.send}
          onPermission={chat.answerPermission}
          onJumpTo={onJumpTo}
        />
      </div>
    </div>
  )
}
