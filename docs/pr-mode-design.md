# PR mode — server design

Decision: one SQLite `Store` port (single transaction owner, sync `node:sqlite` `DatabaseSync`),
three external ports (`PullRequestProvider`, `Worktrees`, `Events`) plus `Clock`. Commands do all
network/git I/O BEFORE a short synchronous `store.transaction(fn)`; events after commit. PR mode
and diff mode share one Hono app through a `ScopeRegistry` (`pr:<id>` or `local`) yielding
`{ DiffSource, ChatHub }`.

## 1. Domain types and ports

`server/src/domain/pullRequests.ts`
```ts
export type ProviderKind = 'github' | 'gitlab'
export type RepoRef = { provider: ProviderKind; owner: string; name: string }
export type Repo = RepoRef & { id: number; tracked: boolean; autoReview: boolean; syncedAt: string | null; syncError: string | null }
export type PrState = 'open' | 'merged' | 'closed'
/** What the provider returned. Built from its response only — never re-fetched behind it. */
export type RemotePullRequest = {
  number: number; title: string; author: string; url: string; body: string
  headRef: string; baseRef: string; headSha: string; baseSha: string
  isDraft: boolean; state: PrState; additions: number; deletions: number; changedFiles: number
  reviewRequested: boolean; createdAt: string; updatedAt: string
}
export type RemoteComment = { remoteId: string; author: string; path: string; line: number | null; startLine: number | null; side: 'LEFT' | 'RIGHT' | null; body: string; inReplyTo: string | null; createdAt: string }
export type PullRequest = RemotePullRequest & { id: number; repoId: number; addedByUser: boolean; reviewOnOpen: boolean; specRef: string | null; doneAt: string | null; worktreePath: string | null; syncedAt: string }
export type PrDiff = { prId: number; headSha: string; baseSha: string; patch: string; files: DiffFile[]; anchors: Record<string, number[]>; fetchedAt: string }
export type ReviewPayload = { verdict: Verdict; body: string; comments: { path: string; line: number; startLine: number | null; side: 'LEFT' | 'RIGHT'; body: string; inReplyTo: string | null }[] }

export type PullRequestProvider = {
  kind: ProviderKind
  cloneUrl(repo: RepoRef): string
  /** Open PRs; `reviewRequested` marks the ones assigned to me. One request per repo. */
  listOpen(repo: RepoRef): Promise<RemotePullRequest[]>
  get(repo: RepoRef, number: number): Promise<RemotePullRequest | null>
  diff(repo: RepoRef, number: number): Promise<string>
  comments(repo: RepoRef, number: number): Promise<RemoteComment[]>
  submitReview(repo: RepoRef, number: number, payload: ReviewPayload): Promise<{ remoteReviewId: string }>
  /** URL, `#n` or `n` → number, or null. Provider-specific URL grammar, so it lives here. */
  parseReference(input: string, repo: RepoRef): { repo: RepoRef; number: number } | null
}
```
`server/src/domain/review.ts` — `Verdict = 'COMMENT'|'APPROVE'|'REQUEST_CHANGES'`,
`ReviewDraft { id, prId, headSha, status: 'open'|'submitted', createdAt, submittedAt }`,
`DraftComment { id, draftId, path, line, startLine, side, body, agentBody, origin: 'agent'|'human', selected, anchorValid, inReplyTo, findingId }`,
`Submission { id, draftId, remoteReviewId, verdict, body, agentVerdict, submittedAt }`.

`server/src/domain/worktrees.ts`
```ts
export type WorktreeStage = 'cloning' | 'fetching' | 'checking-out' | 'ready'
export type WorktreeRequest = { repo: RepoRef; cloneUrl: string; number: number; headRef: string; headSha: string }
export type Worktrees = {
  create(req: WorktreeRequest, onStage: (s: WorktreeStage) => void): Promise<{ path: string }>
  remove(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  sizeBytes(path: string): Promise<number>
}
```
`server/src/domain/ports.ts`
```ts
export type Clock = () => string   // ISO now
export type Events = { emit(e: ServerEvent): void; subscribe(l: (e: ServerEvent) => void): () => void }
```
`server/src/domain/store.ts` — ONE port, grouped by aggregate (every Command writes across
aggregates in one transaction; the DB is one file).
```ts
export type Store = {
  /** Synchronous. No await inside `fn`; do external I/O before calling this. Nested = throw. */
  transaction<T>(fn: () => T): T
  repos: { list(): Repo[]; get(id: number): Repo | null; find(ref: RepoRef): Repo | null; insert(r: Omit<Repo,'id'>): Repo; update(id: number, patch: Partial<Repo>): void }
  pullRequests: { get(id: number): PullRequest | null; find(repoId: number, number: number): PullRequest | null; listByRepo(repoId: number, filter: { active?: boolean; open?: boolean }): PullRequest[]
    upsert(repoId: number, remote: RemotePullRequest, fields: Partial<Pick<PullRequest,'addedByUser'|'reviewOnOpen'|'reviewRequested'|'specRef'>>, syncedAt: string): PullRequest
    update(id: number, patch: Partial<Pick<PullRequest,'doneAt'|'worktreePath'|'state'|'reviewRequested'>>): void }
  diffs: { get(prId: number, headSha: string): PrDiff | null; insert(d: PrDiff): void }
  comments: { list(prId: number): RemoteComment[]; replace(prId: number, rows: RemoteComment[], fetchedAt: string): void }
  drafts: { open(prId: number, headSha: string): ReviewDraft | null; insert(prId: number, headSha: string, now: string): ReviewDraft; markSubmitted(id: number, now: string): void
    comments(draftId: number): DraftComment[]; insertComment(c: Omit<DraftComment,'id'>): DraftComment; updateComment(id: number, patch: Partial<Pick<DraftComment,'body'|'selected'|'anchorValid'>>): void; deleteComment(id: number): void }
  submissions: { insert(s: Omit<Submission,'id'>, payloadJson: string): Submission }
  viewed: { list(prId: number): { path: string; headSha: string }[]; set(prId: number, path: string, headSha: string | null): void }
  settings: { read(): UserSettings; write(s: UserSettings): void }
  // read models — aggregation in SQL, not loops
  views: { inbox(repoId: number): InboxRow[]; repoCounts(): RepoSummary[]; pastReviews(verdict: Verdict | null): PastReviewRow[]; worktrees(): WorktreeRow[] }
}
```
Provider selection = dispatch on `repo.provider`: application passes
`providers: Record<ProviderKind, PullRequestProvider>`.

`DiffSource` for a PR: add `{ kind: 'pr'; repo: string; number: number; headSha: string }` to
`DiffSourceRef`. `prDiffSource(diff: PrDiff, worktreePath: string | null): DiffSource` — `read()`
returns the cached patch; `fileContent()` reads from the worktree (path-escape guard) or null.

## 2. Schema — `server/src/infrastructure/sqlite/migrations/0001_init.sql`

Runner: `schema_migration(version, applied_at)`; apply each `NNNN_*.sql` not yet recorded, one
transaction each. `PRAGMA foreign_keys=ON; journal_mode=WAL`.
```sql
CREATE TABLE repo (
  id INTEGER PRIMARY KEY, provider TEXT NOT NULL, owner TEXT NOT NULL, name TEXT NOT NULL,
  tracked INTEGER NOT NULL DEFAULT 1, auto_review INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT, sync_error TEXT, UNIQUE(provider, owner, name));
CREATE TABLE pull_request (
  id INTEGER PRIMARY KEY, repo_id INTEGER NOT NULL REFERENCES repo(id), number INTEGER NOT NULL,
  title TEXT NOT NULL, author TEXT NOT NULL, url TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
  head_ref TEXT NOT NULL, base_ref TEXT NOT NULL, head_sha TEXT NOT NULL, base_sha TEXT NOT NULL,
  is_draft INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('open','merged','closed')),
  additions INTEGER NOT NULL, deletions INTEGER NOT NULL, changed_files INTEGER NOT NULL,
  review_requested INTEGER NOT NULL DEFAULT 0, added_by_user INTEGER NOT NULL DEFAULT 0,
  review_on_open INTEGER NOT NULL DEFAULT 0, spec_ref TEXT,
  done_at TEXT, worktree_path TEXT,
  remote_created_at TEXT NOT NULL, remote_updated_at TEXT NOT NULL, synced_at TEXT NOT NULL,
  UNIQUE(repo_id, number));
