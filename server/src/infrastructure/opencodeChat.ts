import { createOpencodeClient, type Event, type Message, type Part } from '@opencode-ai/sdk'
import type { ChatPart, ServerEvent } from '@revu/shared'
import { composePrompt, type ChatInput, type ChatSession } from '../domain/chat.ts'

export type OpencodeChatOptions = {
  baseUrl: string
  /** Working directory the agent operates in — the repo being diffed, when there is one. */
  directory: string
  title: string
  systemContext: string
  defaultAgent: string | null
}

/**
 * A ChatSession over `opencode serve`. Creates the session lazily on first use, relays the
 * server's SSE stream filtered to that session, and answers permission asks on request.
 */
export async function openOpencodeChat(opts: OpencodeChatOptions): Promise<ChatSession> {
  const client = createOpencodeClient({ baseUrl: opts.baseUrl })
  const query = { directory: opts.directory }

  const created = await client.session.create({ body: { title: opts.title }, query })
  if (!created.data) throw new Error(`opencode: could not create session: ${JSON.stringify(created.error)}`)
  const sessionID = created.data.id

  const listeners = new Set<(e: ServerEvent) => void>()
  const roles = new Map<string, Message['role']>()
  const emit = (e: ServerEvent) => listeners.forEach((l) => l(e))

  void relayEvents(client, opts.directory, sessionID, roles, emit)

  let primed = false

  return {
    async send(input: ChatInput) {
      const agent = input.agent ?? opts.defaultAgent ?? undefined
      if (input.command) {
        const res = await client.session.command({
          path: { id: sessionID },
          query,
          body: {
            command: input.command,
            arguments: composePrompt(input),
            agent,
            model: input.model ? `${input.model.providerID}/${input.model.modelID}` : undefined,
          },
        })
        if (res.error) throw new Error(`opencode: command failed: ${JSON.stringify(res.error)}`)
        return
      }
      const text = primed ? composePrompt(input) : `${opts.systemContext}\n\n---\n\n${composePrompt(input)}`
      primed = true
      // `variant` is accepted by the server but missing from the SDK's body type.
      const body: NonNullable<Parameters<typeof client.session.promptAsync>[0]['body']> & { variant?: string } = {
        agent,
        model: input.model,
        variant: input.variant,
        parts: [{ type: 'text', text }],
      }
      const res = await client.session.promptAsync({ path: { id: sessionID }, query, body })
      if (res.error) throw new Error(`opencode: prompt failed: ${JSON.stringify(res.error)}`)
    },

    async history() {
      const res = await client.session.messages({ path: { id: sessionID }, query })
      const out: ChatPart[] = []
      for (const m of res.data ?? []) {
        roles.set(m.info.id, m.info.role)
        for (const p of m.parts) {
          const part = toChatPart(p, m.info.role)
          if (part) out.push(part)
        }
      }
      return out
    },

    async respondPermission(permissionID, reply) {
      await client.postSessionIdPermissionsPermissionId({
        path: { id: sessionID, permissionID },
        query,
        body: { response: reply },
      })
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

async function relayEvents(
  client: ReturnType<typeof createOpencodeClient>,
  directory: string,
  sessionID: string,
  roles: Map<string, Message['role']>,
  emit: (e: ServerEvent) => void,
) {
  const sse = await client.event.subscribe({ query: { directory } })
  for await (const raw of sse.stream) {
    const event = raw as Event
    switch (event.type) {
      case 'message.updated': {
        const info = event.properties.info
        if (info.sessionID !== sessionID) break
        roles.set(info.id, info.role)
        if (info.role === 'assistant') {
          // `agent`/`variant` are on the wire but not in the SDK's AssistantMessage type.
          const extra = info as { agent?: string; variant?: string }
          emit({
            type: 'chat.turn',
            agent: extra.agent ?? null,
            model: { providerID: info.providerID, modelID: info.modelID },
            variant: extra.variant ?? null,
          })
        }
        break
      }
      case 'message.part.updated': {
        const part = event.properties.part
        if (part.sessionID !== sessionID) break
        const role = roles.get(part.messageID) ?? 'assistant'
        const mapped = toChatPart(part, role)
        if (mapped) emit({ type: 'chat.part', part: mapped })
        break
      }
      case 'session.idle':
        if (event.properties.sessionID === sessionID) emit({ type: 'chat.idle' })
        break
      case 'session.error':
        if (event.properties.sessionID === sessionID) {
          emit({ type: 'chat.error', message: describeError(event.properties.error) })
        }
        break
      case 'permission.updated':
        if (event.properties.sessionID === sessionID) {
          const p = event.properties
          emit({ type: 'permission.ask', permission: { id: p.id, sessionID, title: p.title, pattern: p.pattern } })
        }
        break
      case 'permission.replied':
        if (event.properties.sessionID === sessionID) {
          emit({ type: 'permission.done', permissionID: event.properties.permissionID })
        }
        break
    }
  }
}

function toChatPart(part: Part, role: Message['role']): ChatPart | null {
  switch (part.type) {
    case 'text':
      if (part.synthetic || part.ignored) return null
      return { type: 'text', id: part.id, messageID: part.messageID, role, text: part.text }
    case 'reasoning':
      return { type: 'reasoning', id: part.id, messageID: part.messageID, text: part.text }
    case 'tool': {
      const s = part.state
      return {
        type: 'tool',
        id: part.id,
        messageID: part.messageID,
        tool: part.tool,
        title: ('title' in s && s.title) || part.tool,
        status: s.status,
        output: s.status === 'completed' ? s.output : s.status === 'error' ? s.error : undefined,
      }
    }
    default:
      return null
  }
}

function describeError(err: unknown): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: { message?: string } }).data
    if (data?.message) return data.message
  }
  return 'agent run failed'
}
