import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ChatSendRequest, ChatThreadRef, DiffDocument, DiffSelection } from '@review/shared'
import { fetchFile } from '../api'
import { ChatDock } from '../chat/ChatDock'
import { InlineChat } from '../chat/InlineChat'
import { DOCK_THREAD, useChatThreads } from '../chat/useChatThreads'
import { useTurnSettings } from '../chat/useTurnSettings'
import { AskPill } from '../diff/AskPill'
import { DiffView, lineKey, type DiffMode, type LineThreadState } from '../diff/DiffView'
import type { LineRef } from '../diff/LineActionButton'
import { parsePatch } from '../diff/parsePatch'
import { useDiffSelection } from '../diff/useDiffSelection'
import { FileTree } from '../files/FileTree'
import { basename, scopeKind } from '../files/scope'
import { TopPrBar } from '../files/TopPrBar'
import type { ViewedState } from '../files/useViewed'
import { MarkdownView, type MarkdownThread } from '../markdown/MarkdownView'
import { keys, useConfig } from '../pr/queries'
import { usePrArtifacts, type PrWorkspaceData } from '../pr/usePrArtifacts'
import { Segmented } from '../shell/Segmented'
import type { LayoutState } from '../shell/useLayout'
import { SelectionComposer } from './SelectionComposer'

const FLASH_MS = 200

