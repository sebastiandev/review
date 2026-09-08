import type {
  AccountInfo,
  AccountRepo,
  AppConfig,
  ChatPart,
  ChatSendRequest,
  ChatThreadRef,
  DiffDocument,
  DeviceCodeInfo,
  DiffSelection,
  DraftCommentRow,
  InboxRow,
  ModelRef,
  PastReviewRow,
  PermissionReply,
  PrDetail,
  PrPreview,
  RepoSummary,
  UserSettings,
  Verdict,
  WorktreeRow,
} from '@review/shared'

export type FileContent = { path: string; content: string }

/** A non-2xx reply. `code` and `ids` come from the server's `{code, ids?}` error body when it sent one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly ids: number[] = [],
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function fail(url: string, init: RequestInit | undefined, res: Response): Promise<never> {
  const body: unknown = await res.json().catch(() => null)
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const code = typeof record.code === 'string' ? record.code : null
  const ids = Array.isArray(record.ids) ? record.ids.filter((id): id is number => typeof id === 'number') : []
  throw new ApiError(res.status, code, ids, `${init?.method ?? 'GET'} ${url} -> ${res.status}${code ? ` (${code})` : ''}`)
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) return fail(url, init, res)
  return (await res.json()) as T
}

/** For routes that answer 202/204 with no body. */
async function requestVoid(url: string, init?: RequestInit): Promise<void> {
  const res = await fetch(url, init)
  if (!res.ok) return fail(url, init, res)
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

/** The scope diff mode serves. PR mode uses `pr:<id>`. */
export const LOCAL_SCOPE = 'local'

/** Scope id of a stored PR. Mirrors the server's `prScopeId`. */
export const prScope = (prId: number) => `pr:${prId}`

/** Scope ids contain `:`; they travel as one path segment. */
const scopePath = (scope: string) => `/api/scopes/${encodeURIComponent(scope)}`

/** Thread ids contain `/` and `:`; they travel as one path segment. */
const threadPath = (scope: string, thread: string) => `${scopePath(scope)}/chat/${encodeURIComponent(thread)}`

/** The diff the scope is reviewing. */
export function fetchDiff(scope = LOCAL_SCOPE): Promise<DiffDocument> {
  return requestJson<DiffDocument>(`${scopePath(scope)}/diff`)
}

/** Full new-side content of one changed file. Rejects with a 404 when the source cannot provide it (patch files). */
export function fetchFile(path: string, scope = LOCAL_SCOPE): Promise<FileContent> {
  return requestJson<FileContent>(`${scopePath(scope)}/file?path=${encodeURIComponent(path)}`)
}

/** Agents, models and commands opencode offers, plus server settings. */
export function fetchConfig(): Promise<AppConfig> {
  return requestJson<AppConfig>('/api/config')
}

/** Persisted user settings alone; cheaper than `/api/config`, which also asks opencode. */
export function fetchSettings(): Promise<UserSettings> {
  return requestJson<UserSettings>('/api/settings')
}

/** Merges a partial change into the persisted settings; the server reschedules polling. */
export function patchSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  return requestJson<UserSettings>('/api/settings', jsonInit('PATCH', patch))
}

/** Every thread the server knows: `dock` plus the line threads created so far. */
export function fetchThreads(scope = LOCAL_SCOPE): Promise<ChatThreadRef[]> {
  return requestJson<ChatThreadRef[]>(`${scopePath(scope)}/threads`)
}

/** The thread anchored to `anchor`'s start line, created on first use. */
export function createLineThread(anchor: DiffSelection, scope = LOCAL_SCOPE): Promise<ChatThreadRef> {
  return requestJson<ChatThreadRef>(`${scopePath(scope)}/threads/line`, jsonInit('POST', anchor))
}

/** Chat parts already produced in one thread. */
export function fetchChatHistory(thread: string, scope = LOCAL_SCOPE): Promise<ChatPart[]> {
  return requestJson<ChatPart[]>(`${threadPath(scope, thread)}/history`)
}

/** Sends a user turn to one thread; the reply streams over /api/events. */
export function sendChat(thread: string, body: ChatSendRequest, scope = LOCAL_SCOPE): Promise<void> {
  return requestVoid(threadPath(scope, thread), jsonInit('POST', body))
}

/** Stops the agent's current turn in one thread (Esc in the CLI). */
export function abortChat(thread: string, scope = LOCAL_SCOPE): Promise<void> {
  return requestVoid(`${threadPath(scope, thread)}/abort`, { method: 'POST' })
}

