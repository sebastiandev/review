import { expect, it } from 'vitest'
import { attentionKind, attentionPreview, canOpenConversation, descriptionMarkdown, shortLocation } from './attentionUi'
import type { AttentionThread, RemoteCommentRow } from '@review/shared'

const comment: RemoteCommentRow = { remoteId: '1', author: 'a', body: 'b', path: 'src/domain/a.ts', line: 10, startLine: null, side: 'RIGHT', inReplyTo: null, createdAt: '', originalLine: null, originalCommitSha: null }
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
  const thread: AttentionThread = { prId: 1, number: 1, title: 'PR', rootId: '1', mine: true,
    lastOwnCommentId: '1', hasReply: true, awaitingReply: false, unreadComments: ['2', '3'], unreadReplies: ['2', '3'], unreadMentions: [mentionId],
    comments: [comment, { ...comment, remoteId: '2' }, { ...comment, remoteId: '3' }] }
  expect(attentionKind(thread)).toBe(expected)
  expect(attentionPreview(thread).remoteId).toBe('3')
})