export function isEditing(target: EventTarget | null): boolean {
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

/** Selects a file and scrolls to (and flashes) a line range in it. */
export type JumpTo = (path: string, start: number, end: number) => void

type WorkspaceProps = {
  scope: string
  document: DiffDocument
  layout: LayoutState
  viewed: ViewedState
  defaultDiffMode: DiffMode
  /** False while the scope cannot chat yet (PR without worktree); `chatNotice` is shown in the dock instead. */
  chatEnabled: boolean
  chatNotice?: string
  /** Sidebar header: the scope selector (diff mode) or the PR header block. */
  sidebarHeader: ReactNode
  sidebarFooter?: ReactNode
  /** Lead of the top PR bar in the `tight` layout. */
  topBarLead: ReactNode
  /** Present in PR mode: comments and their mutations. */
  pr?: PrWorkspaceData
  /** File-header controls after the view toggle (the `Agent review` button). */
  headerActions?: ReactNode
  /** Overlay over the center pane (the review panel); receives the jump-to so a card can land on its line. */
  centerOverlay?: (jumpTo: JumpTo) => ReactNode
}

/** File tree, one file's diff or rendered markdown, inline chats and the chat dock, for one scope. Both modes render this. */
export function Workspace({
  scope,
  document,
  layout,
  viewed,
  defaultDiffMode,
  chatEnabled,
  chatNotice,
  sidebarHeader,
  sidebarFooter,
  topBarLead,
  pr,
  headerActions,
  centerOverlay,
}: WorkspaceProps) {
  const [mode, setMode] = useState<DiffMode>(defaultDiffMode)
  const [mdMode, setMdMode] = useState<MdMode>('rich')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  /** Id of the line thread whose card is showing; every other thread is minimized. */
  const [chatLine, setChatLine] = useState<string | null>(null)
  /** Text placed in the inline chat input when a finding is discussed. */
  const [chatSeed, setChatSeed] = useState<string | undefined>(undefined)
  /** Line whose comment composer is open (PR mode). */
  const [composer, setComposer] = useState<LineRef | null>(null)
  /** Markdown selection being commented on (PR mode). */
  const [selectionComposer, setSelectionComposer] = useState<DiffSelection | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const touchedLine = useRef<LineRef | null>(null)
  const pendingJump = useRef<{ path: string; start: number; end: number } | null>(null)

  const config = useConfig()
  const chat = useChatThreads(scope, chatEnabled)
  const turn = useTurnSettings()
  const dock = chat.thread(DOCK_THREAD)
  const { selections, rect: selectionRect, clear: clearSelection } = useDiffSelection(body)

  const parsedByPath = useMemo(() => new Map(parsePatch(document.patch).map((f) => [f.path, f])), [document.patch])
  const files = document.files
  const filePaths = useMemo(() => files.map((f) => f.path), [files])
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

  // Rich view needs the whole file; the source cannot provide it for patch files (404) or before a PR worktree exists (409).
  const markdownPath = selectedFile && isMarkdownPath(selectedFile.path) ? selectedFile.path : null
  const fileContent = useQuery({
    queryKey: keys.file(scope, markdownPath),
    queryFn: () => {
      if (!markdownPath) throw new Error('not a markdown file')
      return fetchFile(markdownPath, scope)
    },
    enabled: markdownPath !== null,
    retry: false,
    staleTime: Infinity,
  })
  const richUnavailable = fileContent.isError
  const showRich = markdownPath !== null && mdMode === 'rich' && !richUnavailable

  const selectFile = useCallback((path: string) => {
    setSelectedPath(path)
    setOpenMenu(null)
    setComposer(null)
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

  const askLine = useCallback(
    (ref: LineRef) => {
      setChatSeed(undefined)
      openLineChat(anchorOf(ref))
    },
    [openLineChat],
  )

  const discussLine = useCallback(
    (ref: LineRef, seed: string) => {
      setChatSeed(seed)
      openLineChat(anchorOf(ref))
    },
    [openLineChat],
  )

  const askSelection = useCallback(
    (selections: DiffSelection[]) => {
      const first = selections[0]
      if (first) openLineChat(first)
    },
    [openLineChat],
  )

  const commentLine = useCallback((ref: LineRef) => {
    setOpenMenu(null)
    setComposer(ref)
  }, [])

  const closeComposer = useCallback(() => setComposer(null), [])

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

  const onJumpTo = useCallback<JumpTo>(
    (path, start, end) => {
      pendingJump.current = { path, start, end }
      selectFile(path)
    },
    [selectFile],
  )

  const artifacts = usePrArtifacts({
    pr,
    path: selectedFile?.path ?? null,
    composer,
    now: pr?.now ?? 0,
    onCloseComposer: closeComposer,
    onAsk: askLine,
    onDiscuss: discussLine,
  })

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
        // One layer per press: line menu, then the composer, then the inline chat card. Overlays are the shell's.
        clearSelection()
        if (openMenu) setOpenMenu(null)
        else if (composer || selectionComposer) {
          setComposer(null)
          setSelectionComposer(null)
        } else if (chatLine) setChatLine(null)
        return
      }
      if (isEditing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case 'a':
          if (touchedLine.current) askLine(touchedLine.current)
          break
        case 'c':
          if (pr && touchedLine.current) commentLine(touchedLine.current)
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
        case 'v':
          if (selectedFile) viewed.toggle(selectedFile.path)
          break
        case 'y':
          if (touchedLine.current) copyRef(touchedLine.current)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    clearSelection,
    openMenu,
    composer,
    selectionComposer,
    chatLine,
    stepFile,
    selectedFile,
    viewed,
    copyRef,
    askLine,
    commentLine,
    pr,
    markdownPath,
    toggleMdMode,
  ])

  const reviewAgent = pr?.agentReview?.review.agent
  const dockProvenance = reviewAgent ? `opencode · ${reviewAgent} · worktree attached` : undefined

  const mdControl = markdownPath !== null && (
    <Segmented<MdMode>
      label="Markdown view"
      value={showRich ? 'rich' : 'raw'}
      options={[
        {
          value: 'rich',
          label: 'Rich',
          disabled: richUnavailable,
          title: richUnavailable ? 'Not available for this scope yet' : undefined,
        },
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
    <>
      {!layout.tight && (
        <FileTree
          files={files}
          selectedPath={selectedFile?.path ?? null}
          viewed={viewed.viewed}
          badges={pr?.badges}
          width={layout.sidebarW}
          header={sidebarHeader}
          footer={sidebarFooter}
          onSelect={selectFile}
          onToggleViewed={viewed.toggle}
          onStartResize={layout.startSidebarResize}
        />
      )}
      <main className="center">
        {layout.tight && <TopPrBar files={files} selectedPath={selectedFile?.path ?? null} lead={topBarLead} onSelect={selectFile} />}
        {files.length === 0 && (
          <p className="notice">
            No changes in this scope
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
            toolbar={
              <>
                {mdControl}
                {headerActions}
              </>
            }
            onAsk={openLineChat}
            onComment={pr ? setSelectionComposer : undefined}
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
            viewed={viewed.viewed.has(selectedFile.path)}
            openMenu={openMenu}
            threads={threadsByLine}
            artifacts={artifacts}
            bodyRef={body}
            toolbar={mdControl}
            headerActions={headerActions}
            onMode={setMode}
            onToggleViewed={() => viewed.toggle(selectedFile.path)}
            onToggleMenu={setOpenMenu}
            onComment={pr ? commentLine : undefined}
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
            seed={chatSeed}
            onSend={(text) => chat.send(openThread.id, { text, ...turn.settings })}
            onPermission={(permissionID, reply) => chat.respondPermission(openThread.id, permissionID, reply)}
            onMinimize={() => setChatLine(null)}
            onClose={() => closeThread(openThread.id)}
          />
        )}
        {pr && selectionComposer && (
          <SelectionComposer
            selection={selectionComposer}
            onSubmit={(body) =>
              void pr.actions
                .add({
                  path: selectionComposer.path,
                  line: selectionComposer.endLine,
                  startLine: selectionComposer.startLine === selectionComposer.endLine ? null : selectionComposer.startLine,
                  side: 'RIGHT',
                  body,
                })
                .then(() => setSelectionComposer(null))
            }
            onCancel={() => setSelectionComposer(null)}
            onAsk={() => {
              setSelectionComposer(null)
              openLineChat(selectionComposer)
            }}
          />
        )}
        {centerOverlay?.(onJumpTo)}
      </main>
      <ChatDock
        open={layout.dockOpen}
        scope={scopeKind(document.source)}
        currentFile={selectedFile ? basename(selectedFile.path) : null}
        fileCount={files.length}
        filePaths={filePaths}
        parts={dock.parts}
        idle={dock.idle}
        permissions={dock.permissions}
        error={dock.error}
        config={config.data}
        notice={chatEnabled ? undefined : chatNotice}
        provenance={dockProvenance}
        turn={turn}
        lastTurn={dock.lastTurn}
        onSend={onSend}
        onAbort={() => void chat.abort(DOCK_THREAD)}
        onPermission={(id, reply) => chat.respondPermission(DOCK_THREAD, id, reply)}
        onJumpTo={onJumpTo}
        onToggle={layout.toggleDock}
        width={layout.dockOpenW}
        onStartResize={layout.startDockResize}
      />
    </>
  )
}
