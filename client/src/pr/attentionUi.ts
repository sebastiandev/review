import type { AttentionThread, RemoteCommentRow } from '@review/shared'
import { parsePatch } from '../diff/parsePatch'

export type AttentionKind = 'mentions' | 'replies' | 'awaiting' | 'answered'

/** Exclusive dashboard membership: a latest unread mention wins over a reply. */
export function attentionKind(thread: AttentionThread): AttentionKind {
  const unread = new Set(thread.unreadComments ?? [...thread.unreadMentions, ...thread.unreadReplies])
  const last = thread.comments.filter((c) => unread.has(c.remoteId)).at(-1)
  if (last && thread.unreadMentions.includes(last.remoteId)) return 'mentions'
  if (thread.unreadReplies.length) return 'replies'
  return thread.awaitingReply ? 'awaiting' : 'answered'
}

/** Latest unread message, or the latest own comment when waiting. */
export function attentionPreview(thread: AttentionThread): RemoteCommentRow {
  const kind = attentionKind(thread)
  if (kind === 'awaiting') return thread.comments.find((c) => c.remoteId === thread.lastOwnCommentId) ?? thread.comments.at(-1)!
  if (kind === 'answered') return thread.comments.at(-1)!
  const unread = new Set(thread.unreadComments ?? [...thread.unreadMentions, ...thread.unreadReplies])
  return thread.comments.filter((c) => unread.has(c.remoteId)).at(-1)
    ?? thread.comments.find((c) => c.remoteId === thread.lastOwnCommentId)
    ?? thread.comments.at(-1)!
}

/** Compact directory/basename reference, preserving the full path in the caller's tooltip. */
export function shortLocation(comment: RemoteCommentRow): string {
  if (!comment.path) return comment.remoteId === 'description' ? 'PR description' : 'PR discussion'
  const parts = comment.path.split('/')
  const path = `${parts.length > 2 ? '…/' : ''}${parts.slice(-2).join('/')}`
  const line = comment.line ?? comment.originalLine
  return `${path}${line ? `:${line}` : ''}`
}

/** The source location must be both current and represented by the cached diff. */
export function canOpenConversation(thread: AttentionThread, files: { path: string }[], patch?: string): boolean {
  const c = thread.comments[0]!
  if (c.line === null || !files.some((f) => f.path === c.path)) return false
  return patch === undefined || Boolean(parsePatch(patch).find((f) => f.path === c.path)?.hunks.some((h) => h.lines.some((line) => (c.side === 'LEFT' ? line.oldLine : line.newLine) === c.line)))
}

/** Turn raw image tags into safe attachment links; the markdown renderer never injects HTML. */
export function descriptionMarkdown(body: string): string {
  return body.replace(/<img\b[^>]*>/gi, (tag) => {
    const attr = (name: string) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1]
    const src = attr('src')
    return src && /^https?:\/\//.test(src)
      ? `[▧ image${attr('width') && attr('height') ? ` · ${attr('width')} × ${attr('height')}` : ''} · Open](${src.replace(/\)/g, '%29')})`
      : '[image attachment]'
  })
}
