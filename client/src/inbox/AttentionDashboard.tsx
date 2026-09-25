import { useState, type CSSProperties } from 'react'
import { At, ArrowBendDownRight, HourglassMedium, ArrowsInLineVertical, ArrowsOutLineVertical, Checks } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import type { AttentionThread } from '@review/shared'
import { useAttention, useSettings } from '../pr/queries'
import { markCommentsRead } from '../api'
import { ChatMarkdown } from '../chat/ChatMarkdown'
import { Avatar, FoldCaret, AttentionTag, FilterChip } from '../pr/AttentionParts'
import { attentionKind, attentionPreview, shortLocation, type AttentionKind } from '../pr/attentionUi'
import { relativeTime } from './inboxRows'

const SECTIONS = [
  { key: 'mentions', title: 'Direct mentions', hint: 'Someone @-mentioned you', icon: At },
  { key: 'replies', title: 'Unread replies', hint: 'New replies to your comments', icon: ArrowBendDownRight },
  { key: 'awaiting', title: 'Awaiting their reply', hint: 'Your comments with no answer yet', icon: HourglassMedium },
] as const

/** Compact attention inbox: sections open, PR groups folded, one preview per conversation. */
export function AttentionDashboard({ repoId, onOpen, onOpenPr }: { repoId: number; onOpen: (thread: AttentionThread) => void; onOpenPr: (id: number) => void }) {
  const query = useAttention(repoId)
  const settings = useSettings()
  const client = useQueryClient()
  const [filter, setFilter] = useState<AttentionKind | 'all'>('all')
  const [foldSections, setFoldSections] = useState<Record<string, boolean>>({})
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [expandedBodies, setExpandedBodies] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const threads = query.data ?? []
  const sections = SECTIONS.map((s) => ({ ...s, rows: threads.filter((t) => attentionKind(t) === s.key) }))
  const markRead = async (rows: AttentionThread[]) => {
    try {
      setError(null)
      await Promise.all(rows.map((t) => markCommentsRead(t.prId, t.comments.filter((c) => [...t.unreadReplies, ...t.unreadMentions].includes(c.remoteId)))))
      await client.invalidateQueries({ queryKey: ['attention', repoId] })
    } catch { setError('Could not mark conversations read. Please try again.') }
  }
  const foldAll = (open: boolean) => {
    setOpenGroups(Object.fromEntries(sections.flatMap((s) => s.rows.map((t) => [`${s.key}:${t.prId}`, open]))))
    setFoldSections({})
  }
  return <div className="attention-dashboard" style={{ '--preview-lines': settings.data?.previewLines ?? 2 } as CSSProperties}>
    <div className="attention-heading"><div><h3>Needs your attention</h3><p>Mentions and replies clear once you open them. Every PR stays in the sidebar.</p></div>
      <div className="attention-heading-actions"><button className="btn btn-ghost btn-xs" onClick={() => foldAll(false)}><ArrowsInLineVertical size={13} />Collapse all</button><button className="btn btn-ghost btn-xs" onClick={() => foldAll(true)}><ArrowsOutLineVertical size={13} />Expand all</button></div>
    </div>
    <div className="attention-filters"><FilterChip label="All" count={sections.reduce((n, s) => n + s.rows.length, 0)} active={filter === 'all'} onClick={() => setFilter('all')} />
      {sections.map((s) => <FilterChip key={s.key} label={s.key === 'awaiting' ? 'Awaiting' : s.title} count={s.rows.length} active={filter === s.key} onClick={() => setFilter(s.key)} />)}</div>
    {query.isPending && <p>Loading conversations…</p>}
    {(query.isError || error) && <p role="alert">{error ?? 'Could not load conversations.'} <button onClick={() => void query.refetch()}>Retry</button></p>}
    {sections.filter((s) => filter === 'all' || filter === s.key).map((section) => {
      const groups = new Map<number, AttentionThread[]>()
      for (const t of section.rows) groups.set(t.prId, [...(groups.get(t.prId) ?? []), t])
      const open = !foldSections[section.key]
      return <section className="attention-section" key={section.key}>
        <button className="attention-section-head" aria-expanded={open} onClick={() => setFoldSections((v) => ({ ...v, [section.key]: open }))}>
          <FoldCaret open={open} /><section.icon size={15} /><strong>{section.title}</strong><span>{section.rows.length}</span><small>{section.hint}</small>
        </button>
        {open && !groups.size && !query.isPending && <div className="attention-empty">You're caught up.</div>}
        {open && [...groups].map(([prId, group]) => {
          const key = `${section.key}:${prId}`
          const groupOpen = Boolean(openGroups[key])
          const authors = [...new Set(group.map((t) => attentionPreview(t).author))].slice(0, 2).join(', ')
          return <div className="attention-pr" key={key}>
            <div className="attention-pr-head">
              <button className="attention-pr-fold" aria-expanded={groupOpen} onClick={() => setOpenGroups((v) => ({ ...v, [key]: !groupOpen }))}>
                <FoldCaret open={groupOpen} /><span className="mono">#{group[0]!.number}</span><strong>{group[0]!.title}</strong>
                <span className="attention-group-meta">{group.length} conversation{group.length !== 1 ? 's' : ''}{!groupOpen && ` · ${authors}`}</span>
              </button>
              {section.key !== 'awaiting' && <button className="btn btn-ghost btn-xs" onClick={() => void markRead(group)}><Checks size={13} />Mark read</button>}
              <button className="btn btn-ghost btn-xs" onClick={() => onOpenPr(prId)}>Open PR</button>
            </div>
            {groupOpen && group.map((thread) => {
              const c = attentionPreview(thread)
              const bodyKey = `${prId}:${thread.rootId}`
              const own = thread.comments.find((m) => m.remoteId === thread.lastOwnCommentId)
              const canDiff = thread.comments[0]!.line !== null && Boolean(thread.comments[0]!.path)
              return <div role="button" tabIndex={0} className="attention-conversation" key={thread.rootId} onClick={() => onOpen(thread)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(thread) } }}>
                <span className={`attention-dot${section.key === 'awaiting' ? ' waiting' : ''}`} /><Avatar author={c.author} mine={section.key === 'awaiting'} />
                <div className="attention-conversation-content"><div className="attention-meta"><strong>{section.key === 'awaiting' ? 'You' : c.author}</strong>
                  <AttentionTag accent={section.key !== 'awaiting'}>{section.key === 'mentions' ? 'mentioned you' : section.key === 'replies' ? 'replied' : 'no reply'}</AttentionTag>
                  <span className="mono attention-location" title={c.path}>{shortLocation(c)}</span><time>{section.key === 'awaiting' ? `waiting ${relativeTime(c.createdAt, Date.now()).replace(/ ago$/, '')}` : new Date(c.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</time></div>
                  {section.key === 'replies' && own && <div className="attention-own-quote"><ArrowBendDownRight size={13} />You: {own.body}</div>}
                  <div className={expandedBodies[bodyKey] ? 'attention-preview expanded' : 'attention-preview'}><ChatMarkdown compact={!expandedBodies[bodyKey]} text={c.body} /></div>
                  <div className="attention-row-footer">{c.body.length > 120 * (settings.data?.previewLines ?? 2) && <button onClick={(e) => { e.stopPropagation(); setExpandedBodies((v) => ({ ...v, [bodyKey]: !v[bodyKey] })) }}>{expandedBodies[bodyKey] ? 'Show less' : 'Show more'}</button>}
                    <span>{canDiff ? 'Open in diff' : 'Open in overview'} →</span></div>
                </div>
              </div>
            })}
          </div>
        })}
      </section>
    })}
  </div>
}