CREATE INDEX pr_active ON pull_request(repo_id, done_at, state);
CREATE TABLE pr_diff (pr_id INTEGER NOT NULL REFERENCES pull_request(id), head_sha TEXT NOT NULL, base_sha TEXT NOT NULL,
  patch TEXT NOT NULL, files_json TEXT NOT NULL, anchors_json TEXT NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY(pr_id, head_sha));
CREATE TABLE remote_comment (id INTEGER PRIMARY KEY, pr_id INTEGER NOT NULL REFERENCES pull_request(id), remote_id TEXT NOT NULL,
  author TEXT NOT NULL, path TEXT, line INTEGER, start_line INTEGER, side TEXT, body TEXT NOT NULL,
  in_reply_to TEXT, remote_created_at TEXT NOT NULL, fetched_at TEXT NOT NULL, UNIQUE(pr_id, remote_id));
CREATE TABLE review_draft (id INTEGER PRIMARY KEY, pr_id INTEGER NOT NULL REFERENCES pull_request(id), head_sha TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','submitted')), created_at TEXT NOT NULL, submitted_at TEXT, UNIQUE(pr_id, head_sha));
CREATE TABLE draft_comment (id INTEGER PRIMARY KEY, draft_id INTEGER NOT NULL REFERENCES review_draft(id) ON DELETE CASCADE,
  path TEXT NOT NULL, line INTEGER NOT NULL, start_line INTEGER, side TEXT NOT NULL CHECK(side IN ('LEFT','RIGHT')),
  body TEXT NOT NULL, agent_body TEXT, origin TEXT NOT NULL CHECK(origin IN ('agent','human')),
  selected INTEGER NOT NULL DEFAULT 1, anchor_valid INTEGER NOT NULL DEFAULT 1,
  in_reply_to TEXT, finding_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE submission (id INTEGER PRIMARY KEY, draft_id INTEGER NOT NULL REFERENCES review_draft(id), remote_review_id TEXT NOT NULL,
  verdict TEXT NOT NULL, body TEXT NOT NULL, agent_verdict TEXT, submitted_at TEXT NOT NULL, payload_json TEXT NOT NULL);
CREATE TABLE viewed_file (pr_id INTEGER NOT NULL REFERENCES pull_request(id), path TEXT NOT NULL, head_sha TEXT NOT NULL, PRIMARY KEY(pr_id, path));
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id = 1), json TEXT NOT NULL);
```
Phase 4 (`0002_agent_review.sql`, shape fixed now): `agent_review(id, pr_id, head_sha, status
queued|running|ready|failed, agent, model, variant, session_id, verdict, summary, error,
started_at, finished_at)`, `agent_finding(id, agent_review_id, path, line, start_line, side,
severity, body)`. "Keep in review" copies a finding into `draft_comment(origin='agent', agent_body, finding_id)`.

Deviations from SPEC §3: `review_draft` is the HUMAN's review (one per pr+sha); agent runs get
their own table. `sync_state` dropped (per-repo `synced_at`; no watermark — `gh` has no ETag
path worth it). `github_comment` → `remote_comment`. Settings = one JSON row.

## 3. Commands — `server/src/domain/commands/`

Shape: `export async function syncRepo(deps, req)`. Deps are narrow (`Pick<Store,…>` + ports).
Rule: external I/O first, ONE synchronous `store.transaction` last, events after commit. A
Command may run two short transactions when an external step (worktree removal) sits between.
Transaction helper in the SQLite store: BEGIN / COMMIT / ROLLBACK; nested = throw.

| Command | File | Responsibility · pre → post |
|---|---|---|
| `syncRepo({repoId})` | `syncRepo.ts` | `listOpen`; for new/moved PRs fetch diff (if uncached) + comments; for local open PRs absent from list `get()` each. tx: upsert, cache diff, replace comments, `synced_at`. Then release worktrees where `shouldReleaseWorktree`; tx2 null path. Emits `sync.*`. |
| `trackRepo` / `untrackRepo` | `trackRepos.ts` | insert/re-enable, or `tracked=0`. Rows and worktrees stay. |
| `openPullRequest({prId})` | `openPullRequest.ts` (`makeOpenPullRequest(deps)` closure holding `inFlight` map) | if path set and exists → `worktree.ready`. Else `worktrees.create` forwarding stages as `worktree.progress`; tx set path. |
| `resolvePullRequest({repoId, input})` | `addPullRequests.ts` | read-only: `parseReference` → `get` → `PrPreview` \| `{untrackedRepo}` \| null. |
| `addPullRequests({repoId, numbers[], reviewOnOpen})` | `addPullRequests.ts` | fetch each (404 fails whole request), diff, comments; one tx upsert `added_by_user=1`. |
| `markDone` / `reopenPullRequest` | `markDone.ts` | tx `done_at`; release worktree; tx2 null. |
| `addDraftComment` / `editDraftComment` / `deleteDraftComment` | `draftComments.ts` | tx: `findOrCreateDraft`; `anchorValid = isAnchorable(...)`; origin human. |
| `submitReview({prId, verdict, body, confirmApprove})` | `submitReview.ts` | pre: open draft for head (else `DraftStale`); APPROVE needs `confirmApprove` (`ApproveNotConfirmed`). `validateAnchors` → invalid: tx flag, throw `InvalidAnchors(ids)`. `mergeSameLineComments`. External submit. tx: submission (+`agent_verdict`), draft submitted. Emit `review.submitted`. |
| `removeWorktrees({prIds[]})` | `removeWorktrees.ts` | per id release + tx null. |
| `updateSettings(patch)` | `updateSettings.ts` | tx read-merge-write; route tells scheduler to reschedule. |
| `runReview` (phase 4) | `runReview.ts` | one run end-to-end; queue depth 1 lives in `application/reviewQueue.ts`, not in the Command. |

## 4. Actions / invariants

`domain/actions/`: `upsertPullRequests` (preserves added_by_user/done_at/worktree_path/review_on_open; sets `spec_ref = extractSpecRef(body)`), `cachePrDiff` (uses `buildDiffDocument`), `replaceComments`, `findOrCreateDraft`, `releaseWorktree(worktrees, pr): Promise<boolean>`.
`domain/review.ts`: `validateAnchors(comments, anchors): number[]`, `isAnchorable`, `mergeSameLineComments`.
`domain/pullRequests.ts`: `extractSpecRef(body)`. `domain/rules.ts`: `shouldReleaseWorktree(pr)`, `isActive(pr)`.

## 5. Routes and events

Common (`app.ts`, re-keyed on scopes; client adopts the prefix):
```
GET  /api/scopes/:scope/diff | /file?path=          scope = local | pr:<id>
GET  /api/scopes/:scope/threads  POST .../threads/line  POST .../chat/:thread  GET .../chat/:thread/history  POST .../chat/:thread/permission/:id
GET  /api/config   GET/PATCH /api/settings   GET /api/events
```
PR mode (`application/prRoutes.ts`):
```
GET  /api/repos                 RepoSummary[]
POST /api/repos  DELETE /api/repos/:id   POST /api/repos/:id/sync (202)   POST /api/sync (202)
GET  /api/repos/:id/prs         InboxRow[]
GET  /api/repos/:id/prs/open    PrPreview[]  (open, !reviewRequested, not stored)
POST /api/repos/:id/prs/resolve {input} → PrPreview | {untrackedRepo} | 404
POST /api/repos/:id/prs         {numbers, reviewOnOpen} → InboxRow[]
GET  /api/prs/:id               PrDetail {pr, diff, comments, draft, viewed}
POST /api/prs/:id/open (202)    POST|DELETE /api/prs/:id/done     PUT /api/prs/:id/viewed
POST /api/prs/:id/comments      PATCH|DELETE /api/prs/:id/comments/:cid     POST /api/prs/:id/submit
GET  /api/reviews?verdict=      PastReviewRow[] (agent: agreed|disagreed|not run)
GET  /api/worktrees             WorktreeRow[] + total     DELETE /api/worktrees {prIds}
```
`ServerEvent` additions: `sync.started|finished|failed`, `worktree.progress|ready|failed|removed`,
`review.submitted`, phase 4 `review.queued|running|ready|failed`. Chat events gain `scope`.
Domain errors → 409 `{ code, ids? }`.

## 6. One process, two modes

`application/scopes.ts`: `ScopeRegistry.resolve(id) → { source, chat }`. Diff mode:
`fixedScope('local', …)`. PR mode: `prScopes(...)` builds `prDiffSource` + `openOpencodeChat({
directory: worktreePath, title: 'owner/name#n', systemContext: body + patch })` per PR, cached;
409 until `openPullRequest` completed. All hubs forward into one `Events` bus.
`cli.ts`: no positional → PR mode; `diff <target>` → diff mode. Both open the store.

## 7. Scheduler — `application/scheduler.ts`

`setTimeout` chain; each tick syncs tracked repos sequentially; re-reads `pollInterval`
(`1|5|15|'manual'`) after each tick; `reschedule()` from `PATCH /api/settings`; `running` flag
shared with `POST /api/sync`. Fetch only — no `runReview` call site exists here.

## 8. Tests

Integration (`server/src/domain/commands/*.test.ts`) on a temp SQLite file with migrations,
`fakeProvider()`, `fakeWorktrees()`, `fixedClock` from `domain/testing/fakes.ts`: syncRepo
(new / unchanged no-refetch / head moved / merged releases worktree / manual add refreshed),
addPullRequests, openPullRequest (concurrent dedupe, stage order), markDone/reopen,
draftComments + submitReview (anchor flags, 409 paths, approve gate, stale head, happy path),
removeWorktrees, trackRepo, updateSettings.
Unit: `validateAnchors`, `isAnchorable`, `mergeSameLineComments`, `extractSpecRef`,
`shouldReleaseWorktree`, `parseReference`, gh JSON mapping on fixtures, migration idempotence.

## 9. Steps

1. Schema + store + domain types + shared DTOs (`UserSettings`). Store round-trip tests.
2. Sync: actions, `syncRepo`, `trackRepos`, fakes, tests.
3. GitHub provider over `gh` (`infrastructure/github/{ghProvider,mapping}.ts`), fixture tests.
4. Worktrees adapter (`infrastructure/gitWorktrees.ts`: clone once, `fetch origin pull/<n>/head`, `worktree add <path> <sha>`, `worktree remove --force` + prune, size). Commands `openPullRequest`, `markDone`, `removeWorktrees` + tests.
5. `addPullRequests` + `resolvePullRequest` + tests.
6. Review invariants, `findOrCreateDraft`, `draftComments`, `submitReview` + tests.
7. Scopes + app split; `prDiffSource`; `Events` bus; diff mode still works (client prefix).
8. `prRoutes.ts`, `updateSettings`, `Store.views` SQL, error mapping.
9. Scheduler, `startPrMode`, cli default, `~/.cache/review` layout.
10. Phase 4 stub: `0002_agent_review.sql`, `runReview` types, `reviewQueue.ts` skeleton.

Rejected: per-aggregate stores + unit of work; watermark sync; draft = agent run; separate
SettingsStore port; queue inside `runReview`.
