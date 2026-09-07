/** Contract between server and client. No runtime code, types only. */

/** A unified diff plus what the viewer needs to know about it. Source-agnostic. */
export type DiffDocument = {
  /** Where the diff came from, for the title strip. */
  source: DiffSourceRef
  /** Raw unified diff text. */
  patch: string
  files: DiffFile[]
  /** path -> line numbers (new side) a comment may anchor to. */
  anchors: Record<string, number[]>
}

export type DiffSourceRef =
  | { kind: 'patch'; path: string }
  | { kind: 'repo'; path: string; base: string | null }
  | { kind: 'pr'; repo: string; number: number; headSha: string }

export type DiffFile = {
  path: string
  status: 'added' | 'deleted' | 'modified' | 'renamed'
  additions: number
  deletions: number
}

/** A range the user selected inside the rendered diff. */
export type DiffSelection = {
  path: string
  startLine: number
  endLine: number
  side: 'LEFT' | 'RIGHT'
  text: string
}

export type ModelRef = { providerID: string; modelID: string }

/** Who answers the next turn. Absent fields fall back to opencode's own defaults. */
export type TurnSettings = {
  agent?: string
  model?: ModelRef
  /** Reasoning-effort variant, one of `models[].variants`. */
  variant?: string
}

export type ChatSendRequest = TurnSettings & {
  text: string
  selections?: DiffSelection[]
  /** A server-side command name (from `AppConfig.commands`); `text` is then its arguments. */
  command?: string
}

/**
 * A conversation. `dock` is the one for the whole diff; line threads are children of it,
 * one per anchored line, and inherit its context. Ids are `dock` or `line:<path>:<line>`.
 */
export type ChatThreadRef = { id: string; anchor: DiffSelection | null }

export type PermissionReply = 'once' | 'always' | 'reject'

/** What the client renders in the dock. Flattened from opencode parts. */
export type ChatPart =
  | { type: 'text'; id: string; messageID: string; role: 'user' | 'assistant'; text: string }
  | { type: 'tool'; id: string; messageID: string; tool: string; title: string; status: 'pending' | 'running' | 'completed' | 'error'; output?: string }
  | { type: 'reasoning'; id: string; messageID: string; text: string }

export type PermissionAsk = {
  id: string
  sessionID: string
  title: string
  pattern?: string | string[]
}

/** Events one ChatHub emits. They carry the thread; the scope is stamped when forwarded to the bus. */
export type ChatEvent =
  | { type: 'chat.part'; thread: string; part: ChatPart }
  | { type: 'chat.idle'; thread: string }
  /** What actually produced the assistant turn now in progress. */
  | { type: 'chat.turn'; thread: string; agent: string | null; model: ModelRef; variant: string | null }
  | { type: 'chat.error'; thread: string; message: string }
  | { type: 'permission.ask'; thread: string; permission: PermissionAsk }
  | { type: 'permission.done'; thread: string; permissionID: string }

/** Events pushed over /api/events. Chat events carry the scope (`local` | `pr:<id>`) they belong to. */
export type ServerEvent =
  | (ChatEvent & { scope: string })
  | { type: 'sync.started'; repoId: number }
  | { type: 'sync.finished'; repoId: number; added: number; updated: number }
  | { type: 'sync.failed'; repoId: number; message: string }
  | { type: 'worktree.progress'; prId: number; stage: WorktreeStage }
  | { type: 'worktree.ready'; prId: number; path: string }
  | { type: 'worktree.failed'; prId: number; message: string }
  | { type: 'worktree.removed'; prId: number }
  | { type: 'review.submitted'; prId: number; verdict: Verdict; remoteReviewId: string }
  // Phase 4 (agent runs).
  | { type: 'review.queued'; prId: number }
  | { type: 'review.running'; prId: number }
  | { type: 'review.ready'; prId: number; verdict: Verdict | null }
  | { type: 'review.failed'; prId: number; message: string }

export type Verdict = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES'

