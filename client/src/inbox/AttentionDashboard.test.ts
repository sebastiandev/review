import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it } from 'vitest'
import type { AttentionThread, RemoteCommentRow } from '@review/shared'
import { AttentionDashboard } from './AttentionDashboard'

/** A conversation with the same attention reason in each PR lifecycle state. */
function thread(prState: AttentionThread['prState'], kind: 'mentions' | 'replies' | 'awaiting'): AttentionThread {
  const prId = { open: 1, merged: 2, closed: 3 }[prState]
  const root: RemoteCommentRow = {
    remoteId: 'root', author: 'me', body: 'Please explain', path: 'src/a.ts', line: 2,
    startLine: null, side: 'RIGHT', inReplyTo: null, createdAt: '2026-09-01T00:00:00Z',
    originalLine: null, originalCommitSha: null,
  }
  const reply: RemoteCommentRow = { ...root, remoteId: 'reply', author: 'alice', body: '@me explained', inReplyTo: root.remoteId }
  return {
    prId, prState, number: prId, title: `${prState} conversation`, rootId: root.remoteId,
    comments: kind === 'awaiting' ? [root] : [root, reply], mine: true, lastOwnCommentId: root.remoteId,
    hasReply: kind !== 'awaiting', awaitingReply: kind === 'awaiting',
    unreadComments: kind === 'awaiting' ? [] : [reply.remoteId],
    unreadReplies: kind === 'awaiting' ? [] : [reply.remoteId],
    unreadMentions: kind === 'mentions' ? [reply.remoteId] : [],
  }
}

it.each(['mentions', 'replies', 'awaiting'] as const)('shows only open PRs in the %s dashboard section', (kind) => {
  const client = new QueryClient()
  client.setQueryData(['attention', 1], ['open', 'merged', 'closed'].map((state) => thread(state as AttentionThread['prState'], kind)))
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(AttentionDashboard, {
    repoId: 1, onOpen: () => {}, onOpenPr: () => {},
  })))
  expect(html).toContain('open conversation')
  expect(html).not.toContain('merged conversation')
  expect(html).not.toContain('closed conversation')
  client.clear()
})