/** Answers a pending permission ask in one thread. */
export function replyPermission(thread: string, id: string, response: PermissionReply, scope = LOCAL_SCOPE): Promise<void> {
  return requestVoid(`${threadPath(scope, thread)}/permission/${encodeURIComponent(id)}`, jsonInit('POST', { response }))
}

// ── PR mode ──────────────────────────────────────────────────────────────

/** Tracked repos with inbox counts. Fails (404 or non-JSON) when the server was started with `review diff`. */
export function fetchRepos(): Promise<RepoSummary[]> {
  return requestJson<RepoSummary[]>('/api/repos')
}

export type TrackRepoRequest = { provider: 'github' | 'gitlab'; owner: string; name: string; autoReview: boolean }

/** Starts following a repo (or re-enables an untracked one). */
export function trackRepo(req: TrackRepoRequest): Promise<RepoSummary> {
  return requestJson<RepoSummary>('/api/repos', jsonInit('POST', req))
}

export function patchRepo(repoId: number, patch: { autoReview?: boolean }): Promise<RepoSummary> {
  return requestJson<RepoSummary>(`/api/repos/${repoId}`, jsonInit('PATCH', patch))
}

/** Stops following a repo; its rows and worktrees stay. */
export function untrackRepo(repoId: number): Promise<void> {
  return requestVoid(`/api/repos/${repoId}`, { method: 'DELETE' })
}

/** The connected provider account. */
export function fetchAccount(): Promise<AccountInfo> {
  return requestJson<AccountInfo>('/api/account')
}

/** Borrows the token the gh CLI is logged in with. */
export function connectWithCli(): Promise<AccountInfo> {
  return requestJson<AccountInfo>('/api/account/connect', jsonInit('POST', { via: 'cli' }))
}

/** Starts the OAuth device flow; the outcome arrives as `account.connected` / `account.failed`. */
export function startDeviceFlow(): Promise<DeviceCodeInfo> {
  return requestJson<DeviceCodeInfo>('/api/account/connect', jsonInit('POST', { via: 'device' }))
}

export function cancelDeviceFlow(): Promise<void> {
  return requestVoid('/api/account/connect', { method: 'DELETE' })
}

export function disconnectAccount(): Promise<void> {
  return requestVoid('/api/account', { method: 'DELETE' })
}

/** Repos on the connected account with open-PR counts, tracked or not. */
export function fetchAccountRepos(): Promise<AccountRepo[]> {
  return requestJson<AccountRepo[]>('/api/account/repos')
}

/** Asks the scheduler to sync one repo now; completion arrives as `sync.finished`. */
export function syncRepo(repoId: number): Promise<void> {
  return requestVoid(`/api/repos/${repoId}/sync`, { method: 'POST' })
}

/** Active PRs of one repo. */
export function fetchInbox(repoId: number): Promise<InboxRow[]> {
  return requestJson<InboxRow[]>(`/api/repos/${repoId}/prs`)
}

/** Open PRs not requested from me and not stored yet: the add-dialog picker. */
export function fetchOpenPrs(repoId: number): Promise<PrPreview[]> {
  return requestJson<PrPreview[]>(`/api/repos/${repoId}/prs/open`)
}

export type ResolveResult = { repoId: number; preview: PrPreview } | { untrackedRepo: { provider: string; owner: string; name: string } }

/** Turns a URL, `#n` or bare number into a PR preview. Rejects with a 404 `ApiError` when nothing matches. */
export function resolvePr(repoId: number, input: string): Promise<ResolveResult> {
  return requestJson<ResolveResult>(`/api/repos/${repoId}/prs/resolve`, jsonInit('POST', { input }))
}

/** Adds PRs to the inbox by number; returns their inbox rows. */
export function addPrs(repoId: number, numbers: number[], reviewOnOpen: boolean): Promise<InboxRow[]> {
  return requestJson<InboxRow[]>(`/api/repos/${repoId}/prs`, jsonInit('POST', { numbers, reviewOnOpen }))
}

/** Everything the PR screen needs: row, cached diff, remote comments, open draft, viewed marks. */
export function fetchPrDetail(prId: number): Promise<PrDetail> {
  return requestJson<PrDetail>(`/api/prs/${prId}`)
}

/** Starts the worktree checkout; progress arrives as `worktree.*` events. */
export function openPr(prId: number): Promise<void> {
  return requestVoid(`/api/prs/${prId}/open`, { method: 'POST' })
}

export function markPrDone(prId: number): Promise<void> {
  return requestVoid(`/api/prs/${prId}/done`, { method: 'POST' })
}

