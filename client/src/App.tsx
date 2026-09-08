import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { markPrDone, syncRepo } from './api'
import { ChatDock } from './chat/ChatDock'
import { useServerEvent } from './events/useServerEvents'
import { useTurnSettings } from './chat/useTurnSettings'
import { AddPrModal } from './inbox/AddPrModal'
import { Inbox } from './inbox/Inbox'
import { InboxSidebar, repoLabel } from './inbox/InboxSidebar'
import { DEFAULT_INBOX_FILTER, countByReviewState, filterInboxRows, inboxSubtitle, type InboxFilter, type ReviewState } from './inbox/inboxRows'
import { useNow } from './inbox/useNow'
import { PastReviews, PastSidebar } from './past/PastReviews'
import type { PastFilter } from './past/pastRows'
import { PrWorkspace } from './pr/PrWorkspace'
import { keys, useAccount, useInbox, useRepos, useSettings, useSyncInvalidation, useUpdateSettings } from './pr/queries'
import { ConnectModal } from './settings/ConnectModal'
import { Settings, SettingsSidebar } from './settings/Settings'
import type { SectionId } from './settings/sections'
import { TrackRepoModal } from './settings/TrackRepoModal'
import { Rail, type RailView } from './shell/Rail'
import { SearchModal } from './shell/SearchModal'
import { usePublishSearchTargets, useSearchTargets, type SearchTargets } from './shell/searchTargets'
import { ShortcutsSheet } from './shell/ShortcutsSheet'
import { StatusBar } from './shell/StatusBar'
import { TopBar } from './shell/TopBar'
import { useLayout } from './shell/useLayout'
import { useMode, type Mode } from './shell/useMode'
import { useDiffTheme, useUiTheme, type DiffTheme, type UiTheme } from './theme/useTheme'
import { DiffWorkspace } from './workspace/DiffWorkspace'
import { isEditing } from './workspace/Workspace'

const FLASH_MS = 5_000
const INBOX_FILTER_KEY = 'review.inboxFilter'

function storedInboxFilter(): InboxFilter {
  try {
    const raw = localStorage.getItem(INBOX_FILTER_KEY)
    if (!raw) return DEFAULT_INBOX_FILTER
    const parsed = JSON.parse(raw) as Partial<InboxFilter>
    return { show: { ...DEFAULT_INBOX_FILTER.show, ...parsed.show }, sort: parsed.sort === 'oldest' ? 'oldest' : 'newest' }
  } catch {
    return DEFAULT_INBOX_FILTER
  }
}

type Overlay = 'shortcuts' | 'scope' | 'repo' | 'add' | 'track' | 'connect' | 'search' | null

/** Which sidebar/center pair shows. */
type View = RailView

