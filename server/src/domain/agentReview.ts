import type { AgentFinding, AgentReview, AgentReviewDetail, AgentReviewStatus, ModelRef, Verdict } from '@review/shared'
import { repoLabel, type PullRequest, type RepoRef } from './pullRequests.ts'
import { isAnchorable } from './review.ts'

export type { AgentFinding, AgentReview, AgentReviewDetail, AgentReviewStatus }

export type RunReviewRequest = {
  prId: number
  agent: string
  model: ModelRef | null
  variant: string | null
}

export type RunReviewResult = AgentReviewDetail

/** A finding as parsed from the payload, before it has a row. */
export type ParsedFinding = Omit<AgentFinding, 'id' | 'agentReviewId'>

export type ParsedPayload = {
  verdict: Verdict
  body: string
  findings: ParsedFinding[]
  /** Comments dropped because they did not anchor to the diff. */
  invalid: number
}

/** The agent's payload file is missing or does not follow the github-mode schema. */
export class InvalidPayload extends Error {
  constructor(detail: string) {
    super(`review payload: ${detail}`)
    this.name = 'InvalidPayload'
  }
}

const VERDICTS: readonly Verdict[] = ['COMMENT', 'REQUEST_CHANGES', 'APPROVE']
const SIDES = ['LEFT', 'RIGHT'] as const

/**
 * Parse the payload the agent wrote (`{ pr, repo, event, body, comments[] }`) into a verdict,
 * a summary and anchored findings. Comments not anchorable against `anchors` are dropped and
 * counted in `invalid`. Throws `InvalidPayload` when the shape is wrong.
 */
export function parsePayload(text: string, anchors: Record<string, number[]>): ParsedPayload {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new InvalidPayload('not valid JSON')
  }
  if (!isRecord(raw)) throw new InvalidPayload('not an object')
  if (!isVerdict(raw.event)) throw new InvalidPayload(`event must be one of ${VERDICTS.join(', ')}`)
  if (typeof raw.body !== 'string') throw new InvalidPayload('body must be a string')
  if (!Array.isArray(raw.comments)) throw new InvalidPayload('comments must be an array')

  const findings: ParsedFinding[] = []
  let invalid = 0
  raw.comments.forEach((c: unknown, i) => {
    const finding = parseComment(c, i)
    if (isAnchorable(anchors, finding)) findings.push(finding)
    else invalid++
  })
  return { verdict: raw.event, body: raw.body, findings, invalid }
}

function parseComment(c: unknown, index: number): ParsedFinding {
  const at = `comments[${index}]`
  if (!isRecord(c)) throw new InvalidPayload(`${at} is not an object`)
  if (typeof c.path !== 'string') throw new InvalidPayload(`${at}.path must be a string`)
  if (!Number.isInteger(c.line)) throw new InvalidPayload(`${at}.line must be an integer`)
  if (!SIDES.includes(c.side as (typeof SIDES)[number])) throw new InvalidPayload(`${at}.side must be LEFT or RIGHT`)
  if (typeof c.body !== 'string') throw new InvalidPayload(`${at}.body must be a string`)
  if (c.start_line !== undefined && c.start_line !== null && !Number.isInteger(c.start_line)) {
    throw new InvalidPayload(`${at}.start_line must be an integer`)
  }
  return {
    path: c.path,
    line: c.line as number,
    startLine: (c.start_line as number | null | undefined) ?? null,
    side: c.side as 'LEFT' | 'RIGHT',
    severity: severityOf(c.body),
    body: c.body,
  }
}

/** `Block:` / `Question:` / `Note:` prefix → severity; anything else is a note. */
export function severityOf(body: string): AgentFinding['severity'] {
  const m = /^\s*(block|question|note)\s*:/i.exec(body)
  return m ? (m[1].toLowerCase() as AgentFinding['severity']) : 'note'
}

/**
 * The prompt the `pr-reviewer` agent expects (same contract as the CLI). `priorComments` are
 * comments the viewer already left on the PR; `specPath` is the linked spec when it exists in
 * the worktree.
 */
export function buildReviewPrompt(pr: PullRequest, repo: RepoRef, payloadPath: string, priorComments: string[], specPath: string | null): string {
  const slug = repoLabel(repo)
  const lines = [
    `Review PR ${pr.number} in repo ${slug} in github mode.`,
    '',
    `Read it with: gh pr view ${pr.number} --repo ${slug} --json title,body,files and gh pr diff ${pr.number} --repo ${slug}`,
    'Read surrounding code before flagging anything. Do not judge from diff lines alone.',
  ]
  if (specPath) {
    lines.push('', `The PR references a spec at ${specPath}; read it before reviewing.`)
  }
  if (priorComments.length) {
    lines.push('', 'You have ALREADY left these comments on this PR. Do not repeat them; only raise new points:', ...priorComments.map((c) => `- ${c}`))
  }
  lines.push(
    '',
    `Write the review payload to ${payloadPath} using the github-mode schema. Verify every line you`,
    'cite is a line the diff actually touches. Do not submit it. Approving is not permitted:',
    'use REQUEST_CHANGES if you have any Block, otherwise COMMENT.',
    '',
    'Reply with only: the payload path, the event, and the inline comment count.',
  )
  return lines.join('\n')
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isVerdict = (v: unknown): v is Verdict => VERDICTS.includes(v as Verdict)
