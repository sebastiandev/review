import type { ChatEvent, ChatPart, ChatThreadRef, DiffSelection, PermissionReply, TurnSettings } from '@review/shared'

/** One agent conversation. Implemented in infrastructure over opencode. */
export type ChatThread = {
  ref: ChatThreadRef
  send(input: ChatInput): Promise<void>
  /** Stop the agent's current turn, like Esc in the CLI. No-op when idle. */
  abort(): Promise<void>
  history(): Promise<ChatPart[]>
  respondPermission(permissionID: string, reply: PermissionReply): Promise<void>
}

/**
 * All conversations about one diff. The dock thread is the root; line threads are children
 * created on first use so they inherit the root's context.
 */
export type ChatHub = {
  dock(): ChatThread
  /** Get or create the thread anchored to a line. */
  line(anchor: DiffSelection): Promise<ChatThread>
  threads(): ChatThreadRef[]
  byId(id: string): ChatThread | undefined
  /** Push events for every thread; the returned function unsubscribes. */
  subscribe(listener: (event: ChatEvent) => void): () => void
}

export type ChatInput = TurnSettings & {
  text: string
  selections: DiffSelection[]
  command?: string
}

/** Stable thread id for a line anchor. */
export function lineThreadId(anchor: DiffSelection): string {
  return `line:${anchor.path}:${anchor.startLine}`
}

/**
 * Compose the message the agent receives. The user's text stays verbatim and first, so the
 * client can render the quoted blocks it inserted; the selection metadata follows so the
 * agent knows where in the tree each quote lives.
 */
export function composePrompt(input: ChatInput): string {
  if (input.selections.length === 0) return input.text
  const refs = input.selections
    .map((s) => `- ${s.path}:${s.startLine}-${s.endLine} (${s.side})`)
    .join('\n')
  return `${input.text}\n\nSelected ranges in the diff under discussion:\n${refs}`
}

/** Opening context for a line thread: where we are and what is on the line. */
export function lineThreadPreamble(anchor: DiffSelection): string {
  const range = anchor.startLine === anchor.endLine ? `${anchor.startLine}` : `${anchor.startLine}-${anchor.endLine}`
  return [
    `This conversation is anchored to ${anchor.path}:${range} (${anchor.side} side) in the diff under review.`,
    'The lines:',
    '```',
    anchor.text,
    '```',
    'Answer about this location specifically. Read the surrounding file when it helps.',
  ].join('\n')
}
