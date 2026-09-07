import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ChatSendRequest, DiffSelection } from '@revu/shared'
import { fetchConfig, fetchDiff } from './api'
import { ChatDock, type QuoteRequest } from './chat/ChatDock'
import { useChat } from './chat/useChat'
import { useTurnSettings } from './chat/useTurnSettings'
import { AskPill } from './diff/AskPill'
import { DiffView, type DiffMode } from './diff/DiffView'
import type { LineRef } from './diff/LineActionButton'
import { parsePatch } from './diff/parsePatch'
import { useDiffSelection } from './diff/useDiffSelection'
import { FileTree } from './files/FileTree'
import { basename, scopeKind } from './files/scope'
import { TopPrBar } from './files/TopPrBar'
import { useViewed } from './files/useViewed'
import { Rail } from './shell/Rail'
import { ShortcutsSheet } from './shell/ShortcutsSheet'
import { StatusBar } from './shell/StatusBar'
import { TopBar } from './shell/TopBar'
import { useLayout } from './shell/useLayout'
import { useDiffTheme, useUiTheme } from './theme/useTheme'

const FLASH_MS = 200

function isEditing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')
}

/** Scrolls the diff body to `path:start` and flashes rows start..end. */
function flashLines(body: HTMLElement, path: string, start: number, end: number) {
  const escaped = CSS.escape(path)
  const first = body.querySelector<HTMLElement>(`[data-path="${escaped}"][data-line="${start}"]`)
  if (!first) return
  first.scrollIntoView({ block: 'center' })
  const rows = [...body.querySelectorAll<HTMLElement>(`[data-path="${escaped}"][data-line]`)].filter((row) => {
    const line = Number(row.dataset.line)
    return line >= start && line <= end
  })
  for (const row of rows) row.classList.add('flash')
  window.setTimeout(() => rows.forEach((row) => row.classList.remove('flash')), FLASH_MS)
}

type Overlay = 'shortcuts' | 'theme' | 'scope' | null

