import { createOpencodeClient, type Event, type Message, type Part } from '@opencode-ai/sdk'
import type { ChatEvent, ChatPart, ChatThreadRef, DiffSelection } from '@review/shared'
import {
  composePrompt,
  lineThreadId,
  lineThreadPreamble,
  type ChatHub,
  type ChatInput,
  type ChatThread,
} from '../domain/chat.ts'

export type OpencodeChatOptions = {
  baseUrl: string
  /** Working directory the agent operates in — the repo being diffed, when there is one. */
  directory: string
  title: string
  /** Sent once, ahead of the first dock message. */
  systemContext: string
  defaultAgent: string | null
}

type Client = ReturnType<typeof createOpencodeClient>

/**
 * A ChatHub over `opencode serve`. One root session for the dock, one child session per line
 * thread, one SSE relay shared by all of them.
 */
export async function openOpencodeChat(opts: OpencodeChatOptions): Promise<ChatHub> {
  const client = createOpencodeClient({ baseUrl: opts.baseUrl })
  const query = { directory: opts.directory }

  const rootID = await createSession(client, query, opts.title)
  const threads = new Map<string, ChatThread>()
  const threadBySession = new Map<string, string>()
  const roles = new Map<string, Message['role']>()
  const listeners = new Set<(e: ChatEvent) => void>()
  const emit = (e: ChatEvent) => listeners.forEach((l) => l(e))

  const register = (ref: ChatThreadRef, sessionID: string, preamble: string): ChatThread => {
    const thread = makeThread(client, query, ref, sessionID, preamble, opts.defaultAgent, roles)
    threads.set(ref.id, thread)
    threadBySession.set(sessionID, ref.id)
    return thread
  }

  const dock = register({ id: 'dock', anchor: null }, rootID, opts.systemContext)
  void relayEvents(client, opts.directory, threadBySession, roles, emit)

  return {
    dock: () => dock,
    async line(anchor: DiffSelection) {
      const id = lineThreadId(anchor)
      const existing = threads.get(id)
      if (existing) return existing
      const childID = await createSession(client, query, `${opts.title} · ${id}`, rootID)
      return register({ id, anchor }, childID, lineThreadPreamble(anchor))
    },
    threads: () => [...threads.values()].map((t) => t.ref),
    byId: (id) => threads.get(id),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

async function createSession(client: Client, query: { directory: string }, title: string, parentID?: string) {
  const created = await client.session.create({ body: { title, parentID }, query })
  if (!created.data) throw new Error(`opencode: could not create session: ${JSON.stringify(created.error)}`)
  return created.data.id
}

function makeThread(
  client: Client,
  query: { directory: string },
  ref: ChatThreadRef,
  sessionID: string,
  preamble: string,
  defaultAgent: string | null,
  roles: Map<string, Message['role']>,
): ChatThread {
  let primed = false
  return {
    ref,
    async send(input: ChatInput) {
      const agent = input.agent ?? defaultAgent ?? undefined
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
      const text = primed ? composePrompt(input) : `${preamble}\n\n---\n\n${composePrompt(input)}`
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
      if (out.length > 0) primed = true
      return out
    },

    async respondPermission(permissionID, reply) {
      await client.postSessionIdPermissionsPermissionId({
        path: { id: sessionID, permissionID },
        query,
        body: { response: reply },
      })
    },
  }
}

async function relayEvents(
  client: Client,
  directory: string,
  threadBySession: Map<string, string>,
  roles: Map<string, Message['role']>,
  emit: (e: ChatEvent) => void,
) {
  const sse = await client.event.subscribe({ query: { directory } })
  for await (const raw of sse.stream) {
    const event = raw as Event
    switch (event.type) {
      case 'message.updated': {
        const info = event.properties.info
        const thread = threadBySession.get(info.sessionID)
        if (!thread) break
        roles.set(info.id, info.role)
        if (info.role === 'assistant') {
          // `agent`/`variant` are on the wire but not in the SDK's AssistantMessage type.
          const extra = info as { agent?: string; variant?: string }
          emit({
            type: 'chat.turn',
            thread,
            agent: extra.agent ?? null,
            model: { providerID: info.providerID, modelID: info.modelID },
            variant: extra.variant ?? null,
          })
        }
        break
      }
      case 'message.part.updated': {
        const part = event.properties.part
        const thread = threadBySession.get(part.sessionID)
        if (!thread) break
        const mapped = toChatPart(part, roles.get(part.messageID) ?? 'assistant')
        if (mapped) emit({ type: 'chat.part', thread, part: mapped })
        break
      }
      case 'session.idle': {
        const thread = threadBySession.get(event.properties.sessionID)
        if (thread) emit({ type: 'chat.idle', thread })
        break
      }
      case 'session.error': {
        const thread = event.properties.sessionID && threadBySession.get(event.properties.sessionID)
        if (thread) emit({ type: 'chat.error', thread, message: describeError(event.properties.error) })
        break
      }
      case 'permission.updated': {
        const p = event.properties
        const thread = threadBySession.get(p.sessionID)
        if (thread) {
          emit({
            type: 'permission.ask',
            thread,
            permission: { id: p.id, sessionID: p.sessionID, title: p.title, pattern: p.pattern },
          })
        }
        break
      }
      case 'permission.replied': {
        const thread = threadBySession.get(event.properties.sessionID)
        if (thread) emit({ type: 'permission.done', thread, permissionID: event.properties.permissionID })
        break
      }
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
