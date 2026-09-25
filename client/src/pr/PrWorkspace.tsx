import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowClockwise } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AgentFinding, DraftCommentRow, InboxRow, PrDetail, Verdict } from '@review/shared'
import {
  ApiError,
  createComment,
  deleteComment,
  keepAllFindings,
  keepFinding,
  openPr,
  patchComment,
  prScope,
  refreshPr,
  runReview,
  submitReview,
  unkeepFinding,
  type NewComment,
  type RunReviewOptions,
} from '../api'
import type { DiffMode } from '../diff/DiffView'
import { useNow } from '../inbox/useNow'
import type { LayoutState } from '../shell/useLayout'
import { Workspace, isEditing } from '../workspace/Workspace'
import { isActive, labelFor, submitHints } from './agentReview'
import { AgentReviewPanel } from './AgentReviewPanel'
import { countByPath, groupThreads } from './comments'
import { useDismissedFindings } from './dismissedFindings'
import { PrOverview } from './PrOverview'
import { CommentAttention } from './CommentAttention'
import { attentionPreview, canOpenConversation } from './attentionUi'
import type { AttentionThread } from '@review/shared'
import { PrTreeFooter, PrTreeHeader } from './PrTreeChrome'
import { keys, usePrDetail } from './queries'
import { RunReviewModal } from './RunReviewModal'
import { SubmitModal, verdictLabel } from './SubmitModal'
import type { PrCommentActions, PrWorkspaceData } from './usePrArtifacts'
import { useReviewProgress } from './useReviewProgress'
import { useServerViewed } from './useServerViewed'
import { useWorktree, worktreeLabel, type WorktreeState } from './useWorktree'

type PrWorkspaceProps = {
  prId: number
  /** PRs of the repo, for the `#n ▾` chip that cycles them. */
  inbox: InboxRow[]
  layout: LayoutState
  defaultDiffMode: DiffMode
  onBack: () => void
  onOpenPr: (prId: number) => void
  onDone: (prId: number) => void
  /** Status-bar text for this PR, or a 5 s flash. */
  onStatus: (text: string) => void
  onFlash: (text: string) => void
}

function submitErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'invalid_anchors':
        return `${e.ids.length} selected comment${e.ids.length === 1 ? ' is' : 's are'} no longer anchored to the diff; unselect or delete them.`
      case 'draft_stale':
        return 'PR moved to a new commit since the last sync; the diff has been refreshed — re-check your comments and submit again.'
      case 'pr_closed':
        return 'This PR was merged or closed on GitHub; reviews can no longer be submitted.'
      case 'approve_not_confirmed':
        return 'Approving needs confirmation.'
    }
  }
  return `Submit failed: ${e instanceof Error ? e.message : String(e)}`
}

function statusText(pr: PrDetail['pr'], worktree: WorktreeState): string {
  if (isActive(pr.agentStatus)) return `agent reviewing #${pr.number}…`
  return `PR mode · ${worktreeLabel(worktree)} · ${pr.headRef}`
}

function keepErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.code === 'draft_stale') return 'PR moved to a new commit; re-run the review.'
  return `Could not keep: ${e instanceof Error ? e.message : String(e)}`
}

/** Marks comments the server rejected as unanchored, on top of what the detail says. */
function withInvalid(drafts: DraftCommentRow[], invalidIds: ReadonlySet<number>): DraftCommentRow[] {
  if (invalidIds.size === 0) return drafts
  return drafts.map((d) => (invalidIds.has(d.id) ? { ...d, anchorValid: false } : d))
}