export type WorktreeStage = 'cloning' | 'fetching' | 'checking-out' | 'ready'

/** Persisted user preferences (one row). Per-repo auto-review lives on the repo. */
export type UserSettings = {
  /** Minutes between syncs, or manual only. */
  pollInterval: 1 | 5 | 15 | 'manual'
  autoReviewOnFetch: boolean
  defaultReviewAgent: string
  defaultModel: ModelRef | null
  defaultVariant: string | null
  theme: string
  diffTheme: string
  defaultDiffMode: 'unified' | 'split'
}

/** A tracked repo with its inbox counts. */
export type RepoSummary = {
  id: number
  provider: string
  owner: string
  name: string
  tracked: boolean
  autoReview: boolean
  syncedAt: string | null
  syncError: string | null
  /** PRs not marked done. */
  activeCount: number
  /** Active PRs where my review is requested. */
  reviewRequestedCount: number
}

/** One PR in a repo's inbox. */
export type InboxRow = {
  id: number
  repoId: number
  number: number
  title: string
  author: string
  url: string
  isDraft: boolean
  state: 'open' | 'merged' | 'closed'
  additions: number
  deletions: number
  changedFiles: number
  headSha: string
  reviewRequested: boolean
  addedByUser: boolean
  doneAt: string | null
  hasWorktree: boolean
  createdAt: string
  updatedAt: string
  remoteCommentCount: number
  /** Comments in the open draft for the current head. */
  draftCommentCount: number
  /** Verdict already submitted for the current head, if any. */
  submittedVerdict: Verdict | null
}

/** A remote PR not yet (or possibly already) in the inbox. */
export type PrPreview = {
  repo: string
  number: number
  title: string
  author: string
  url: string
  isDraft: boolean
  state: 'open' | 'merged' | 'closed'
  headRef: string
  baseRef: string
  headSha: string
  additions: number
  deletions: number
  changedFiles: number
  reviewRequested: boolean
  updatedAt: string
  /** Already in the inbox. */
  stored: boolean
}

export type RemoteCommentRow = {
  remoteId: string
  author: string
  path: string
  line: number | null
  startLine: number | null
  side: 'LEFT' | 'RIGHT' | null
  body: string
  inReplyTo: string | null
  createdAt: string
}

export type DraftCommentRow = {
  id: number
  path: string
  line: number
  startLine: number | null
  side: 'LEFT' | 'RIGHT'
  body: string
  agentBody: string | null
  origin: 'agent' | 'human'
  selected: boolean
  anchorValid: boolean
  inReplyTo: string | null
  findingId: number | null
}

/** Everything the PR screen needs in one response. */
export type PrDetail = {
  pr: InboxRow & { body: string; headRef: string; baseRef: string; baseSha: string; specRef: string | null; worktreePath: string | null }
  diff: DiffDocument | null
  comments: RemoteCommentRow[]
  draft: { id: number; headSha: string; status: 'open' | 'submitted'; comments: DraftCommentRow[] } | null
  viewed: { path: string; headSha: string }[]
}

/** One submitted review, with how the agent's verdict compared. */
export type PastReviewRow = {
  submissionId: number
  prId: number
  repo: string
  number: number
  title: string
  url: string
  verdict: Verdict
  agentVerdict: Verdict | null
  agentAgreement: 'agreed' | 'disagreed' | 'not run'
  body: string
  submittedAt: string
}

/** A checked-out PR on disk. `sizeBytes` is measured by the worktree adapter, not stored. */
export type WorktreeRow = {
  prId: number
  repo: string
  number: number
  title: string
  path: string
  state: 'open' | 'merged' | 'closed'
  doneAt: string | null
  sizeBytes: number
}

export type AppConfig = {
  agents: { name: string; description?: string }[]
  models: { providerID: string; modelID: string; name: string; variants: string[] }[]
  commands: { name: string; description?: string }[]
  settings: Settings
}

export type Settings = {
  defaultReviewAgent: string
  defaultModel: ModelRef | null
  theme: string
  chatAgent: string | null
}
