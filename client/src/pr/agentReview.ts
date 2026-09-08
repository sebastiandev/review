import type { AgentFinding, AgentReview, AgentReviewDetail, AgentReviewStatus, DraftCommentRow, Verdict } from '@review/shared'
import { lineKey } from '../diff/DiffView'
import { relativeTime } from '../inbox/inboxRows'

/** Human label for a verdict, as the Submit dialog and the panel write it. */
export const VERDICT_TEXT: Record<Verdict, string> = {
  COMMENT: 'Comment',
  APPROVE: 'Approve',
  REQUEST_CHANGES: 'Request changes',
}

/** Findings of one file keyed by the `lineKey` they anchor to. */
export function findingsByLine(findings: AgentFinding[], path: string): Record<string, AgentFinding[]> {
  const result: Record<string, AgentFinding[]> = {}
  for (const finding of findings) {
    if (finding.path !== path) continue
    ;(result[lineKey(finding.side === 'LEFT' ? 'old' : 'new', finding.line)] ??= []).push(finding)
  }
  return result
}

/** The file-header button: what it says, whether it is clickable, and what a click (or `r`) does. While running, opening shows progress. */
export type ReviewButton = { label: string; disabled: boolean; action: 'run' | 'open' }

/** `Run agent review` → `Reviewing…` → `Agent review · n` / `Review failed`, from the latest run for the head. */
export function labelFor(review: AgentReview | null, findingCount = 0): ReviewButton {
  if (!review) return { label: 'Run agent review', disabled: false, action: 'run' }
  switch (review.status) {
    case 'queued':
    case 'running':
      return { label: 'Reviewing…', disabled: false, action: 'open' }
    case 'ready':
      return { label: `Agent review · ${findingCount}`, disabled: false, action: 'open' }
    case 'failed':
      return { label: 'Review failed', disabled: false, action: 'open' }
  }
}

export const isActive = (status: AgentReviewStatus | null | undefined): boolean => status === 'queued' || status === 'running'

/** Draft comments kept from findings, by finding id. */
export function keptByFinding(drafts: DraftCommentRow[]): Record<number, DraftCommentRow> {
  const result: Record<number, DraftCommentRow> = {}
  for (const draft of drafts) if (draft.findingId !== null) result[draft.findingId] = draft
  return result
}

type HintsInput = { agentReview: AgentReviewDetail | null; drafts: DraftCommentRow[] }

/** The 12px hint under each verdict in the Submit dialog. */
export function submitHints({ agentReview, drafts }: HintsInput): Record<Verdict, string> {
  const ready = agentReview?.review.status === 'ready' ? agentReview : null
  const kept = drafts.filter((d) => d.findingId !== null).length
  return {
    COMMENT: 'Submit notes without a verdict',
    APPROVE: ready ? `Agent agreed on ${kept} of ${ready.findings.length} findings` : 'Agent not run',
    REQUEST_CHANGES: ready?.review.verdict === 'REQUEST_CHANGES' ? 'Agent suggests this' : '',
  }
}

export type AgentStatusLabel = { text: string; tone: 'running' | 'ready' | 'failed' }

/** Inbox row text: `agent reviewing…`, `agent: request changes`, `agent failed`; null when no run exists. */
export function agentStatusLabel(status: AgentReviewStatus | null, verdict: Verdict | null): AgentStatusLabel | null {
  switch (status) {
    case null:
      return null
    case 'queued':
    case 'running':
      return { text: 'agent reviewing…', tone: 'running' }
    case 'ready':
      return { text: `agent: ${verdict ? VERDICT_TEXT[verdict].toLowerCase() : 'done'}`, tone: 'ready' }
    case 'failed':
      return { text: 'agent failed', tone: 'failed' }
  }
}

/** `opencode · {agent} · {model} · {variant} · {finished} ago`; parts the run lacks are left out. */
export function provenance(review: AgentReview, now: number): string {
  const parts = ['opencode', review.agent]
  if (review.model) parts.push(review.model.modelID)
  if (review.variant) parts.push(review.variant)
  if (review.finishedAt) parts.push(relativeTime(review.finishedAt, now))
  return parts.join(' · ')
}

/** `> {body} ` on one line, ready to type after in the inline chat input. */
export function quoteForDiscussion(body: string): string {
  return `> ${body.replace(/\s+/g, ' ').trim()} `
}
