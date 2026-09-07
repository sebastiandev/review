import type { ModelRef, Verdict } from '@review/shared'

export type AgentReviewStatus = 'queued' | 'running' | 'ready' | 'failed'

/** One agent run over a PR head. Phase 4; persisted in `agent_review`. */
export type AgentReview = {
  id: number
  prId: number
  headSha: string
  status: AgentReviewStatus
  agent: string
  model: ModelRef | null
  variant: string | null
  sessionId: string | null
  verdict: Verdict | null
  summary: string | null
  error: string | null
  startedAt: string | null
  finishedAt: string | null
}

/** One remark the agent anchored to the diff. "Keep in review" copies it into a draft comment. */
export type AgentFinding = {
  id: number
  agentReviewId: number
  path: string
  line: number
  startLine: number | null
  side: 'LEFT' | 'RIGHT'
  severity: string
  body: string
}

export type RunReviewRequest = {
  prId: number
  agent: string
  model: ModelRef | null
  variant: string | null
}

export type RunReviewResult = { review: AgentReview; findings: AgentFinding[] }
