import type { AgentFinding, AgentReview, AgentReviewDetail, AgentReviewStatus, ModelRef, ReviewCoverage, Verdict } from '@review/shared'
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
  /** Comments moved to the summary because their inline anchors were invalid. */
  invalid: number
  coverage: ReviewCoverage
}

/** The agent's response is missing or does not follow the review schema. */
export class InvalidPayload extends Error {
  constructor(detail: string) {
    super(`review payload: ${detail}`)
    this.name = 'InvalidPayload'
  }
}

const VERDICTS: readonly Verdict[] = ['COMMENT', 'REQUEST_CHANGES', 'APPROVE']
const SIDES = ['LEFT', 'RIGHT'] as const
const COVERAGE: readonly ReviewCoverage[] = ['complete', 'incomplete', 'unknown']

/**
 * Parse the payload the agent wrote (`{ pr, repo, event, body, comments[] }`) into a verdict,
 * a summary and anchored findings. Unanchorable comments are preserved in the summary and
 * counted in `invalid`. Throws `InvalidPayload` when the shape is wrong.
 */
export function parsePayload(text: string, anchors: Record<string, number[]>, expected?: { pr: number; repo: string; headSha: string }): ParsedPayload {
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
  if (raw.coverage !== undefined && !COVERAGE.includes(raw.coverage as ReviewCoverage)) {
    throw new InvalidPayload('coverage must be complete, incomplete, or unknown')
  }
  if (raw.commit_id !== undefined && typeof raw.commit_id !== 'string') throw new InvalidPayload('commit_id must be a string')
  if (expected) {
    if (raw.pr != null && raw.pr !== expected.pr) throw new InvalidPayload('PR does not match this run')
    if (raw.repo != null && raw.repo !== expected.repo) throw new InvalidPayload('repo does not match this run')
    if (raw.commit_id !== undefined && raw.commit_id !== expected.headSha) throw new InvalidPayload('commit_id does not match the reviewed head')
  }
  // Missing revision evidence cannot establish completeness, even if the agent claims it.
  const reported = (raw.coverage as ReviewCoverage | undefined) ?? 'unknown'
  const coverage = reported === 'complete' && !raw.commit_id ? 'unknown' : reported

  const findings: ParsedFinding[] = []
  const unanchored: string[] = []
  raw.comments.forEach((c: unknown, i) => {
    const finding = parseComment(c, i)
    if (isAnchorable(anchors, finding)) findings.push(finding)
    else {
      const range = finding.startLine === null ? `${finding.line}` : `${finding.startLine}-${finding.line}`
      unanchored.push(`- Reported location: \`${finding.path}:${range}\` (${finding.side}, unverified). ${finding.body}`)
    }
  })
  const body = unanchored.length
    ? [raw.body, 'Findings without valid inline anchors (preserved for manual review):', ...unanchored].filter(Boolean).join('\n\n')
    : raw.body
  return { verdict: raw.event, body, findings, invalid: unanchored.length, coverage }
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
export type ReviewPromptInput = {
  pr: PullRequest
  repo: RepoRef
  /** The PR's worktree; the agent's cwd, with the head commit checked out. */
  worktreePath: string
  /** Where the Command wrote the cached unified diff for this head. */
  diffPath: string
  priorComments: string[]
  specPath: string | null
}

/**
 * The reviewer's instructions. The PR is already fetched: metadata inline, the diff on disk,
 * the head checked out in the cwd, so the agent spends its budget reading code, not `gh`.
 */
export function buildReviewPrompt({ pr, repo, worktreePath, diffPath, priorComments, specPath }: ReviewPromptInput): string {
  const slug = repoLabel(repo)
  const lines = [
    `Review PR ${pr.number} in repo ${slug} in github mode.`,
    '',
    `You are running inside the PR's worktree at ${worktreePath}: the head commit ${pr.headSha} of`,
    `branch ${pr.headRef} is checked out, targeting ${pr.baseRef}. Everything is already fetched; do`,
    'not run gh to read the PR again.',
    '',
    `PR: ${pr.url}`,
    `Title: ${pr.title}`,
    `Author: ${pr.author}`,
    `The authoritative unified diff is at ${diffPath}; read it from there. Do not fetch or generate another diff.`,
    '',
    'Description:',
    pr.body.trim() ? pr.body.trim() : '(none)',
    '',
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
    '## Output contract',
    '',
    'Return one JSON object directly in your final response, without fences or surrounding prose. The app saves it:',
    '',
    '```json',
    '{',
    `  "pr": ${pr.number},`,
    `  "repo": "${slug}",`,
    `  "commit_id": "${pr.headSha}",`,
    '  "coverage": "complete",',
    '  "event": "COMMENT",',
    '  "body": "<overall feedback, unanchorable findings, and any coverage limitations>",',
    '  "comments": [',
    '    { "path": "path/in/repo.py", "line": 42, "side": "RIGHT", "body": "Question: <finding>" },',
    '    { "path": "path/in/repo.py", "start_line": 40, "line": 44, "side": "RIGHT", "body": "Block: <multi-line finding>" }',
    '  ]',
    '}',
    '```',
    '',
    'Rules:',
    '- Findings with valid diff anchors go in `comments`, one object per finding. Put unanchorable findings in `body`.',
    '- Set coverage to complete only when you reviewed the whole supplied diff with matching source context.',
    '  Use incomplete when budget or access prevents completion; name the unreviewed areas in body.',
    '  Use unknown when completeness cannot be established. An incomplete review is not a clean review.',
    '- commit_id identifies the reviewed head. Verify context matches it; never substitute another revision.',
    '- Start each comment body with `Block:`, `Question:` or `Note:`. Block = correctness, data leakage,',
    '  transaction or security problems; Question = design / naming you want answered; Note = minor.',
    '- `line` is the line number in the post-change file (`side: "RIGHT"`) and MUST be a line the diff',
    '  shows in its hunks. Numbers displayed by Read for the .diff file are PATCH FILE OFFSETS,',
    '  not source-file lines. Never copy those numbers into comments. Use the hunk header',
    '  (@@ -old,count +new,count @@) or Read the actual source file to obtain source lines.',
    '  Before returning, check each comment against the source file and the supplied hunk.',
    '  Put deletion-only findings without a RIGHT-side anchor in body.',
    '  Invalid inline anchors are preserved in the summary, not submitted as inline comments.',
    '- `event` is REQUEST_CHANGES when you have any Block, otherwise COMMENT. Never APPROVE: the human',
    '  decides that.',
    '- No findings at all? Write an empty `comments` array and one honest line in `body`.',
    '- Do not submit anything, write files, or invoke external validator scripts. The app persists and validates your response.',
  )
  return lines.join('\n')
}

/** The payload JSON embedded in an agent's reply (a ```json block, or a bare object), or null. */
export function extractInlinePayload(text: string | null): string | null {
  if (!text) return null
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const candidate = fenced ? fenced[1]! : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  if (!candidate.trim().startsWith('{')) return null
  try {
    JSON.parse(candidate)
    return candidate.trim()
  } catch {
    return null
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isVerdict = (v: unknown): v is Verdict => VERDICTS.includes(v as Verdict)
