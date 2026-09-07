import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ChatSendRequest, ChatThreadRef, DiffSelection } from '@review/shared'
import { fetchConfig, fetchDiff, fetchFile } from './api'
import { ChatDock } from './chat/ChatDock'
import { InlineChat } from './chat/InlineChat'
import { DOCK_THREAD, useChatThreads } from './chat/useChatThreads'
import { useTurnSettings } from './chat/useTurnSettings'
import { AskPill } from './diff/AskPill'
import { DiffView, lineKey, type DiffMode, type LineThreadState } from './diff/DiffView'
import type { LineRef } from './diff/LineActionButton'
import { parsePatch } from './diff/parsePatch'
import { useDiffSelection } from './diff/useDiffSelection'
import { FileTree } from './files/FileTree'
import { basename, scopeKind } from './files/scope'
import { TopPrBar } from './files/TopPrBar'
import { useViewed } from './files/useViewed'
import { MarkdownView, type MarkdownThread } from './markdown/MarkdownView'
import { Rail } from './shell/Rail'
import { Segmented } from './shell/Segmented'
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

/** Rendered markdown, or the file's own diff. */
type MdMode = 'rich' | 'raw'

function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown)$/i.test(path)
}

/** The `lineKey` a thread anchor lands on inside its file. */
function anchorKey(anchor: DiffSelection): string {
  return lineKey(anchor.side === 'LEFT' ? 'old' : 'new', anchor.startLine)
}

function anchorOf(ref: LineRef): DiffSelection {
  return { path: ref.path, startLine: ref.line, endLine: ref.line, side: ref.side === 'old' ? 'LEFT' : 'RIGHT', text: ref.text }
}

