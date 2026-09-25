import { useState, useEffect } from 'react'
import type { AttentionThread, PrDetail } from '@review/shared'
import { FileCode } from '@phosphor-icons/react'
import { ReviewedPill } from '../inbox/ReviewedPill'
import { ChatMarkdown } from '../chat/ChatMarkdown'
import { VisibleComment, useCommentTarget, useConversations } from './CommentAttention'
import { useAttention } from './queries'
import { AttentionTag, FilterChip, FoldCaret } from './AttentionParts'
import { attentionKind, attentionPreview, shortLocation, canOpenConversation, descriptionMarkdown } from './attentionUi'

/** Rich overview with a clamped description and foldable, filtered conversations. */
export function PrOverview({ detail, onOpen }: { detail: PrDetail; onOpen: (thread: AttentionThread) => void }) {
  const attention = useAttention(detail.pr.repoId)
  const context = useConversations()
  const target = useCommentTarget()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  const [filter, setFilter] = useState('all')
  const [readError, setReadError] = useState(false)
  const threads = (attention.data ?? []).filter((t) => t.prId === detail.pr.id && t.rootId !== 'description')
    .sort((a, b) => ['mentions', 'replies', 'awaiting', 'answered'].indexOf(attentionKind(a)) - ['mentions', 'replies', 'awaiting', 'answered'].indexOf(attentionKind(b)))
  const targetRoot = threads.find((t) => t.comments.some((c) => c.remoteId === target))?.rootId
  useEffect(() => { if (targetRoot) { setExpanded((v) => ({ ...v, [targetRoot]: true })); setFilter('all') } }, [targetRoot, target])
  const needs = (t: AttentionThread) => Boolean(t.unreadMentions.length || t.unreadReplies.length)
  const filters = [
    { id: 'all', label: 'All', rows: threads }, { id: 'needs', label: 'Needs you', rows: threads.filter(needs) },
    { id: 'awaiting', label: 'Awaiting reply', rows: threads.filter((t) => !needs(t) && t.awaitingReply) },
    { id: 'answered', label: 'Answered', rows: threads.filter((t) => !needs(t) && !t.awaitingReply) },
  ]
  const matching = new Set(filters.find((f) => f.id === filter)!.rows.map((t) => t.rootId))
  const visible = threads.filter((t) => matching.has(t.rootId) || expanded[t.rootId])
  useEffect(() => {
    if (!context) return
    for (const t of threads) if (expanded[t.rootId]) for (const c of t.comments) void context.seen(c).catch(() => setReadError(true))
  }, [expanded, attention.data])
  useEffect(() => {
    if (target !== 'description') return
    setDescriptionOpen(true)
    const c = context?.threads.find((t) => t.rootId === 'description')?.comments[0]
    if (c) void context?.seen(c).catch(() => setReadError(true))
  }, [target, attention.data])
  return <article className="pr-overview">
    <span className="overline">Overview · #{detail.pr.number}</span><h3>{detail.pr.title}</h3>
    <div className="overview-meta mono"><strong>{detail.pr.author}</strong><span>{detail.pr.headRef} → {detail.pr.baseRef}</span><AttentionTag>{detail.pr.state}</AttentionTag><ReviewedPill verdict={detail.pr.submittedVerdict} /><span className="count-add">+{detail.pr.additions}</span><span className="count-del">−{detail.pr.deletions}</span></div>
    <section className={`description-card${target === 'description' ? ' targeted' : ''}`}>
      <button className="description-card-head" aria-expanded={descriptionOpen} onClick={() => setDescriptionOpen((v) => !v)}><FoldCaret open={descriptionOpen} /><strong>Description</strong><span className="mono">{detail.pr.author} · {new Date(detail.pr.createdAt).toLocaleDateString()}</span><small>{descriptionOpen ? 'Collapse' : 'Expand'}</small></button>
      <div className={`description-card-body${descriptionOpen ? ' expanded' : ''}`}><ChatMarkdown text={descriptionMarkdown(detail.pr.body) || '*No description.*'} /></div>
      {!descriptionOpen && <div className="description-fade"><button className="btn btn-secondary btn-xs" onClick={() => setDescriptionOpen(true)}>Show full description <FoldCaret open /></button></div>}
    </section>
    <div className="overview-conversation-heading"><h5>Your conversations</h5><div className="attention-filters">{filters.map((f) => <FilterChip key={f.id} label={f.label} count={f.rows.length} active={filter === f.id} onClick={() => { setFilter(f.id); setExpanded({}) }} />)}</div></div>
    {readError && <p role="alert">Could not save read status. <button onClick={() => { setReadError(false); void attention.refetch() }}>Retry</button></p>}
    {attention.isPending && <p>Loading conversations…</p>}{attention.isError && <p role="alert">Could not load conversations. <button onClick={() => void attention.refetch()}>Retry</button></p>}
    {attention.isSuccess && !visible.length && <div className="attention-empty">No conversations in this view.</div>}
    {visible.map((thread) => {
      const root = thread.comments[0]!, preview = attentionPreview(thread), kind = attentionKind(thread), open = Boolean(expanded[thread.rootId])
      const canDiff = canOpenConversation(thread, detail.diff?.files ?? [], detail.diff?.patch)
      const status = kind === 'mentions' ? 'Unread mention' : kind === 'replies' ? 'Unread reply' : kind === 'awaiting' ? 'Awaiting reply' : 'Answered'
      return <section className={`overview-thread${targetRoot === thread.rootId ? ' targeted' : ''}`} key={thread.rootId}>
        <button className="overview-thread-head" aria-expanded={open} onClick={() => setExpanded((v) => ({ ...v, [thread.rootId]: !open }))}><FoldCaret open={open} /><AttentionTag accent={needs(thread)}>{status}</AttentionTag><span className="mono" title={root.path}>{shortLocation(root)}</span>{root.path && root.line === null && <AttentionTag>outdated</AttentionTag>}<small>{thread.comments.length} comments · {new Date(preview.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</small></button>
        {!open && <div className="overview-thread-preview"><div className="overview-preview-lines"><span className="preview-author">{preview.remoteId === thread.lastOwnCommentId ? 'You' : preview.author}: </span><ChatMarkdown compact text={preview.body} /></div></div>}
        {open && <>{thread.comments.map((comment) => <VisibleComment key={comment.remoteId} comment={comment} />)}<footer className="overview-thread-footer">
          {canDiff ? <button className="btn btn-primary btn-xs" onClick={() => onOpen(thread)}><FileCode size={14} />Open in diff</button> : <span>{root.path ? detail.diff?.files.some((f) => f.path === root.path) ? 'Line changed since this comment · outdated' : 'File no longer in this diff' : 'PR discussion'}</span>}
          <a href={`${detail.pr.url}${root.kind === 'discussion' ? `#issuecomment-${root.remoteId.replace('issue:', '')}` : `#discussion_r${root.remoteId}`}`} target="_blank" rel="noreferrer">Reply on GitHub ↗</a></footer></>}
      </section>
    })}
  </article>
}
