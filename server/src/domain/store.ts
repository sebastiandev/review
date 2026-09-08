import type { InboxRow, PastReviewRow, PrDetail, RepoSummary, UserSettings, Verdict, WorktreeRow } from '@review/shared'
import type { AgentFinding, AgentReview, AgentReviewDetail, AgentReviewStatus, ParsedFinding } from './agentReview.ts'
import type { PrDiff, PullRequest, RemoteComment, RemotePullRequest, Repo, RepoRef } from './pullRequests.ts'
import type { DraftComment, ReviewDraft, Submission } from './review.ts'

/**
 * The one persistence port. Grouped by aggregate; every Command writes across aggregates in
 * one transaction. Implemented in infrastructure/sqlite.
 */
export type Store = {
  /** Synchronous. No await inside `fn`; do external I/O before calling this. Nested = throw. */
  transaction<T>(fn: () => T): T
  repos: {
    list(): Repo[]
    get(id: number): Repo | null
    find(ref: RepoRef): Repo | null
    insert(r: Omit<Repo, 'id'>): Repo
    update(id: number, patch: Partial<Omit<Repo, 'id'>>): void
  }
  pullRequests: {
    get(id: number): PullRequest | null
    find(repoId: number, number: number): PullRequest | null
    /** `active` = not marked done; `open` = remote state is open. */
    listByRepo(repoId: number, filter: { active?: boolean; open?: boolean }): PullRequest[]
    /** Every PR, across repos, that still holds a worktree path. */
    listWithWorktree(): PullRequest[]
    /** Insert or refresh the remote fields. Local fields not in `fields` are preserved. */
    upsert(
      repoId: number,
      remote: RemotePullRequest,
      fields: Partial<Pick<PullRequest, 'addedByUser' | 'reviewOnOpen' | 'reviewRequested' | 'specRef'>>,
      syncedAt: string,
    ): PullRequest
    update(id: number, patch: Partial<Pick<PullRequest, 'doneAt' | 'worktreePath' | 'state' | 'reviewRequested'>>): void
  }
  diffs: {
    get(prId: number, headSha: string): PrDiff | null
    insert(d: PrDiff): void
  }
  comments: {
    list(prId: number): RemoteComment[]
    replace(prId: number, rows: RemoteComment[], fetchedAt: string): void
  }
  drafts: {
    open(prId: number, headSha: string): ReviewDraft | null
    /** The open draft for the PR regardless of head, if any. */
    latestOpen(prId: number): ReviewDraft | null
    insert(prId: number, headSha: string, now: string): ReviewDraft
    markSubmitted(id: number, now: string): void
    comments(draftId: number): DraftComment[]
    getComment(id: number): DraftComment | null
    /** The comment in `draftId` kept from finding `findingId`, if any. */
    commentForFinding(draftId: number, findingId: number): DraftComment | null
    insertComment(c: Omit<DraftComment, 'id'>, now: string): DraftComment
    updateComment(id: number, patch: Partial<Pick<DraftComment, 'body' | 'selected' | 'anchorValid'>>, now: string): void
    deleteComment(id: number): void
  }
  submissions: {
    insert(s: Omit<Submission, 'id'>, payloadJson: string): Submission
  }
  agentReviews: {
    get(id: number): AgentReview | null
    /** Newest run for the head; `status` narrows it (e.g. the latest `ready` one). */
    latest(prId: number, headSha: string, status: AgentReviewStatus | null): AgentReview | null
    /** The queued or running run for the PR, any head; null when the agent is not working on it. */
    active(prId: number): AgentReview | null
    /** Every queued or running run, across PRs. */
    listActive(): AgentReview[]
    /** Every run for the PR with its findings, newest first. */
    listForPr(prId: number): AgentReviewDetail[]
    insert(r: Pick<AgentReview, 'prId' | 'headSha' | 'agent' | 'model' | 'variant'>): AgentReview
    update(
      id: number,
      patch: Partial<Pick<AgentReview, 'status' | 'sessionId' | 'verdict' | 'summary' | 'error' | 'invalidAnchorCount' | 'startedAt' | 'finishedAt'>>,
    ): void
    findings(reviewId: number): AgentFinding[]
    getFinding(id: number): AgentFinding | null
    insertFindings(reviewId: number, rows: ParsedFinding[]): AgentFinding[]
  }
  viewed: {
    list(prId: number): { path: string; headSha: string }[]
    /** `null` clears the mark. */
    set(prId: number, path: string, headSha: string | null): void
  }
  settings: {
    read(): UserSettings
    write(s: UserSettings): void
  }
  /** Read models. Aggregation happens in SQL. */
  views: {
    inbox(repoId: number): InboxRow[]
    /** Everything the PR screen needs, or null for an unknown id. */
    prDetail(prId: number): PrDetail | null
    repoCounts(): RepoSummary[]
    pastReviews(verdict: Verdict | null): PastReviewRow[]
    /** Size is measured by the worktree adapter, not stored. */
    worktrees(): Omit<WorktreeRow, 'sizeBytes'>[]
  }
}
