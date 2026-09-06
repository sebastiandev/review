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

export type ChatSendRequest = {
  text: string
  selections?: DiffSelection[]
  agent?: string
  model?: { providerID: string; modelID: string }
}

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

/** Events pushed over /api/events. */
export type ServerEvent =
  | { type: 'chat.part'; part: ChatPart }
  | { type: 'chat.idle' }
  | { type: 'chat.error'; message: string }
  | { type: 'permission.ask'; permission: PermissionAsk }
  | { type: 'permission.done'; permissionID: string }

export type AppConfig = {
  agents: { name: string; description?: string }[]
  models: { providerID: string; modelID: string; name: string }[]
  settings: Settings
}

export type Settings = {
  defaultReviewAgent: string
  defaultModel: { providerID: string; modelID: string } | null
  theme: string
  chatAgent: string | null
}
