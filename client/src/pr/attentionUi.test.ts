import { expect, it } from 'vitest'
import { attentionKind, attentionPreview, canOpenConversation, descriptionMarkdown, shortLocation, stableConversationOrder } from './attentionUi'
import type { AttentionThread, RemoteCommentRow } from '@review/shared'

const comment: RemoteCommentRow = { remoteId: '1', author: 'a', body: 'b', path: 'src/domain/a.ts', line: 10, startLine: null, side: 'RIGHT', inReplyTo: null, createdAt: '', originalLine: null, originalCommitSha: null }

it('keeps a conversation in place after its unread reply is marked read', () => {
  const base: AttentionThread = { prId: 1, prState: 'open', number: 1, title: 'PR', rootId: '1', mine: true, lastOwnCommentId: '1', hasReply: true, awaitingReply: false, unreadComments: ['1'], unreadReplies: ['1'], unreadMentions: [], comments: [comment] }
  const waiting = { ...base, rootId: '2', unreadComments: [], unreadReplies: [], awaitingReply: true }
  const initial = stableConversationOrder([waiting, base], [])
  const read = { ...base, unreadComments: [], unreadReplies: [] }
  const refreshed = stableConversationOrder([waiting, read], initial.map((t) => `${t.prId}:${t.rootId}`))
  expect(refreshed.map((t) => t.rootId)).toEqual(initial.map((t) => t.rootId))
  expect(attentionKind(refreshed[0]!)).toBe('answered')
})
it.each([10, null])('only navigates current anchors (%s)', (line) => {
  const t = { comments: [{ ...comment, line }] } as AttentionThread
  expect(canOpenConversation(t, [{ path: comment.path }])).toBe(line !== null)
  expect(canOpenConversation(t, [])).toBe(false)
})
it('shortens paths while retaining the directory and line', () => {
  expect(shortLocation(comment)).toBe('…/domain/a.ts:10')
})
it('turns raw images into safe dimensioned attachment links', () => {
  expect(descriptionMarkdown('<img width="1272" height="789" src="https://example.com/a.png">')).toContain('[▧ image · 1272 × 789 · Open](https://example.com/a.png)')
  expect(descriptionMarkdown('<img src="javascript:alert(1)">')).toBe('[image attachment]')
})

it.each([['2', 'replies'], ['3', 'mentions']] as const)('uses the latest unread comment to prioritize mentions (%s)', (mentionId, expected) => {
  const thread: AttentionThread = { prId: 1, prState: 'open', number: 1, title: 'PR', rootId: '1', mine: true,
    lastOwnCommentId: '1', hasReply: true, awaitingReply: false, unreadComments: ['2', '3'], unreadReplies: ['2', '3'], unreadMentions: [mentionId],
    comments: [comment, { ...comment, remoteId: '2' }, { ...comment, remoteId: '3' }] }
  expect(attentionKind(thread)).toBe(expected)
  expect(attentionPreview(thread).remoteId).toBe('3')
})
