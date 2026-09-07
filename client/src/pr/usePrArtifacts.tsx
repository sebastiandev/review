import { useMemo, type ReactNode } from 'react'
import type { DraftCommentRow } from '@review/shared'
import type { NewComment } from '../api'
import { lineKey } from '../diff/DiffView'
import type { LineRef } from '../diff/LineActionButton'
import { CommentComposer } from './CommentComposer'
import { draftRepliesByRoot, draftsByLine, threadsByLine, type RemoteThread } from './comments'
import { PendingComment } from './PendingComment'
import { RemoteThreadCard } from './RemoteThreadCard'

export type PrCommentActions = {
  add: (comment: NewComment) => Promise<void>
  edit: (id: number, body: string) => Promise<void>
  remove: (id: number) => Promise<void>
  select: (id: number, selected: boolean) => Promise<void>
}

/** What the workspace needs from a PR to render comments: threads, pending drafts and the mutations. */
export type PrWorkspaceData = {
  threads: RemoteThread[]
  drafts: DraftCommentRow[]
  /** Comment-count badge per path for the file tree. */
  badges: Record<string, number>
  /** Clock for relative timestamps, refreshed by the caller. */
  now: number
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
}

const sideOf = (ref: LineRef): 'LEFT' | 'RIGHT' => (ref.side === 'old' ? 'LEFT' : 'RIGHT')

/** Line-anchored artifacts of one file keyed by `lineKey`: others' threads, your pending comments, the open composer. */
export function usePrArtifacts({ pr, path, composer, now, onCloseComposer, onAsk }: ArtifactsInput): Record<string, ReactNode> {
  return useMemo(() => {
    if (!pr || !path) return {}
    const remote = threadsByLine(pr.threads, path)
    const mine = draftsByLine(pr.drafts, path)
    const replies = draftRepliesByRoot(pr.drafts)
    const composerKey = composer && composer.path === path ? lineKey(composer.side, composer.line) : null
    const keys = new Set([...Object.keys(remote), ...Object.keys(mine), ...(composerKey ? [composerKey] : [])])

    const artifacts: Record<string, ReactNode> = {}
    for (const key of keys) {
      const threads = remote[key] ?? []
      const first = threads[0]
      artifacts[key] = (
        <>
          {first && (
            <RemoteThreadCard
              threads={threads}
              pendingReplies={replies}
              now={now}
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
  }, [pr, path, composer, now, onCloseComposer, onAsk])
}