/** Application shell: top bar, rail, file tree, one file's diff, chat dock and status bar. */
export function App() {
  const [uiTheme, setUiTheme] = useUiTheme()
  const [diffTheme, setDiffTheme] = useDiffTheme()
  const layout = useLayout()
  const { toggleDock } = layout
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [mode, setMode] = useState<DiffMode>('unified')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [quoteRequest, setQuoteRequest] = useState<QuoteRequest | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const touchedLine = useRef<LineRef | null>(null)
  const pendingJump = useRef<{ path: string; start: number; end: number } | null>(null)

  const diff = useQuery({ queryKey: ['diff'], queryFn: fetchDiff })
  const config = useQuery({ queryKey: ['config'], queryFn: fetchConfig, staleTime: Infinity })
  const chat = useChat()
  const turn = useTurnSettings()
  const { selections, rect: selectionRect, clear: clearSelection } = useDiffSelection(body)

  const document = diff.data
  const scopePath = document?.source.path ?? null
  const { viewed, toggle: toggleViewed } = useViewed(scopePath)
  const parsedByPath = useMemo(() => new Map(parsePatch(document?.patch ?? '').map((f) => [f.path, f])), [document?.patch])
  const files = document?.files ?? []
  const selectedIndex = files.findIndex((f) => f.path === selectedPath)
  const selectedFile = selectedIndex >= 0 ? files[selectedIndex] : files[0]

  const toggleOverlay = useCallback((which: Exclude<Overlay, null>) => {
    setOverlay((current) => (current === which ? null : which))
  }, [])

  const selectFile = useCallback((path: string) => {
    setSelectedPath(path)
    setOpenMenu(null)
  }, [])

  const stepFile = useCallback(
    (direction: 1 | -1) => {
      if (files.length === 0) return
      const current = selectedIndex < 0 ? 0 : selectedIndex
      const next = files[Math.max(0, Math.min(files.length - 1, current + direction))]
      if (next) selectFile(next.path)
    },
    [files, selectedIndex, selectFile],
  )

  const onAsk = useCallback(
    (selections: DiffSelection[]) => {
      layout.openDock()
      setQuoteRequest({ id: Date.now(), selections })
      clearSelection()
    },
    [clearSelection, layout.openDock],
  )

  const onSend = useCallback(
    (request: ChatSendRequest) => chat.send({ ...request, ...turn.settings }),
    [chat.send, turn.settings],
  )

  const copyRef = useCallback((ref: LineRef) => {
    void navigator.clipboard.writeText(`${ref.path}:${ref.line}`)
    setOpenMenu(null)
  }, [])

  const onJumpTo = useCallback(
    (path: string, start: number, end: number) => {
      pendingJump.current = { path, start, end }
      selectFile(path)
    },
    [selectFile],
  )

  // The jump target may belong to a file that was not rendered yet; flash once the body shows it.
  useEffect(() => {
    const jump = pendingJump.current
    if (!jump || !body.current || selectedFile?.path !== jump.path) return
    pendingJump.current = null
    flashLines(body.current, jump.path, jump.start, jump.end)
  })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOverlay(null)
        setOpenMenu(null)
        clearSelection()
        return
      }
      if (isEditing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case '?':
          toggleOverlay('shortcuts')
          break
        case 'j':
          stepFile(1)
          break
        case 'k':
          stepFile(-1)
          break
        case 'u':
          setMode('unified')
          break
        case 's':
          setMode('split')
          break
        case 'd':
          toggleDock()
          break
        case 'v':
          if (selectedFile) toggleViewed(selectedFile.path)
          break
        case 'y':
          if (touchedLine.current) copyRef(touchedLine.current)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearSelection, toggleOverlay, stepFile, toggleDock, selectedFile, toggleViewed, copyRef])

  const pillPosition = (() => {
    if (!selectionRect || !body.current) return null
    const bodyRect = body.current.getBoundingClientRect()
    return {
      left: selectionRect.right - bodyRect.left + body.current.scrollLeft + 8,
      top: selectionRect.bottom - bodyRect.top + body.current.scrollTop + 4,
    }
  })()

  return (
    <div className="app">
      <TopBar
        uiTheme={uiTheme}
        diffTheme={diffTheme}
        themeMenuOpen={overlay === 'theme'}
        onToggleThemeMenu={() => toggleOverlay('theme')}
        onUiTheme={setUiTheme}
        onDiffTheme={setDiffTheme}
        onToggleShortcuts={() => toggleOverlay('shortcuts')}
        onToggleDock={layout.toggleDock}
      />
      <div className="app-body">
        <Rail />
        {document && !layout.tight && (
          <FileTree
            document={document}
            selectedPath={selectedFile?.path ?? null}
            viewed={viewed}
            scopeMenuOpen={overlay === 'scope'}
            width={layout.sidebarW}
            onSelect={selectFile}
            onToggleViewed={toggleViewed}
            onToggleScopeMenu={() => toggleOverlay('scope')}
            onStartResize={layout.startSidebarResize}
          />
        )}
        <main className="center">
          {document && layout.tight && (
            <TopPrBar document={document} selectedPath={selectedFile?.path ?? null} onSelect={selectFile} />
          )}
          {diff.isPending && <p className="notice">Loading diff…</p>}
          {diff.isError && <p className="notice">Could not load the diff: {String(diff.error)}</p>}
          {document && files.length === 0 && (
            <p className="notice">
              No changes in {document.source.path}
              {document.source.kind === 'repo' && !document.source.base
                ? '. The working tree is clean; pass --base <ref> to compare the branch instead.'
                : '.'}
            </p>
          )}
          {selectedFile && (
            <DiffView
              file={selectedFile}
              parsed={parsedByPath.get(selectedFile.path)}
              mode={mode}
              compact={layout.compact}
              viewed={viewed.has(selectedFile.path)}
              openMenu={openMenu}
              bodyRef={body}
              onMode={setMode}
              onToggleViewed={() => toggleViewed(selectedFile.path)}
              onToggleMenu={setOpenMenu}
              onCopyRef={copyRef}
              onTouchLine={(ref) => {
                touchedLine.current = ref
              }}
            >
              {pillPosition && selections.length > 0 && (
                <AskPill selections={selections} left={pillPosition.left} top={pillPosition.top} onAsk={onAsk} />
              )}
            </DiffView>
          )}
        </main>
        <ChatDock
          open={layout.dockOpen}
          scope={document ? scopeKind(document.source) : null}
          currentFile={selectedFile ? basename(selectedFile.path) : null}
          fileCount={files.length}
          parts={chat.parts}
          idle={chat.idle}
          permissions={chat.permissions}
          error={chat.error}
          quoteRequest={quoteRequest}
          config={config.data}
          turn={turn}
          lastTurn={chat.lastTurn}
          onSend={onSend}
          onPermission={chat.answerPermission}
          onJumpTo={onJumpTo}
          onToggle={layout.toggleDock}
        />
      </div>
      <StatusBar scope={scopePath} />
      {overlay === 'shortcuts' && <ShortcutsSheet onClose={() => setOverlay(null)} />}
    </div>
  )
}
