import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ChatSendRequest, ChatThreadRef, DiffDocument, DiffSelection } from '@review/shared'
import { ApiError, fetchFile } from '../api'
import { ChatDock } from '../chat/ChatDock'
import { DockContext } from '../chat/DockContext'
import { containsSelection, selectionLabel, selectedDiffLines } from '../chat/chatContext'
import { ChatConnector } from '../chat/ChatConnector'
import { useConversations } from '../pr/CommentAttention'
import { Article, FileCode, ArrowDown } from '@phosphor-icons/react'
import { DOCK_THREAD, useChatThreads } from '../chat/useChatThreads'
import { useTurnSettings } from '../chat/useTurnSettings'
import { AskPill } from '../diff/AskPill'
import { DiffView, lineKey, type DiffMode, type LineThreadState } from '../diff/DiffView'
import type { LineRef } from '../diff/LineActionButton'
import { parsePatch } from '../diff/parsePatch'
import { useDiffSelection } from '../diff/useDiffSelection'
import { FileTree } from '../files/FileTree'
import { basename, scopeKind } from '../files/scope'
import { usePublishSearchTargets, type SearchTargets } from '../shell/searchTargets'
import { TopPrBar } from '../files/TopPrBar'
import type { ViewedState } from '../files/useViewed'
import { MarkdownView, type MarkdownThread } from '../markdown/MarkdownView'
import { keys, useConfig } from '../pr/queries'
import { usePrArtifacts, type PrWorkspaceData } from '../pr/usePrArtifacts'
import { OutdatedComments } from '../pr/OutdatedComments'
import { outdatedThreads } from '../pr/comments'
import { Segmented } from '../shell/Segmented'
import type { LayoutState } from '../shell/useLayout'
import { SelectionComposer } from './SelectionComposer'
import { useAppearance } from '../theme/AppearanceContext'

const FLASH_MS = 200

export function isEditing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable
}