/** PR mode workspace: opens the worktree, renders the cached diff with comments, and owns the submit dialog. */
export function PrWorkspace({ prId, initialThread, inbox, layout, defaultDiffMode, onBack, onOpenPr, onDone, onStatus, onFlash }: PrWorkspaceProps & { initialThread?: AttentionThread | null }) {
  const [selectedThread, setSelectedThread] = useState<AttentionThread | null>(initialThread ?? null)
  const targetThread = selectedThread?.prId === prId ? selectedThread : null
  const targetId = targetThread ? attentionPreview(targetThread).remoteId : null
  const client = useQueryClient()
  const detail = usePrDetail(prId)
  const canJump = targetThread && detail.data?.diff ? canOpenConversation(targetThread, detail.data.diff.files, detail.data.diff.patch) : false
  const commentJump = useMemo(() => targetThread && targetId ? { path: canJump ? targetThread.comments[0]!.path : '', remoteId: targetId } : null, [targetThread, targetId, canJump])
  const worktree = useWorktree(prId, detail.data?.pr.worktreePath)
  const viewed = useServerViewed(prId, detail.data)
  const now = useNow(30_000)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [invalidIds, setInvalidIds] = useState<ReadonlySet<number>>(new Set())
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)
  const dismissed = useDismissedFindings()

  useEffect(() => {
    openPr(prId).catch((e: unknown) => onFlash(`could not open PR: ${e instanceof Error ? e.message : String(e)}`))
  }, [prId, onFlash])

  // The rich markdown view 409s until the worktree exists; let it retry once it does.
  useEffect(() => {
    if (worktree.status === 'ready') void client.invalidateQueries({ queryKey: ['file', prScope(prId)] })
  }, [client, prId, worktree.status])

  const pr = detail.data?.pr
  useEffect(() => {
    if (pr) onStatus(statusText(pr, worktree))
  }, [pr, worktree, onStatus])

  const refetchDetail = useCallback(() => client.invalidateQueries({ queryKey: keys.pr(prId) }), [client, prId])

  const actions = useMemo<PrCommentActions>(
    () => ({
      add: (comment: NewComment) => createComment(prId, comment).then(refetchDetail),
      edit: (id, body) => patchComment(prId, id, { body }).then(refetchDetail),
      remove: (id) => deleteComment(prId, id).then(refetchDetail),
      select: (id, selected) => patchComment(prId, id, { selected }).then(refetchDetail),
      keep: (findingId) => keepFinding(prId, findingId).then(refetchDetail),
      unkeep: (findingId) => unkeepFinding(prId, findingId).then(refetchDetail),
    }),
    [prId, refetchDetail],
  )

  const agentReview = detail.data?.agentReview ?? null
  const review = agentReview?.review ?? null
  const steps = useReviewProgress(review?.id ?? null)
  const findings = useMemo<AgentFinding[]>(() => (review?.status === 'ready' ? (agentReview?.findings ?? []) : []), [agentReview, review])

  const refresh = useMutation({
    mutationFn: () => refreshPr(prId),
    onSuccess: ({ headMoved, worktreeDeferred }) => {
      void refetchDetail()
      if (worktreeDeferred) onFlash('PR updated · new commits fetched; the worktree moves once the running agent review ends')
      else onFlash(headMoved ? 'PR updated · new commits, diff and worktree refreshed' : 'PR updated · comments refreshed')
    },
    onError: (e) => onFlash(`could not refresh: ${e instanceof Error ? e.message : String(e)}`),
  })

  const [runOpen, setRunOpen] = useState(false)
  const run = useMutation({
    mutationFn: (options: RunReviewOptions) => runReview(prId, options),
    onSuccess: ({ status }) => {
      setPanelOpen(false)
      setRunOpen(false)
      if (status === 'busy') onFlash('another review is running')
    },
    onError: (e) => onFlash(`could not start the review: ${e instanceof Error ? e.message : String(e)}`),
  })

  const keepMany = useMutation({
    mutationFn: async (findingIds: number[] | 'all') => {
      if (findingIds === 'all') {
        if (review) await keepAllFindings(prId, review.id)
        return
      }
      for (const id of findingIds) await keepFinding(prId, id)
    },
    onSuccess: () => {
      setPanelError(null)
      setPanelOpen(false)
      void refetchDetail()
    },
    onError: (e) => setPanelError(keepErrorMessage(e)),
  })

  const button = labelFor(review, findings.length)
  const onReviewButton = useCallback(() => {
    if (button.action === 'run') setRunOpen(true)
    else setPanelOpen(true)
  }, [button.action])

  const submit = useMutation({
    mutationFn: ({ verdict, body }: { verdict: Verdict; body: string }) =>
      submitReview(prId, {
        verdict,
        body,
        confirmApprove: verdict === 'APPROVE',
      }),
    onSuccess: (submission) => {
      setSubmitOpen(false)
      setSubmitError(null)
      setInvalidIds(new Set())
      void refetchDetail()
      if (pr) void client.invalidateQueries({ queryKey: keys.inbox(pr.repoId) })
      onFlash(`review submitted · ${verdictLabel(submission.verdict)}`)
      if (submission.verdict === 'APPROVE') onBack()
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'invalid_anchors') setInvalidIds(new Set(e.ids))
      if (e instanceof ApiError && (e.code === 'pr_closed' || e.code === 'draft_stale')) {
        void refetchDetail()
        if (e.code === 'pr_closed') {
          setSubmitOpen(false)
          onFlash(submitErrorMessage(e))
          return
        }
      }
      setSubmitError(submitErrorMessage(e))
    },
  })

  // Capture phase: when a dialog is open, `esc` closes it and must not reach the workspace's own layers.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && submitOpen) {
        e.stopPropagation()
        setSubmitOpen(false)
        setSubmitError(null)
      } else if (e.key === 'Escape' && runOpen) {
        e.stopPropagation()
        setRunOpen(false)
      } else if (e.key === 'Escape' && panelOpen) {
        e.stopPropagation()
        setPanelOpen(false)
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isEditing(e.target)) {
        e.preventDefault()
        if (pr?.state === 'open') setSubmitOpen(true)
      } else if (e.key === 'r' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && !isEditing(e.target) && !submitOpen && !runOpen) {
        // ⌘R: the browser's reload is not wanted inside the app; the agent review is.
        e.preventDefault()
        if (!button.disabled) onReviewButton()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [submitOpen, panelOpen, runOpen, button.disabled, onReviewButton, pr?.state])

  const drafts = useMemo(() => withInvalid(detail.data?.draft?.comments ?? [], invalidIds), [detail.data?.draft?.comments, invalidIds])
  const threads = useMemo(() => groupThreads((detail.data?.comments ?? []).filter((c) => c.kind !== 'discussion')), [detail.data?.comments])
  const badges = useMemo(() => countByPath([...(detail.data?.comments ?? []), ...drafts]), [detail.data?.comments, drafts])
  const prData = useMemo<PrWorkspaceData>(
    () => ({
      threads,
      drafts,
      badges,
      now,
      agentReview,
      findings,
      dismissed,
      actions,
    }),
    [threads, drafts, badges, now, agentReview, findings, dismissed, actions],
  )
  const hints = useMemo(() => submitHints({ agentReview, drafts }), [agentReview, drafts])

  if (!detail.data || !pr) {
    return (
      <main className="center">
        {detail.isPending && <p className="notice">Loading pull request…</p>}
        {detail.isError && <p className="notice">Could not load the pull request: {String(detail.error)}</p>}
      </main>
    )
  }

  if (!detail.data.diff) {
    return (
      <main className="center">
        <button type="button" className="btn btn-ghost btn-xs pr-back notice" onClick={onBack}>
          ← All PRs
        </button>
        <CommentAttention prId={prId} repoId={pr.repoId} target={targetId} comments={detail.data.comments}>
          <PrOverview detail={detail.data} onOpen={(thread) => setSelectedThread({ ...thread })} />
        </CommentAttention>
        <p className="notice">No diff cached yet; refresh the repository to navigate to files.</p>
      </main>
    )
  }

  const pendingCount = drafts.length
  const cyclePr = () => {
    const index = inbox.findIndex((row) => row.id === prId)
    const next = inbox[(index + 1) % inbox.length]
    if (next && next.id !== prId) onOpenPr(next.id)
  }

  return (
    <>
      <CommentAttention prId={prId} repoId={pr.repoId} target={targetId} comments={detail.data.comments}>
      <Workspace
        key={prId}
        scope={prScope(prId)}
        document={detail.data.diff}
        layout={layout}
        viewed={viewed}
        defaultDiffMode={defaultDiffMode}
        chatEnabled={worktree.status === 'ready'}
        overview={<PrOverview detail={detail.data} onOpen={(thread) => setSelectedThread({ ...thread })} />}
        commentJump={commentJump}
        onConversation={(thread) => setSelectedThread({ ...thread })}
        chatNotice={
          worktree.status === 'failed' ? `worktree failed: ${worktree.message}` : `worktree not ready · ${worktreeLabel(worktree)}…`
        }
        sidebarHeader={<PrTreeHeader pr={pr} submittedVerdict={pr.submittedVerdict} onBack={onBack} onDone={() => onDone(prId)} />}
        sidebarFooter={<PrTreeFooter worktree={worktree} pendingCount={pendingCount} state={pr.state} onSubmit={() => setSubmitOpen(true)} />}
        topBarLead={
          <>
            <button type="button" className="btn btn-secondary btn-xs" title="All PRs" onClick={onBack}>
              ←
            </button>
            <button type="button" className="btn btn-secondary btn-xs mono" title="Next PR in this repo" onClick={cyclePr}>
              #{pr.number} ▾
            </button>
            <span className="toppr-title">{pr.title}</span>
          </>
        }
        pr={prData}
        headerActions={
          <>
            <button
              type="button"
              className="btn btn-secondary toolbar-btn"
              title="Fetch the latest commits and comments for this PR"
              aria-label="Refresh pull request"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate()}
            >
              {refresh.isPending && <span className="spinner" aria-hidden />}
              {!refresh.isPending && <ArrowClockwise size={14} />}
            </button>
            <button
              type="button"
              className={`btn ${button.action === 'run' ? 'btn-primary' : 'btn-secondary'} toolbar-btn`}
              disabled={button.disabled || run.isPending}
              onClick={onReviewButton}
            >
              {isActive(review?.status) && <span className="spinner" aria-hidden />}
              {button.label}
            </button>
          </>
        }
        centerOverlay={(jumpTo) =>
          panelOpen &&
          agentReview && (
            <AgentReviewPanel
              detail={agentReview}
              steps={steps}
              now={now}
              busy={keepMany.isPending || run.isPending}
              error={panelError}
              onClose={() => setPanelOpen(false)}
              onJump={(finding) => {
                setPanelOpen(false)
                jumpTo(finding.path, finding.startLine ?? finding.line, finding.line)
              }}
              onKeepAll={() => keepMany.mutate('all')}
              onKeepSelected={(ids) => keepMany.mutate(ids)}
              onRerun={() => {
                setPanelOpen(false)
                setRunOpen(true)
              }}
            />
          )
        }
      />
      </CommentAttention>
      {runOpen && (
        <RunReviewModal
          prNumber={pr.number}
          previous={
            review
              ? {
                  agent: review.agent,
                  model: review.model,
                  variant: review.variant,
                }
              : null
          }
          busy={run.isPending}
          onRun={(options) => run.mutate(options)}
          onClose={() => setRunOpen(false)}
        />
      )}
      {submitOpen && (
        <SubmitModal
          prNumber={pr.number}
          pendingCount={pendingCount}
          hints={hints}
          busy={submit.isPending}
          error={submitError}
          onSubmit={(verdict, body) => submit.mutate({ verdict, body })}
          onClose={() => {
            setSubmitOpen(false)
            setSubmitError(null)
          }}
        />
      )}
    </>
  )
}
