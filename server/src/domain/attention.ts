import type { AttentionThread } from '@review/shared'
import type { PullRequest, RemoteComment } from './pullRequests.ts'

/** Match an explicit GitHub username token, not a prefix or a team mention. */
export function mentionsUser(body: string, viewer: string): boolean {
  return [...body.matchAll(/(^|[^\w@])@([a-z0-9]+(?:-[a-z0-9]+)*)(?![\w/-])/gi)]
    .some((m) => m[2]!.toLowerCase() === viewer.toLowerCase())
}

/** Group review replies by root; general comments form the PR discussion. Preconditions: comments belong to pr. Postconditions: no mutation. */
export function attentionThreads(pr: PullRequest, rows: { comment: RemoteComment; seen: boolean }[], viewer: string): AttentionThread[] {
  const byId = new Map(rows.map((r) => [r.comment.remoteId, r.comment]))
  const groups = new Map<string, typeof rows>()
  for (const row of rows) {
    let root = row.comment
    const visited = new Set<string>()
    while (root.inReplyTo && byId.has(root.inReplyTo) && !visited.has(root.remoteId)) {
      visited.add(root.remoteId)
      root = byId.get(root.inReplyTo)!
    }
    const id = root.remoteId === 'description' ? 'description' : root.kind === 'discussion' ? 'discussion' : root.remoteId
    const group = groups.get(id) ?? []
    group.push(row)
    groups.set(id, group)
  }
  return [...groups].flatMap(([rootId, group]) => {
    group.sort((a, b) => a.comment.createdAt.localeCompare(b.comment.createdAt))
    const mine = (c: RemoteComment) => c.author.toLowerCase() === viewer.toLowerCase()
    if (rootId === 'description' && mine(group[0]!.comment)) return []
    const lastMine = group.reduce((last, r, index) => mine(r.comment) ? index : last, -1)
    const responses = group.slice(lastMine + 1).filter((r) => !mine(r.comment))
    const unreadMentions = group.filter((r) => !r.seen && !mine(r.comment) && mentionsUser(r.comment.body, viewer)).map((r) => r.comment.remoteId)
    if (lastMine < 0 && !group.some((r) => !mine(r.comment) && mentionsUser(r.comment.body, viewer))) return []
    return [{
      prId: pr.id, number: pr.number, title: pr.title, rootId,
      comments: group.map((r) => r.comment), mine: lastMine >= 0,
      lastOwnCommentId: lastMine >= 0 ? group[lastMine]!.comment.remoteId : null,
      hasReply: lastMine >= 0 && responses.length > 0,
      awaitingReply: rootId !== 'description' && lastMine >= 0 && responses.length === 0 && pr.state === 'open',
      unreadReplies: lastMine < 0 ? [] : responses.filter((r) => !r.seen).map((r) => r.comment.remoteId),
      unreadMentions,
      unreadComments: group.filter((r) => !r.seen && !mine(r.comment)).map((r) => r.comment.remoteId),
    }]
  })
}