/** Scrolls the diff body to `path:start` and flashes rows start..end. */
function flashLines(body: HTMLElement, path: string, start: number, end: number) {
  const escaped = CSS.escape(path)
  const first = body.querySelector<HTMLElement>(`[data-path="${escaped}"][data-line="${start}"]`)
  if (!first) return false
  first.scrollIntoView({ block: 'center' })
  const rows = [...body.querySelectorAll<HTMLElement>(`[data-path="${escaped}"][data-line]`)].filter((row) => {
    const line = Number(row.dataset.line)
    return line >= start && line <= end
  })
  for (const row of rows) row.classList.add('flash')
  window.setTimeout(() => rows.forEach((row) => row.classList.remove('flash')), FLASH_MS)
  return true
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
  /** PR landing page; selecting any file leaves it. */
  overview?: ReactNode
  commentJump?: { path: string; remoteId: string } | null
  onConversation?: (thread: import('@review/shared').AttentionThread) => void
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
  overview,
  commentJump,
  onConversation,
  sidebarHeader,
  sidebarFooter,
  topBarLead,
  pr,
  headerActions,
  centerOverlay,
}: WorkspaceProps) {
  const [showOverview, setShowOverview] = useState(Boolean(overview))
  const appearance = useAppearance()
  const conversations = useConversations()
  const [mode, setMode] = useState<DiffMode>(defaultDiffMode)
  const [mdMode, setMdMode] = useState<MdMode>('rich')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [reveal, setReveal] = useState(0)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  /** Id of the line thread whose card is showing; every other thread is minimized. */
  const [chatLine, setChatLine] = useState<string | null>(null)
  const chatRequest = useRef(0)
  const [chatOpenError, setChatOpenError] = useState<string | null>(null)
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
  const dock = chat.thread(chatLine ?? DOCK_THREAD)
  const { selections, rect: selectionRect, clear: clearSelection } = useDiffSelection(body)

  const parsedByPath = useMemo(() => new Map(parsePatch(document.patch).map((f) => [f.path, f])), [document.patch])
  const files = document.files
  const filePaths = useMemo(() => files.map((f) => f.path), [files])
  const selectedIndex = files.findIndex((f) => f.path === selectedPath)
  const selectedFile = showOverview ? undefined : selectedIndex >= 0 ? files[selectedIndex] : files[0]
  const openThread = chat.refs.find((ref) => ref.id === chatLine) ?? null
  const fileThreads = useMemo(
    () => chat.refs.filter((ref): ref is ChatThreadRef & { anchor: DiffSelection } => ref.anchor !== null && ref.anchor.path === selectedFile?.path),
    [chat.refs, selectedFile?.path],
  )
  const threadsByLine = useMemo(() => {
    const byLine: Record<string, LineThreadState> = {}
    for (const ref of fileThreads) {
      for (let line = ref.anchor.startLine; line <= ref.anchor.endLine; line++) byLine[lineKey(ref.anchor.side === 'LEFT' ? 'old' : 'new', line)] = ref.id === chatLine ? 'open' : 'minimized'
    }
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
    setReveal((n) => n + 1)
    setShowOverview(false)
    setSelectedPath(path)
    setOpenMenu(null)
    setComposer(null)
  }, [])

  const commentPathAvailable = files.some((f) => f.path === commentJump?.path)
  useEffect(() => {
    if (!commentJump) return
    if (commentPathAvailable) {
      selectFile(commentJump.path)
      setMdMode('raw')
    } else setShowOverview(true)
  }, [commentJump, commentPathAvailable, selectFile])

  const queryClient = useQueryClient()
  const loadFile = useCallback(
    (path: string) =>
      queryClient
        .fetchQuery({ queryKey: keys.file(scope, path), queryFn: () => fetchFile(path, scope), staleTime: Infinity, retry: false })
        .then((f) => f.content)
        .catch((e: unknown) => (e instanceof ApiError && e.status === 404 ? null : Promise.reject(e))),
    [queryClient, scope],
  )

  const searchTargets = useMemo<SearchTargets>(
    () => ({
      placeholder: `Jump to a file · ${files.length} in this diff`,
      items: files.map((f) => ({ id: f.path, label: basename(f.path), hint: f.path })),
      onPick: (item) => selectFile(item.id),
    }),
    [files, selectFile],
  )
  usePublishSearchTargets(searchTargets)

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
      layout.openDock()
      const request = ++chatRequest.current
      setChatOpenError(null)
      const existing = chat.refs.find((r) => r.anchor && containsSelection(r.anchor, anchor))
      if (existing) setChatLine(existing.id)
      else void chat.openLineThread(anchor).then((ref) => { if (request === chatRequest.current) setChatLine(ref.id) }, (e: Error) => setChatOpenError(e.message))
    },
    [chat.openLineThread, chat.refs, clearSelection, layout.openDock],
  )

  const selectChatLine = useCallback((ref: LineRef, extend: boolean) => {
    const previous = openThread?.anchor
    const base = extend && previous?.path === ref.path && previous.side === (ref.side === 'old' ? 'LEFT' : 'RIGHT') ? previous.startLine : ref.line
    const startLine = Math.min(base, ref.line), endLine = Math.max(base, ref.line)
    const lines = parsedByPath.get(ref.path)?.hunks.flatMap((h) => h.lines).filter((l) => {
      const n = ref.side === 'old' ? l.oldLine : l.newLine
      return n != null && n >= startLine && n <= endLine
    }) ?? []
    setChatSeed(undefined)
    openLineChat({ ...anchorOf(ref), startLine, endLine, text: lines.map((l) => l.text).join('\n') || ref.text })
  }, [openThread, parsedByPath, openLineChat])

  const askLine = useCallback(
    (ref: LineRef) => {
      setChatSeed(undefined)
      selectChatLine(ref, false)
    },
    [selectChatLine],
  )

  const discussLine = useCallback(
    (ref: LineRef, seed: string) => {
      setChatSeed(seed)
      const line = parsedByPath.get(ref.path)?.hunks.flatMap((h) => h.lines).find((l) => (ref.side === 'old' ? l.oldLine : l.newLine) === ref.line)
      openLineChat({ ...anchorOf(ref), text: line?.text ?? ref.text })
    },
    [openLineChat, parsedByPath],
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

  const onSend = useCallback(
    (request: ChatSendRequest) => chat.send(chatLine ?? DOCK_THREAD, { ...request, ...turn.settings }),
    [chat.send, chatLine, turn.settings],
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

  const nextConversation = useCallback(() => {
    const all = [...(conversations?.threads ?? [])].filter((t) => t.comments[0]?.path)
      .sort((a, b) => Number(Boolean(b.unreadMentions.length || b.unreadReplies.length)) - Number(Boolean(a.unreadMentions.length || a.unreadReplies.length)))
    const index = all.findIndex((t) => t.comments.some((c) => c.remoteId === conversations?.target))
    const next = all[(index + 1) % all.length]
    if (next) onConversation?.(next)
  }, [conversations, onConversation])

  const fileConversations = conversations?.threads.filter((t) => t.comments[0]?.path === selectedFile?.path) ?? []
  const collapseConversations = () => conversations?.setOpen(fileConversations.map((t) => t.rootId), !fileConversations.some((t) => conversations.open[t.rootId]))

  // The jump target may belong to a file that was not rendered yet; flash once the body shows it.
  useEffect(() => {
    const jump = pendingJump.current
    if (!jump || !body.current || selectedFile?.path !== jump.path) return
    if (flashLines(body.current, jump.path, jump.start, jump.end)) pendingJump.current = null
  })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Inputs own their Esc (the chat composer stops the agent / clears its draft).
        if (isEditing(e.target)) return
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
        case 'x':
          collapseConversations()
          break
        case 'n':
          nextConversation()
          break
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
    nextConversation,
    collapseConversations,
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
          chatCounts={Object.fromEntries(files.map((f) => [f.path, chat.refs.filter((r) => r.anchor?.path === f.path && (r.id === chatLine || chat.thread(r.id).parts.length)).length]))}
          chatPath={openThread?.anchor?.path}
          width={layout.sidebarW}
          header={<>{sidebarHeader}{overview && <button className="overview-nav" aria-pressed={showOverview} onClick={() => setShowOverview(true)}><Article size={13} />Overview <span>{conversations?.threads.filter((t) => t.unreadMentions.length || t.unreadReplies.length).length || ''}</span></button>}</>}
          footer={sidebarFooter}
          onSelect={selectFile}
          onToggleViewed={viewed.toggle}
          onStartResize={layout.startSidebarResize}
        />
      )}
      <main className="center" style={{ '--center-w': `${layout.centerW}px` } as React.CSSProperties}>
        {overview && <div className="overview-toolbar">
          <button className="workspace-tab" aria-pressed={showOverview} onClick={() => setShowOverview(true)}><Article size={13} />Overview</button>
          <button className="workspace-tab" aria-pressed={!showOverview} onClick={() => { setShowOverview(false); if (!selectedPath && files[0]) selectFile(files[0].path) }}><FileCode size={13} />Files changed <span className="mono">{files.length}</span></button>
          <div className="workspace-tab-actions">{!showOverview && <button className="btn btn-ghost btn-xs" title="Next conversation (n)" onClick={nextConversation}><ArrowDown size={15} /></button>}{headerActions}</div>
          {showOverview && appearance?.focus && <button className="btn btn-secondary btn-xs" onClick={appearance.onToggleFocus}>Exit focus</button>}
        </div>}
        {showOverview && overview}
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
            revealKey={reveal}
            onBodyReady={() => { const jump = pendingJump.current; if (jump && body.current && jump.path === selectedFile.path && flashLines(body.current, jump.path, jump.start, jump.end)) pendingJump.current = null }}
            parsed={parsedByPath.get(selectedFile.path)}
            mode={mode}
            compact={layout.compact}
            viewed={viewed.viewed.has(selectedFile.path)}
            openMenu={openMenu}
            threads={threadsByLine}
            artifacts={artifacts}
            bodyRef={body}
            codeFace={markdownPath === null}
            toolbar={mdControl}
            headerActions={overview ? undefined : headerActions}
            fileNav={{ index: selectedIndex < 0 ? 0 : selectedIndex, count: files.length, onStep: stepFile }}
            onSelectLine={selectChatLine}
            conversationsControl={pr ? <button className="btn btn-secondary toolbar-btn" onClick={collapseConversations}>{fileConversations.some((t) => conversations?.open[t.rootId]) ? 'Collapse' : 'Expand'} conversations <kbd>X</kbd></button> : undefined}
            loadFile={loadFile}
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
            {pr && <OutdatedComments threads={outdatedThreads(pr.threads, selectedFile.path)} now={pr.now} />}
          </DiffView>
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
        contextKey={chatLine ?? DOCK_THREAD}
        contextLabel={openThread?.anchor ? selectionLabel(openThread.anchor) : undefined}
        seed={chatSeed}
        context={<DockContext refs={chat.refs.filter((ref) => ref.id === chatLine || chat.thread(ref.id).parts.length > 0)} active={openThread} lines={openThread?.anchor ? selectedDiffLines(openThread.anchor, parsedByPath.get(openThread.anchor.path)) : []} onSelect={(id) => {
          chatRequest.current++; setChatLine(id); setChatSeed(undefined); clearSelection(); layout.openDock()
          const anchor = chat.refs.find((ref) => ref.id === id)?.anchor
          if (anchor) { setMdMode('raw'); onJumpTo(anchor.path, anchor.startLine, anchor.endLine) }
        }} onJump={() => { const a = openThread?.anchor; if (a) { setMdMode('raw'); onJumpTo(a.path, a.startLine, a.endLine) } }} />}
        open={layout.dockOpen}
        scope={document.source.kind === 'pr' ? `#${document.source.number}` : scopeKind(document.source)}
        currentFile={selectedFile ? basename(selectedFile.path) : null}
        fileCount={files.length}
        filePaths={filePaths}
        parts={dock.parts}
        idle={dock.idle}
        permissions={dock.permissions}
        error={chatOpenError ?? dock.error}
        config={config.data}
        notice={chatEnabled ? undefined : chatNotice}
        provenance={dockProvenance}
        turn={turn}
        lastTurn={dock.lastTurn}
        onSend={onSend}
        onAbort={() => void chat.abort(chatLine ?? DOCK_THREAD)}
        onPermission={(id, reply) => chat.respondPermission(chatLine ?? DOCK_THREAD, id, reply)}
        onJumpTo={onJumpTo}
        onToggle={layout.toggleDock}
        width={layout.dockOpenW}
        onStartResize={layout.startDockResize}
      />
      <ChatConnector bodyRef={body} active={Boolean(!showOverview && !showRich && layout.dockOpen && openThread?.anchor?.path === selectedFile?.path)} />
    </>
  )
}
