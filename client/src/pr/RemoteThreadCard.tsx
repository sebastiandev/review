import { useState } from 'react'
import type { DraftCommentRow } from '@review/shared'
import { relativeTime } from '../inbox/inboxRows'
import { CommentComposer } from './CommentComposer'
import type { RemoteThread } from './comments'

type RemoteThreadCardProps = {
  threads: RemoteThread[]
  /** Pending replies by the remote id they answer. */
  pendingReplies: Record<string, DraftCommentRow[]>
  now: number
  onReply: (rootRemoteId: string, body: string) => Promise<void>
}

function countComments(threads: RemoteThread[]): number {
  return threads.reduce((sum, t) => sum + 1 + t.replies.length, 0)
}

/**
 * Others' comments on one line: folded to a `{n} comments from others · {author}` pill, expanded to a
 * bordered card of threads with their replies and a reply composer per thread.
 */
export function RemoteThreadCard({ threads, pendingReplies, now, onReply }: RemoteThreadCardProps) {
  const [open, setOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const first = threads[0]
  if (!first) return null
  const count = countComments(threads)
  const noun = count === 1 ? 'comment' : 'comments'

  const reply = async (rootRemoteId: string, body: string) => {
    setBusy(true)
    try {
      await onReply(rootRemoteId, body)
      setReplyTo(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="others">
      <button type="button" className="others-pill" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? `Hide ${count} ${noun} from others` : `${count} ${noun} from others · ${first.root.author}`}
      </button>
      {open && (
        <div className="others-card">
          {threads.map((thread) => (
            <div key={thread.root.remoteId} className="thread">
              {[thread.root, ...thread.replies].map((c) => (
                <div key={c.remoteId} className="thread-comment">
                  <div className="artifact-ref">
                    {c.author} · {relativeTime(c.createdAt, now)}
                  </div>
                  <div className="artifact-body">{c.body}</div>
                </div>
              ))}
              {(pendingReplies[thread.root.remoteId] ?? []).map((d) => (
                <div key={d.id} className="thread-comment thread-pending">
                  <div className="artifact-ref">You · pending reply</div>
                  <div className="artifact-body">{d.body}</div>
                </div>
              ))}
              {replyTo === thread.root.remoteId ? (
                <CommentComposer
                  reference={`reply to ${thread.root.author}`}
                  placeholder="Reply in thread…"
                  submitLabel="Reply"
                  busy={busy}
                  onSubmit={(body) => void reply(thread.root.remoteId, body)}
                  onCancel={() => setReplyTo(null)}
                />
              ) : (
                <button type="button" className="btn btn-secondary btn-xs thread-reply" onClick={() => setReplyTo(thread.root.remoteId)}>
                  Reply
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
