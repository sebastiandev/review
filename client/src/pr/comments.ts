import type { DraftCommentRow, RemoteCommentRow } from '@review/shared'
import { lineKey } from '../diff/DiffView'

/** One remote conversation: the root comment and its replies, oldest first. */
export type RemoteThread = { root: RemoteCommentRow; replies: RemoteCommentRow[] }

const byCreatedAt = (a: RemoteCommentRow, b: RemoteCommentRow) => a.createdAt.localeCompare(b.createdAt)

/**
 * Groups remote comments into threads: a reply joins the thread of the comment it answers.
 * A reply whose parent is missing becomes its own root. Roots and replies are ordered by `createdAt`.
 */
export function groupThreads(comments: RemoteCommentRow[]): RemoteThread[] {
  const byId = new Map(comments.map((c) => [c.remoteId, c]))
  const threads = new Map<string, RemoteThread>()
  const sorted = [...comments].sort(byCreatedAt)
  for (const comment of sorted) {
    if (!comment.inReplyTo || !byId.has(comment.inReplyTo)) threads.set(comment.remoteId, { root: comment, replies: [] })
  }
  for (const comment of sorted) {
    if (!comment.inReplyTo) continue
    const thread = threads.get(comment.inReplyTo)
    if (thread) thread.replies.push(comment)
  }
  return [...threads.values()]
}

/** The `lineKey` a remote comment renders under, or null for PR-level comments without a line. */
export function remoteAnchorKey(comment: Pick<RemoteCommentRow, 'line' | 'side'>): string | null {
  if (comment.line === null) return null
  return lineKey(comment.side === 'LEFT' ? 'old' : 'new', comment.line)
}

/** The `lineKey` a draft comment renders under. Ranges anchor on their last line, as GitHub does. */
export function draftAnchorKey(comment: Pick<DraftCommentRow, 'line' | 'side'>): string {
  return lineKey(comment.side === 'LEFT' ? 'old' : 'new', comment.line)
}

/** Threads of one file keyed by the line they anchor to. Unanchored threads are left out. */
export function threadsByLine(threads: RemoteThread[], path: string): Record<string, RemoteThread[]> {
  const result: Record<string, RemoteThread[]> = {}
  for (const thread of threads) {
    if (thread.root.path !== path) continue
    const key = remoteAnchorKey(thread.root)
    if (!key) continue
    ;(result[key] ??= []).push(thread)
  }
  return result
}

/** Pending comments (not replies) of one file keyed by line. */
export function draftsByLine(drafts: DraftCommentRow[], path: string): Record<string, DraftCommentRow[]> {
  const result: Record<string, DraftCommentRow[]> = {}
  for (const draft of drafts) {
    if (draft.path !== path || draft.inReplyTo) continue
    ;(result[draftAnchorKey(draft)] ??= []).push(draft)
  }
  return result
}

/** Pending replies keyed by the remote id they answer. */
export function draftRepliesByRoot(drafts: DraftCommentRow[]): Record<string, DraftCommentRow[]> {
  const result: Record<string, DraftCommentRow[]> = {}
  for (const draft of drafts) {
    if (draft.inReplyTo) (result[draft.inReplyTo] ??= []).push(draft)
  }
  return result
}

/** Comments per path. The file-tree badge passes remote and pending rows together. */
export function countByPath(rows: { path: string }[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) counts[row.path] = (counts[row.path] ?? 0) + 1
  return counts
}

/** Threads of `path` whose root no longer maps onto the current diff (left on an earlier head). */
export function outdatedThreads(threads: RemoteThread[], path: string): RemoteThread[] {
  return threads.filter((t) => t.root.path === path && t.root.line === null)
}