/** Fetches the PR now: row, comments, and a moved head's diff + worktree checkout. */
export function refreshPr(prId: number): Promise<{ headMoved: boolean }> {
  return requestJson<{ headMoved: boolean }>(`/api/prs/${prId}/refresh`, { method: 'POST' })
}

/** Puts a done PR back in the inbox. */
export function reopenPr(prId: number): Promise<void> {
  return requestVoid(`/api/prs/${prId}/done`, { method: 'DELETE' })
}

/** Submitted reviews, newest first; `verdict` narrows them. */
export function fetchPastReviews(verdict: Verdict | null): Promise<PastReviewRow[]> {
  return requestJson<PastReviewRow[]>(verdict ? `/api/reviews?verdict=${verdict}` : '/api/reviews')
}

export type WorktreeInventory = { rows: WorktreeRow[]; totalBytes: number }

/** Every PR worktree on disk with its size. */
export function fetchWorktrees(): Promise<WorktreeInventory> {
  return requestJson<WorktreeInventory>('/api/worktrees')
}

/** Removes the worktrees of the given PRs; returns the ids that had one. */
export function removeWorktrees(prIds: number[]): Promise<{ removed: number[] }> {
  return requestJson<{ removed: number[] }>('/api/worktrees', jsonInit('DELETE', { prIds }))
}

/** Removes every worktree whose PR is merged or closed. */
export function removeMergedWorktrees(): Promise<{ removed: number[] }> {
  return requestJson<{ removed: number[] }>('/api/worktrees/merged', { method: 'DELETE' })
}

export type ViewedMark = { path: string; headSha: string }

/** Records (headSha) or clears (null) a viewed mark; returns every mark of the PR. */
export function putViewed(prId: number, path: string, headSha: string | null): Promise<ViewedMark[]> {
  return requestJson<ViewedMark[]>(`/api/prs/${prId}/viewed`, jsonInit('PUT', { path, headSha }))
}

export type NewComment = {
  path: string
  line: number
  startLine: number | null
  side: 'LEFT' | 'RIGHT'
  body: string
  inReplyTo?: string | null
}

export function createComment(prId: number, comment: NewComment): Promise<DraftCommentRow> {
  return requestJson<DraftCommentRow>(`/api/prs/${prId}/comments`, jsonInit('POST', comment))
}

export function patchComment(prId: number, commentId: number, patch: { body?: string; selected?: boolean }): Promise<DraftCommentRow> {
  return requestJson<DraftCommentRow>(`/api/prs/${prId}/comments/${commentId}`, jsonInit('PATCH', patch))
}

export function deleteComment(prId: number, commentId: number): Promise<void> {
  return requestVoid(`/api/prs/${prId}/comments/${commentId}`, { method: 'DELETE' })
}

export type Submission = { id: number; draftId: number; remoteReviewId: string; verdict: Verdict; body: string; submittedAt: string }

/** Pushes the open draft. 409 codes: `invalid_anchors` (with ids), `draft_stale`, `approve_not_confirmed`. */
export function submitReview(prId: number, body: { verdict: Verdict; body: string; confirmApprove: boolean }): Promise<Submission> {
  return requestJson<Submission>(`/api/prs/${prId}/submit`, jsonInit('POST', body))
}

// ── Agent review ─────────────────────────────────────────────────────────

/** Who runs the review. `model: null` lets opencode pick; `variant: null` is the model's default. */
export type RunReviewOptions = { agent: string; model: ModelRef | null; variant: string | null }

/** Starts an agent run; `busy` while another run is in progress. Progress arrives as `review.*` events. */
export function runReview(prId: number, options: RunReviewOptions): Promise<{ status: 'queued' | 'busy' }> {
  return requestJson<{ status: 'queued' | 'busy' }>(`/api/prs/${prId}/review`, jsonInit('POST', options))
}

/** Copies one finding into the draft; idempotent. 409 `draft_stale` when the run is for an older head. */
export function keepFinding(prId: number, findingId: number): Promise<DraftCommentRow> {
  return requestJson<DraftCommentRow>(`/api/prs/${prId}/findings/${findingId}/keep`, { method: 'POST' })
}

/** Drops the draft comment kept from a finding; the finding stays. */
export function unkeepFinding(prId: number, findingId: number): Promise<void> {
  return requestVoid(`/api/prs/${prId}/findings/${findingId}/keep`, { method: 'DELETE' })
}

/** Copies every finding of one run into the draft. */
export function keepAllFindings(prId: number, agentReviewId: number): Promise<DraftCommentRow[]> {
  return requestJson<DraftCommentRow[]>(`/api/prs/${prId}/reviews/${agentReviewId}/keep-all`, { method: 'POST' })
}
