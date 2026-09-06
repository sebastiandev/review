import type { ChatPart, DiffSelection, PermissionReply, ServerEvent } from '@revu/shared'

/** An agent conversation bound to one diff. Implemented in infrastructure over opencode. */
export type ChatSession = {
  send(input: ChatInput): Promise<void>
  history(): Promise<ChatPart[]>
  respondPermission(permissionID: string, reply: PermissionReply): Promise<void>
  /** Push events for this session; the returned function unsubscribes. */
  subscribe(listener: (event: ServerEvent) => void): () => void
}

export type ChatInput = {
  text: string
  selections: DiffSelection[]
  agent?: string
  model?: { providerID: string; modelID: string }
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