/** Application shell: top bar, rail, the mode's sidebar + center + dock, status bar and overlays. */
export function App() {
  const layout = useLayout()
  const client = useQueryClient()
  const repos = useRepos()
  const settings = useSettings()
  const account = useAccount()
  const updateSettings = useUpdateSettings()
  const [uiTheme, setUiTheme] = useUiTheme(settings.data?.theme)
  const [diffTheme, setDiffTheme] = useDiffTheme(settings.data?.diffTheme)
  const { mode, prAvailable, probed, setMode } = useMode(repos)
  useSyncInvalidation()

  const [overlay, setOverlay] = useState<Overlay>(null)
  const [view, setView] = useState<View>('inbox')
  const [repoId, setRepoId] = useState<number | null>(null)
  const [prId, setPrId] = useState<number | null>(null)
  /** Inbox row the `j`/`k` cursor is on. */
  const [inboxCursor, setInboxCursor] = useState<number | null>(null)
  const [scopePath, setScopePath] = useState<string | null>(null)
  const [prStatus, setPrStatus] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [pastFilter, setPastFilter] = useState<PastFilter>('all')
  /** Section the settings nav highlights (scroll spy) and, when set by a click, scrolls to. */
  const [section, setSection] = useState<SectionId>('accounts')
  const [requestedSection, setRequestedSection] = useState<SectionId | null>(null)
  const now = useNow(30_000)
  const turn = useTurnSettings()

  const repoList = repos.data ?? []
  const repo = repoList.find((r) => r.id === repoId) ?? repoList[0] ?? null
  const inbox = useInbox(mode === 'pr' ? (repo?.id ?? null) : null)
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>(() => storedInboxFilter())
  useEffect(() => localStorage.setItem(INBOX_FILTER_KEY, JSON.stringify(inboxFilter)), [inboxFilter])
  const toggleState = useCallback((state: ReviewState) => setInboxFilter((f) => ({ ...f, show: { ...f.show, [state]: !f.show[state] } })), [])
  const toggleSort = useCallback(() => setInboxFilter((f) => ({ ...f, sort: f.sort === 'newest' ? 'oldest' : 'newest' })), [])
  const counts = useMemo(() => countByReviewState(inbox.data ?? []), [inbox.data])
  const rows = useMemo(() => filterInboxRows(inbox.data ?? [], inboxFilter), [inbox.data, inboxFilter])
  const inboxNumbers = useMemo(() => new Set(rows.map((r) => r.number)), [rows])
  const defaultDiffMode = settings.data?.defaultDiffMode ?? 'unified'

  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [flash])

  const toggleOverlay = useCallback((which: Exclude<Overlay, null>) => {
    setOverlay((current) => (current === which ? null : which))
  }, [])

  const goInbox = useCallback(() => {
    setView('inbox')
    setPrId(null)
    setPrStatus(null)
  }, [])

  const goPast = useCallback(() => {
    setView('past')
    setPrId(null)
    setPrStatus(null)
  }, [])

  const goSettings = useCallback((target: SectionId = 'accounts') => {
    setView('settings')
    setPrId(null)
    setPrStatus(null)
    setSection(target)
    setRequestedSection(target)
    setOverlay(null)
  }, [])

  const pickUiTheme = useCallback(
    (theme: UiTheme) => {
      setUiTheme(theme)
      updateSettings.mutate({ theme })
    },
    [setUiTheme, updateSettings],
  )

  const pickDiffTheme = useCallback(
    (theme: DiffTheme) => {
      setDiffTheme(theme)
      updateSettings.mutate({ diffTheme: theme })
    },
    [setDiffTheme, updateSettings],
  )

  const openPr = useCallback((id: number) => {
    setPrId(id)
    setInboxCursor(id)
    setView('files')
    setOverlay(null)
  }, [])

  // `?pr=<id>` (from `review pr …`) lands on that PR; the param is dropped once consumed.
  useEffect(() => {
    if (!probed || mode !== 'pr' || !repos.data) return
    const url = new URL(window.location.href)
    const id = Number(url.searchParams.get('pr'))
    if (!Number.isInteger(id) || id <= 0) return
    url.searchParams.delete('pr')
    window.history.replaceState(null, '', url.pathname + (url.search || ''))
    const inboxRow = (inbox.data ?? []).find((r) => r.id === id)
    if (inboxRow) setRepoId(inboxRow.repoId)
    openPr(id)
  }, [probed, mode, repos.data, inbox.data, openPr])

  const switchMode = useCallback(
    (next: Mode) => {
      setMode(next)
      if (view === 'files' || view === 'inbox') goInbox()
      setOverlay(null)
    },
    [setMode, goInbox, view],
  )

  const selectRepo = useCallback(
    (id: number) => {
      setRepoId(id)
      setInboxCursor(null)
      goInbox()
      setOverlay(null)
    },
    [goInbox],
  )

  const refresh = useMutation({
    mutationFn: (id: number) => syncRepo(id),
    onMutate: () => setSyncing(true),
    onError: (e) => {
      setSyncing(false)
      setFlash(`refresh failed: ${e instanceof Error ? e.message : String(e)}`)
    },
  })
  // `useSyncInvalidation` refetches the inbox; here only the button state and the failure message.
  useServerEvent((event) => {
    if (event.type === 'sync.finished' && event.repoId === repo?.id) setSyncing(false)
    if (event.type === 'sync.failed' && event.repoId === repo?.id) {
      setSyncing(false)
      setFlash(`refresh failed: ${event.message}`)
    }
  })

  const done = useMutation({
    mutationFn: (id: number) => markPrDone(id),
    onSuccess: (_result, id) => {
      const row = rows.find((r) => r.id === id)
      if (repo) void client.invalidateQueries({ queryKey: keys.inbox(repo.id) })
      void client.invalidateQueries({ queryKey: keys.repos })
      if (prId === id) goInbox()
      setFlash(row ? `#${row.number} marked as done` : 'marked as done')
    },
    onError: (e) => setFlash(`could not mark done: ${e instanceof Error ? e.message : String(e)}`),
  })

  // While the inbox shows, ⌘K searches its PRs; an open diff publishes its files instead.
  const inboxTargets = useMemo<SearchTargets | null>(
    () =>
      mode === 'pr' && view === 'inbox'
        ? {
            placeholder: `Open a pull request · ${rows.length} pending`,
            items: rows.map((r) => ({ id: String(r.id), label: `#${r.number} ${r.title}`, hint: r.author })),
            onPick: (item) => openPr(Number(item.id)),
          }
        : null,
    [mode, view, rows, openPr],
  )
  usePublishSearchTargets(inboxTargets)
  const searchTargets = useSearchTargets()

  const stepInbox = useCallback(
    (direction: 1 | -1) => {
      if (rows.length === 0) return
      const index = rows.findIndex((r) => r.id === inboxCursor)
      const next = rows[index < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, index + direction))]
      if (next) setInboxCursor(next.id)
    },
    [rows, inboxCursor],
  )

  // Capture phase: overlays swallow `esc` before the workspace sees it; inbox keys live here too.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (overlay) {
          e.stopPropagation()
          setOverlay(null)
        }
        return
      }
      if (e.key === 'k' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        if (searchTargets) toggleOverlay('search')
        return
      }
      if (isEditing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case '?':
          toggleOverlay('shortcuts')
          break
        case 'd':
          layout.toggleDock()
          break
        case 'j':
          if (view === 'inbox') stepInbox(1)
          break
        case 'k':
          if (view === 'inbox') stepInbox(-1)
          break
        case 'Enter':
          if (view === 'inbox' && inboxCursor !== null && mode === 'pr') openPr(inboxCursor)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [overlay, toggleOverlay, layout.toggleDock, view, stepInbox, inboxCursor, mode, openPr, searchTargets])

  const status = (() => {
    if (flash) return flash
    if (view === 'past') return 'past reviews'
    if (view === 'settings') return 'settings'
    if (mode === 'diff') return `diff mode${scopePath ? ` · ${scopePath}` : ''}`
    if (view === 'files' && prStatus) return prStatus
    return `PR mode${repo ? ` · ${repoLabel(repo)}` : ''}`
  })()

  const showInbox = mode === 'pr' && view === 'inbox'
  const sideView = view === 'past' || view === 'settings'

  return (
    <div className="app">
      <TopBar
        mode={mode}
        modeLocked={probed && !prAvailable}
        onMode={switchMode}
        searchHint={searchTargets?.placeholder ?? null}
        onSearch={() => searchTargets && toggleOverlay('search')}
        onToggleShortcuts={() => toggleOverlay('shortcuts')}
        onToggleDock={layout.toggleDock}
      />
      <div className="app-body">
        <Rail prMode={mode === 'pr'} view={view} onInbox={goInbox} onPast={goPast} onSettings={() => goSettings()} />
        {view === 'past' && (
          <>
            {!layout.tight && (
              <PastSidebar filter={pastFilter} width={layout.sidebarW} onFilter={setPastFilter} onStartResize={layout.startSidebarResize} />
            )}
            <PastReviews filter={pastFilter} onManageWorktrees={() => goSettings('worktrees')} onFlash={setFlash} />
          </>
        )}
        {view === 'settings' && (
          <>
            {!layout.tight && (
              <SettingsSidebar section={section} width={layout.sidebarW} onSection={goSettings} onStartResize={layout.startSidebarResize} />
            )}
            {settings.data ? (
              <Settings
                settings={settings.data}
                uiTheme={uiTheme}
                diffTheme={diffTheme}
                requestedSection={requestedSection}
                onSectionInView={setSection}
                onUiTheme={pickUiTheme}
                onDiffTheme={pickDiffTheme}
                onTrackRepo={() => setOverlay('track')}
                onConnect={() => setOverlay('connect')}
                onFlash={setFlash}
              />
            ) : (
              <main className="center">
                <p className="notice">Loading settings…</p>
              </main>
            )}
          </>
        )}
        {!sideView && mode === 'diff' && (
          <DiffWorkspace
            layout={layout}
            defaultDiffMode={defaultDiffMode}
            scopeMenuOpen={overlay === 'scope'}
            onToggleScopeMenu={() => toggleOverlay('scope')}
            onScope={setScopePath}
          />
        )}
        {mode === 'pr' && view === 'files' && prId !== null && (
          <PrWorkspace
            prId={prId}
            inbox={rows}
            layout={layout}
            defaultDiffMode={defaultDiffMode}
            onBack={goInbox}
            onOpenPr={openPr}
            onDone={(id) => done.mutate(id)}
            onStatus={setPrStatus}
            onFlash={setFlash}
          />
        )}
        {showInbox && repo && (
          <>
            {!layout.tight && (
              <InboxSidebar
                repos={repoList}
                repo={repo}
                rows={rows}
                selectedPrId={inboxCursor}
                repoMenuOpen={overlay === 'repo'}
                syncing={syncing}
                now={now}
                width={layout.sidebarW}
                onSelectRepo={selectRepo}
                onToggleRepoMenu={() => toggleOverlay('repo')}
                onOpenPr={openPr}
                onAddPr={() => setOverlay('add')}
                onRefresh={() => refresh.mutate(repo.id)}
                onDone={(id) => done.mutate(id)}
                onManageRepos={() => goSettings('repositories')}
                filter={inboxFilter}
                counts={counts}
                onToggleState={toggleState}
                onToggleSort={toggleSort}
                onStartResize={layout.startSidebarResize}
              />
            )}
            <main className="center">
              {inbox.isPending && <p className="notice">Loading pull requests…</p>}
              {inbox.isError && <p className="notice">Could not load pull requests: {String(inbox.error)}</p>}
              {inbox.data && (
                <Inbox
                  repo={repoLabel(repo)}
                  subtitle={inboxSubtitle({
                    repo: repoLabel(repo),
                    pending: rows.length,
                    pollInterval: settings.data?.pollInterval ?? 5,
                    autoReviewOnFetch: settings.data?.autoReviewOnFetch ?? false,
                  })}
                  rows={rows}
                  selectedPrId={inboxCursor}
                  now={now}
                  onOpenPr={openPr}
                />
              )}
            </main>
            <ChatDock
              open={layout.dockOpen}
              scope="inbox"
              currentFile={null}
              fileCount={0}
              filePaths={[]}
              parts={[]}
              idle
              permissions={[]}
              error={null}
              config={undefined}
              notice="Open a pull request to chat about it."
              turn={turn}
              lastTurn={null}
              onSend={() => {}}
              onAbort={() => {}}
              onPermission={() => {}}
              onJumpTo={() => {}}
              onToggle={layout.toggleDock}
              width={layout.dockOpenW}
              onStartResize={layout.startDockResize}
            />
          </>
        )}
        {showInbox && !repo && (
          <main className="center">
            {repos.isPending ? (
              <p className="notice">Loading repositories…</p>
            ) : (
              <p className="notice">
                No tracked repositories.{' '}
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => goSettings('repositories')}>
                  Track one in Settings
                </button>
              </p>
            )}
          </main>
        )}
      </div>
      <StatusBar text={status} />
      {overlay === 'shortcuts' && <ShortcutsSheet onClose={() => setOverlay(null)} />}
      {overlay === 'search' && searchTargets && <SearchModal targets={searchTargets} onClose={() => setOverlay(null)} />}
      {overlay === 'connect' && account.data && (
        <ConnectModal
          account={account.data}
          onClose={() => setOverlay(null)}
          onConnected={(login) => {
            setFlash(`GitHub connected as ${login}`)
            void client.invalidateQueries({ queryKey: keys.repos })
          }}
        />
      )}
      {overlay === 'track' && (
        <TrackRepoModal
          repos={repoList}
          onClose={() => setOverlay(null)}
          onTracked={(count) => {
            setOverlay(null)
            setFlash(`${count} repositor${count === 1 ? 'y' : 'ies'} tracked`)
          }}
        />
      )}
      {overlay === 'add' && repo && (
        <AddPrModal
          repoId={repo.id}
          repo={repoLabel(repo)}
          inboxNumbers={inboxNumbers}
          now={now}
          onClose={() => setOverlay(null)}
          onAdded={(count) => {
            setOverlay(null)
            setFlash(`${count} PR${count === 1 ? '' : 's'} added to your list`)
          }}
        />
      )}
    </div>
  )
}
