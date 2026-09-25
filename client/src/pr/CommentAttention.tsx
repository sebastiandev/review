import { createContext, useContext, useEffect, useRef, useCallback, useState, useMemo, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AttentionThread, RemoteCommentRow } from '@review/shared'
import { markCommentsRead } from '../api'
import { ChatMarkdown } from '../chat/ChatMarkdown'
import { useAccount, useAttention, useSettings } from './queries'
import { Avatar, AttentionTag } from './AttentionParts'
import { groupThreads } from './comments'

const Context = createContext<{
  target: string | null; seen: (c: RemoteCommentRow) => Promise<void>; threads: AttentionThread[];
  open: Record<string, boolean>; setOpen: (ids: string[], value: boolean) => void;
} | null>(null)

/** Scope read receipts and a requested comment jump to this PR; receipts survive component unmounts on the server. */
export function CommentAttention({ prId, repoId, target, comments, children }: { prId: number; repoId: number; target: string | null; comments: RemoteCommentRow[]; children: ReactNode }) {
  const client = useQueryClient()
  const attention = useAttention(repoId)
  const settings = useSettings()
  const threads = useMemo(() => {
    const known = (attention.data ?? []).filter((t) => t.prId === prId)
    const ids = new Set(known.map((t) => t.rootId))
    const others = groupThreads(comments.filter((c) => c.kind !== 'discussion')).filter((t) => !ids.has(t.root.remoteId))
    return [...known, ...others.map((t): AttentionThread => ({ prId, number: 0, title: '', rootId: t.root.remoteId, comments: [t.root, ...t.replies], mine: false, lastOwnCommentId: null, hasReply: false, awaitingReply: false, unreadMentions: [], unreadReplies: [], unreadComments: [] }))]
  }, [attention.data, prId, comments])
  const [open, setOpenState] = useState<Record<string, boolean>>({})
  const setOpen = useCallback((ids: string[], value: boolean) => setOpenState((old) => ({ ...old, ...Object.fromEntries(ids.map((id) => [id, value])) })), [])
  useEffect(() => {
    if (!attention.data || !settings.data) return
    setOpenState((old) => {
      const next = { ...old }
      for (const t of threads) if (!(t.rootId in next)) next[t.rootId] = settings.data!.threadsDefault === 'open' || (settings.data!.threadsDefault === 'unread' && Boolean(t.unreadMentions.length || t.unreadReplies.length))
      return next
    })
  }, [attention.data, settings.data, threads])
  const targetRoot = threads.find((t) => t.comments.some((c) => c.remoteId === target))?.rootId
  useEffect(() => { if (targetRoot) setOpen([targetRoot], true) }, [targetRoot, target, setOpen])
  const recorded = useRef(new Map<string, string>())
  const seen = useCallback(async (comment: RemoteCommentRow) => {
    if (recorded.current.get(comment.remoteId) === comment.body) return
    await markCommentsRead(prId, [{ remoteId: comment.remoteId, body: comment.body }])
    recorded.current.set(comment.remoteId, comment.body)
    void client.invalidateQueries({ queryKey: ['attention'] })
  }, [prId, client])
  return <Context.Provider value={{ target, seen, threads, open, setOpen }}>{children}</Context.Provider>
}

/** Shared conversation folds and unread state for gutter, file tree, cards, and toolbar. */
export function useConversations() { return useContext(Context) }

/** The comment requested by a dashboard or overview link. */
export function useCommentTarget() { return useContext(Context)?.target ?? null }

/** Mark a comment read only after it intersects the visible viewport in a foreground window. */
export function VisibleComment({ comment }: { comment: RemoteCommentRow }) {
  const context = useContext(Context)
  const ref = useRef<HTMLDivElement>(null)
  const target = context?.target
  const seen = context?.seen
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const viewer = useAccount().data?.login
  const initialUnread = useRef(context?.threads.some((t) => [...t.unreadMentions, ...t.unreadReplies].includes(comment.remoteId)))
  useEffect(() => {
    if (target === comment.remoteId) (ref.current?.closest('.review-thread-card, .overview-thread') ?? ref.current)?.scrollIntoView({ block: 'start' })
  }, [target, comment.remoteId])
  useEffect(() => {
    if (!seen || !ref.current) return
    let visible = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const record = () => {
      clearTimeout(timer)
      if (visible && document.visibilityState === 'visible') timer = setTimeout(() => { void seen(comment).then(() => setError(false), () => setError(true)) }, 600)
    }
    const observer = new IntersectionObserver(([entry]) => { visible = Boolean(entry?.isIntersecting); record() })
    observer.observe(ref.current)
    document.addEventListener('visibilitychange', record)
    return () => { observer.disconnect(); clearTimeout(timer); document.removeEventListener('visibilitychange', record) }
  }, [seen, comment, retry])
  return <div ref={ref} className={`thread-comment${target === comment.remoteId ? ' attention-target' : ''}${initialUnread.current ? ' was-unread' : ''}`}>
    <Avatar author={comment.author} mine={comment.author === viewer} />
    <div className="comment-content"><div className="comment-meta"><strong>{comment.author === viewer ? 'You' : comment.author}</strong><time>{new Date(comment.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</time>{initialUnread.current && <AttentionTag accent>new</AttentionTag>}</div>
    <ChatMarkdown text={comment.body || '*No description.*'} /></div>
    {error && <button className="btn btn-ghost btn-xs" onClick={() => setRetry((n) => n + 1)}>Could not save read status · Retry</button>}
  </div>
}