/** Application shell: top bar, rail, file tree, one file's diff, chat dock and status bar. */
export function App() {
  const [uiTheme, setUiTheme] = useUiTheme()
  const [diffTheme, setDiffTheme] = useDiffTheme()
  const layout = useLayout()
  const { toggleDock } = layout
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [mode, setMode] = useState<DiffMode>('unified')
  const [mdMode, setMdMode] = useState<MdMode>('rich')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  /** Id of the line thread whose card is showing; every other thread is minimized. */
  const [chatLine, setChatLine] = useState<string | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const touchedLine = useRef<LineRef | null>(null)
  const pendingJump = useRef<{ path: string; start: number; end: number } | null>(null)

  const diff = useQuery({ queryKey: ['diff'], queryFn: fetchDiff })
  const config = useQuery({ queryKey: ['config'], queryFn: fetchConfig, staleTime: Infinity })
  const chat = useChatThreads()
  const turn = useTurnSettings()
  const dock = chat.thread(DOCK_THREAD)
  const { selections, rect: selectionRect, clear: clearSelection } = useDiffSelection(body)

  const document = diff.data
  const scopePath = document?.source.path ?? null
  const { viewed, toggle: toggleViewed } = useViewed(scopePath)
  const parsedByPath = useMemo(() => new Map(parsePatch(document?.patch ?? '').map((f) => [f.path, f])), [document?.patch])
  const files = document?.files ?? []
  const selectedIndex = files.findIndex((f) => f.path === selectedPath)
  const selectedFile = selectedIndex >= 0 ? files[selectedIndex] : files[0]
  const openThread = chat.refs.find((ref) => ref.id === chatLine) ?? null
  const fileThreads = useMemo(
    () => chat.refs.filter((ref): ref is ChatThreadRef & { anchor: DiffSelection } => ref.anchor?.path === selectedFile?.path),
    [chat.refs, selectedFile?.path],
  )
  const threadsByLine = useMemo(() => {
    const byLine: Record<string, LineThreadState> = {}
    for (const ref of fileThreads) byLine[anchorKey(ref.anchor)] = ref.id === chatLine ? 'open' : 'minimized'
    return byLine
  }, [fileThreads, chatLine])
  const markdownThreads = useMemo<MarkdownThread[]>(
    () =>
      fileThreads.map((ref) => ({
        id: ref.id,
        startLine: ref.anchor.startLine,
        endLine: ref.anchor.endLine,
        text: ref.anchor.text,
        open: ref.id === chatLine,
      })),
    [fileThreads, chatLine],
  )

  // Rich view needs the whole file; the source cannot provide it for patch files (404), then raw is the only view.
  const markdownPath = selectedFile && isMarkdownPath(selectedFile.path) ? selectedFile.path : null
  const fileContent = useQuery({
    queryKey: ['file', markdownPath],
    queryFn: () => {
      if (!markdownPath) throw new Error('not a markdown file')
      return fetchFile(markdownPath)
    },
    enabled: markdownPath !== null,
    retry: false,
    staleTime: Infinity,
  })
  const richUnavailable = fileContent.isError
  const showRich = markdownPath !== null && mdMode === 'rich' && !richUnavailable

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

  const openLineChat = useCallback(
    (anchor: DiffSelection) => {
      setOpenMenu(null)
      clearSelection()
      void chat.openLineThread(anchor).then((ref) => setChatLine(ref.id))
    },
    [chat.openLineThread, clearSelection],
  )

  const askLine = useCallback((ref: LineRef) => openLineChat(anchorOf(ref)), [openLineChat])

  const askSelection = useCallback(
    (selections: DiffSelection[]) => {
      const first = selections[0]
      if (first) openLineChat(first)
    },
    [openLineChat],
  )

  const toggleThread = useCallback(
    (key: string) => {
      const ref = fileThreads.find((r) => anchorKey(r.anchor) === key)
      if (ref) setChatLine((current) => (current === ref.id ? null : ref.id))
    },
    [fileThreads],
  )

  const toggleThreadById = useCallback((id: string) => setChatLine((current) => (current === id ? null : id)), [])

  const toggleMdMode = useCallback(() => setMdMode((current) => (current === 'rich' ? 'raw' : 'rich')), [])

  const closeThread = useCallback(
    (id: string) => {
      chat.forget(id)
      setChatLine((current) => (current === id ? null : current))
    },
    [chat.forget],
  )

  const onSend = useCallback(
    (request: ChatSendRequest) => chat.send(DOCK_THREAD, { ...request, ...turn.settings }),
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
        // One layer per press: line menu, then the inline chat card, then overlays.
        clearSelection()
        if (openMenu) setOpenMenu(null)
        else if (chatLine) setChatLine(null)
        else setOverlay(null)
        return
      }
      if (isEditing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case '?':
          toggleOverlay('shortcuts')
          break
        case 'a':
          if (touchedLine.current) askLine(touchedLine.current)
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
        case 'm':
          if (markdownPath) toggleMdMode()
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
  }, [clearSelection, openMenu, chatLine, toggleOverlay, stepFile, toggleDock, selectedFile, toggleViewed, copyRef, askLine, markdownPath, toggleMdMode])

  const mdControl = markdownPath !== null && (
    <Segmented<MdMode>
      label="Markdown view"
      value={showRich ? 'rich' : 'raw'}
      options={[
        { value: 'rich', label: 'Rich', disabled: richUnavailable, title: richUnavailable ? 'Not available for patch files' : undefined },
        { value: 'raw', label: 'Raw diff' },
      ]}
      onChange={setMdMode}
    />
  )

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
          {selectedFile && showRich && fileContent.data && (
            <MarkdownView
              file={selectedFile}
              content={fileContent.data.content}
              compact={layout.compact}
              centerW={layout.centerW}
              threads={markdownThreads}
              toolbar={mdControl}
              onAsk={openLineChat}
              onToggleThread={toggleThreadById}
            />
          )}
          {selectedFile && showRich && fileContent.isPending && <p className="notice">Loading {basename(selectedFile.path)}…</p>}
          {selectedFile && !showRich && (
            <DiffView
              file={selectedFile}
              parsed={parsedByPath.get(selectedFile.path)}
              mode={mode}
              compact={layout.compact}
              viewed={viewed.has(selectedFile.path)}
              openMenu={openMenu}
              threads={threadsByLine}
              bodyRef={body}
              toolbar={mdControl}
              onMode={setMode}
              onToggleViewed={() => toggleViewed(selectedFile.path)}
              onToggleMenu={setOpenMenu}
              onAsk={askLine}
              onCopyRef={copyRef}
              onToggleThread={toggleThread}
              onTouchLine={(ref) => {
                touchedLine.current = ref
              }}
            >
              {pillPosition && selections.length > 0 && (
                <AskPill selections={selections} left={pillPosition.left} top={pillPosition.top} onAsk={askSelection} />
              )}
            </DiffView>
          )}
          {openThread && (
            <InlineChat
              key={openThread.id}
              thread={openThread}
              state={chat.thread(openThread.id)}
              onSend={(text) => chat.send(openThread.id, { text, ...turn.settings })}
              onPermission={(permissionID, reply) => chat.respondPermission(openThread.id, permissionID, reply)}
              onMinimize={() => setChatLine(null)}
              onClose={() => closeThread(openThread.id)}
            />
          )}
        </main>
        <ChatDock
          open={layout.dockOpen}
          scope={document ? scopeKind(document.source) : null}
          currentFile={selectedFile ? basename(selectedFile.path) : null}
          fileCount={files.length}
          parts={dock.parts}
          idle={dock.idle}
          permissions={dock.permissions}
          error={dock.error}
          config={config.data}
          turn={turn}
          lastTurn={dock.lastTurn}
          onSend={onSend}
          onPermission={(id, reply) => chat.respondPermission(DOCK_THREAD, id, reply)}
          onJumpTo={onJumpTo}
          onToggle={layout.toggleDock}
        />
      </div>
      <StatusBar scope={scopePath} />
      {overlay === 'shortcuts' && <ShortcutsSheet onClose={() => setOverlay(null)} />}
    </div>
  )
}
