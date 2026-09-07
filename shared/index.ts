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

/** Events pushed over /api/events. Chat events carry the thread they belong to. */
export type ServerEvent =
  | { type: 'chat.part'; thread: string; part: ChatPart }
  | { type: 'chat.idle'; thread: string }
  /** What actually produced the assistant turn now in progress. */
  | { type: 'chat.turn'; thread: string; agent: string | null; model: ModelRef; variant: string | null }
  | { type: 'chat.error'; thread: string; message: string }
  | { type: 'permission.ask'; thread: string; permission: PermissionAsk }
  | { type: 'permission.done'; thread: string; permissionID: string }

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
