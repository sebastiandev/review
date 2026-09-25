import { useEffect, useState } from 'react'
import { ChatTeardropDots } from '@phosphor-icons/react'
import type { DraftCommentRow } from '@review/shared'
import { useConversations, VisibleComment } from './CommentAttention'
import { AttentionTag, FoldCaret } from './AttentionParts'
import { attentionKind } from './attentionUi'
import type { RemoteThread } from './comments'

type Props = { threads: RemoteThread[]; pendingReplies: Record<string, DraftCommentRow[]>; now: number; onReply: (id: string, body: string) => Promise<void>; onAsk?: (thread: RemoteThread) => void }

/** One foldable review conversation, controlled by the same state as its gutter pill. */
function ThreadCard({ thread, pendingReplies, onReply, onAsk }: Omit<Props, 'threads' | 'now'> & { thread: RemoteThread }) {
  const context = useConversations()
  const [localOpen, setLocalOpen] = useState(false)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const id = thread.root.remoteId
  const data = context?.threads.find((t) => t.rootId === id)
  const unread = Boolean(data?.unreadMentions.length || data?.unreadReplies.length)
  const open = context?.open[id] ?? localOpen
  const comments = [thread.root, ...thread.replies]
  const targeted = comments.some((c) => c.remoteId === context?.target)
  const kind = data ? attentionKind(data) : 'answered'
  useEffect(() => {
    if (open && context) void Promise.all(comments.map(context.seen)).catch(() => setError('Could not save read status.'))
  }, [open])
  return <section className={`review-thread-card${unread ? ' unread' : ''}${targeted ? ' targeted' : ''}`}>
    <header><button className="review-thread-fold" aria-expanded={open} onClick={() => context ? context.setOpen([id], !open) : setLocalOpen(!open)}><FoldCaret open={open} /><AttentionTag accent={unread}>{kind === 'mentions' ? 'Mentions you' : kind === 'replies' ? 'New reply' : kind === 'awaiting' ? 'Awaiting reply' : 'Read'}</AttentionTag><span>{comments.length} comments</span>{!open && <span className="review-thread-preview">{comments.at(-1)!.author}: {comments.at(-1)!.body}</span>}</button>
      <button className="btn btn-ghost btn-xs" onClick={() => onAsk?.(thread)}><ChatTeardropDots size={13} />Ask agent</button></header>
    {open && <>{comments.map((c) => <VisibleComment key={c.remoteId} comment={c} />)}{(pendingReplies[id] ?? []).map((r) => <div className="thread-comment" key={r.id}>You · pending reply: {r.body}</div>)}
      <form className="thread-reply-form" onSubmit={(e) => { e.preventDefault(); if (!body.trim()) return; setBusy(true); void onReply(id, body).then(() => setBody(''), (e: Error) => setError(e.message)).finally(() => setBusy(false)) }}>
        <input aria-label="Reply in thread" placeholder="Reply…" value={body} onChange={(e) => setBody(e.target.value)} /><button className="btn btn-primary btn-xs" disabled={busy || !body.trim()}>Reply</button>
      </form></>}{error && <p role="alert">{error}</p>}
  </section>
}

/** Review conversations remain under the diff; only agent chats move into the dock. */
export function RemoteThreadCard({ threads, ...props }: Props) {
  return <>{threads.map((thread) => <ThreadCard key={thread.root.remoteId} thread={thread} {...props} />)}</>
}
