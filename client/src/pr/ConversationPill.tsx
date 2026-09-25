import { Chats } from '@phosphor-icons/react'
import { useConversations } from './CommentAttention'

/** Same conversation marker in gutter, file header and tree; toggles the shared thread folds. */
export function ConversationPill({ path, line, side, oldLine, count, onNavigate }: { path: string; line?: number; side?: 'old' | 'new'; oldLine?: number | null; count?: number; onNavigate?: () => void }) {
  const context = useConversations()
  const threads = context?.threads.filter((t) => {
    const c = t.comments[0]!
    return c.path === path && (line === undefined || (c.line === line && (side === undefined || c.side === (side === 'old' ? 'LEFT' : 'RIGHT'))) || (oldLine != null && c.side === 'LEFT' && c.line === oldLine))
  }) ?? []
  const n = threads.length ? line === undefined ? threads.length : threads.reduce((n, t) => n + t.comments.length, 0) : count ?? 0
  if (!n) return null
  const unread = threads.some((t) => t.unreadMentions.length || t.unreadReplies.length)
  const noun = line === undefined ? 'conversations' : 'comments'
  return <button className={`conversation-pill${unread ? ' unread' : ''}`} title={`${n} ${noun}${unread ? ' · unread' : ''}`} aria-label={`${n} ${noun}${unread ? ', unread' : ''}`} onClick={(e) => { e.stopPropagation(); onNavigate?.(); context?.setOpen(threads.map((t) => t.rootId), !threads.every((t) => context.open[t.rootId])) }}><Chats size={11} />{n}</button>
}
