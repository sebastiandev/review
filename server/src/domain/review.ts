import type { Verdict } from '@review/shared'
import type { ReviewPayload } from './pullRequests.ts'

export type { Verdict }

/** The human's review in progress. One per PR and head sha. */
export type ReviewDraft = {
  id: number
  prId: number
  headSha: string
  status: 'open' | 'submitted'
  createdAt: string
  submittedAt: string | null
}

export type DraftComment = {
  id: number
  draftId: number
  path: string
  line: number
  startLine: number | null
  side: 'LEFT' | 'RIGHT'
  body: string
  /** The agent's original text when this comment was kept from a finding. */
  agentBody: string | null
  origin: 'agent' | 'human'
  selected: boolean
  anchorValid: boolean
  inReplyTo: string | null
  findingId: number | null
}

export type Submission = {
  id: number
  prId: number
  headSha: string
  /** The draft it was built from; null for reviews submitted on GitHub directly. */
  draftId: number | null
  remoteReviewId: string
  /** `app` = submitted from here; `remote` = found on the provider during sync. */
  source: 'app' | 'remote'
  verdict: Verdict
  body: string
  agentVerdict: Verdict | null
  submittedAt: string
}

export type Anchor = Pick<DraftComment, 'path' | 'line' | 'startLine' | 'side'>

/**
 * Whether a comment can be attached to the diff. RIGHT side: every line of the range must be
 * an anchorable (new-side) line of the file. LEFT side: the anchors only cover the new side,
 * so the file merely has to be in the diff.
 */
export function isAnchorable(anchors: Record<string, number[]>, anchor: Anchor): boolean {
  const lines = anchors[anchor.path]
  if (!lines) return false
  if (anchor.side === 'LEFT') return true
  const from = anchor.startLine ?? anchor.line
  for (let n = from; n <= anchor.line; n++) if (!lines.includes(n)) return false
  return true
}

/** Ids of the comments that are not anchorable against `anchors`. */
export function validateAnchors(comments: DraftComment[], anchors: Record<string, number[]>): number[] {
  return comments.filter((c) => !isAnchorable(anchors, c)).map((c) => c.id)
}

/**
 * Collapse comments that target the same location into one payload comment, bodies joined
 * by a blank line. Replies never merge with each other or with top-level comments.
 * Order of first appearance is preserved.
 */
export function mergeSameLineComments(comments: DraftComment[]): ReviewPayload['comments'] {
  const out: ReviewPayload['comments'] = []
  const byLocation = new Map<string, ReviewPayload['comments'][number]>()
  for (const c of comments) {
    const entry = { path: c.path, line: c.line, startLine: c.startLine, side: c.side, body: c.body, inReplyTo: c.inReplyTo }
    if (c.inReplyTo !== null) {
      out.push(entry)
      continue
    }
    const key = `${c.path}\0${c.side}\0${c.startLine ?? ''}\0${c.line}`
    const existing = byLocation.get(key)
    if (existing) existing.body = `${existing.body}\n\n${c.body}`
    else {
      byLocation.set(key, entry)
      out.push(entry)
    }
  }
  return out
}
