import { useMemo, type ReactNode } from 'react'
import type { AgentFinding, AgentReviewDetail, DraftCommentRow } from '@review/shared'
import type { NewComment } from '../api'
import { lineKey } from '../diff/DiffView'
import type { LineRef } from '../diff/LineActionButton'
import { AgentFindingCard } from './AgentFindingCard'
import { findingsByLine, keptByFinding, quoteForDiscussion } from './agentReview'
import { CommentComposer } from './CommentComposer'
import { draftRepliesByRoot, draftsByLine, threadsByLine, type RemoteThread } from './comments'
import type { DismissedFindings } from './dismissedFindings'
import { PendingComment } from './PendingComment'
import { RemoteThreadCard } from './RemoteThreadCard'

export type PrCommentActions = {
  add: (comment: NewComment) => Promise<void>
  edit: (id: number, body: string) => Promise<void>
  remove: (id: number) => Promise<void>
  select: (id: number, selected: boolean) => Promise<void>
  /** Copies a finding into the draft. */
  keep: (findingId: number) => Promise<void>
  /** Drops the draft comment kept from a finding. */
  unkeep: (findingId: number) => Promise<void>
}

/** What the workspace needs from a PR to render comments and findings: threads, pending drafts, the run, and the mutations. */
export type PrWorkspaceData = {
  threads: RemoteThread[]
  drafts: DraftCommentRow[]
  /** Comment-count badge per path for the file tree. */
  badges: Record<string, number>
  /** Clock for relative timestamps, refreshed by the caller. */
  now: number
  /** Latest agent run for the head, any status. */
  agentReview: AgentReviewDetail | null
  /** Findings of that run when it is ready; empty otherwise. */
  findings: AgentFinding[]
  dismissed: DismissedFindings
  actions: PrCommentActions
}

type ArtifactsInput = {
  pr: PrWorkspaceData | undefined
  path: string | null
  /** Line whose comment composer is open. */
  composer: LineRef | null
  now: number
  onCloseComposer: () => void
  onAsk: (ref: LineRef) => void
  /** Opens the inline chat on the finding's line with `seed` in the input. */
  onDiscuss: (ref: LineRef, seed: string) => void
}

const sideOf = (ref: LineRef): 'LEFT' | 'RIGHT' => (ref.side === 'old' ? 'LEFT' : 'RIGHT')

function lineRefOf(finding: AgentFinding): LineRef {
  return { path: finding.path, line: finding.line, side: finding.side === 'LEFT' ? 'old' : 'new', text: '' }
}

/**
 * Line-anchored artifacts of one file keyed by `lineKey`: agent findings, others' threads, your pending
 * comments, the open composer — in that order.
 */
export function usePrArtifacts({ pr, path, composer, now, onCloseComposer, onAsk, onDiscuss }: ArtifactsInput): Record<string, ReactNode> {
  return useMemo(() => {
    if (!pr || !path) return {}
    const findings = findingsByLine(pr.findings, path)
    const remote = threadsByLine(pr.threads, path)
    const mine = draftsByLine(pr.drafts, path)
    const replies = draftRepliesByRoot(pr.drafts)
    const kept = keptByFinding(pr.drafts)
    const agent = pr.agentReview?.review.agent ?? 'agent'
    const composerKey = composer && composer.path === path ? lineKey(composer.side, composer.line) : null
    const keys = new Set([
      ...Object.keys(findings),
      ...Object.keys(remote),
      ...Object.keys(mine),
      ...(composerKey ? [composerKey] : []),
    ])

    const artifacts: Record<string, ReactNode> = {}
    for (const key of keys) {
      const threads = remote[key] ?? []
      const first = threads[0]
      artifacts[key] = (
        <>
          {(findings[key] ?? []).map((finding) => {
            const isKept = finding.id in kept
            return (
              <AgentFindingCard
                key={finding.id}
                finding={finding}
                agent={agent}
                kept={isKept}
                dismissed={pr.dismissed.ids.has(finding.id)}
                onKeep={() => pr.actions.keep(finding.id)}
                onDismiss={async () => {
                  if (isKept) await pr.actions.unkeep(finding.id)
                  else pr.dismissed.set(finding.id, true)
                }}
                onDiscuss={() => onDiscuss(lineRefOf(finding), quoteForDiscussion(finding.body))}
              />
            )
          })}
          {first && (
            <RemoteThreadCard
              threads={threads}
              pendingReplies={replies}
              now={now}
              onAsk={(thread) => onDiscuss({ path, line: thread.root.line ?? thread.root.originalLine ?? 1, side: thread.root.side === 'LEFT' ? 'old' : 'new', text: '' }, 'Summarize this conversation and tell me whether my concern is addressed.')}
              onReply={(root, body) =>
                pr.actions.add({
                  path,
                  line: first.root.line ?? 0,
                  startLine: first.root.startLine,
                  side: first.root.side ?? 'RIGHT',
                  body,
                  inReplyTo: root,
                })
              }
            />
          )}
          {(mine[key] ?? []).map((comment) => (
            <PendingComment
              key={comment.id}
              comment={comment}
              reference={`${path}:${comment.line}`}
              onEdit={pr.actions.edit}
              onDelete={pr.actions.remove}
              onSelect={pr.actions.select}
            />
          ))}
          {composer && key === composerKey && (
            <CommentComposer
              reference={`${composer.path}:${composer.line}`}
              placeholder="Leave a comment on this line"
              submitLabel="Add to review"
              onSubmit={(body) => {
                void pr.actions
                  .add({ path: composer.path, line: composer.line, startLine: null, side: sideOf(composer), body })
                  .then(onCloseComposer)
              }}
              onCancel={onCloseComposer}
              onAsk={() => {
                onCloseComposer()
                onAsk(composer)
              }}
            />
          )}
        </>
      )
    }
    return artifacts
  }, [pr, path, composer, now, onCloseComposer, onAsk, onDiscuss])
}
