import { createOpencodeClient, type Event, type Part } from '@opencode-ai/sdk'
import type { AgentRunner, AgentStep } from '../domain/agentRunner.ts'

/**
 * `AgentRunner` over `opencode serve`: one fresh session per run in the given directory,
 * resolved on that session's `session.idle`, rejected on its `session.error`.
 */
export function opencodeRunner(opts: { baseUrl: string }): AgentRunner {
  const client = createOpencodeClient({ baseUrl: opts.baseUrl })
  return {
    async run(req, onSession, onStep = () => {}) {
      const query = { directory: req.directory }
      const controller = new AbortController()
      const { signal } = controller
      const timer = setTimeout(() => controller.abort(new Error(`agent did not finish within ${Math.round(req.timeoutMs / 60_000)} min`)), req.timeoutMs)
      let sessionID: string | undefined
      try {
        const created = await client.session.create({ body: { title: req.title }, query, signal })
        signal.throwIfAborted()
        if (!created.data) throw new Error(`opencode: could not create session: ${JSON.stringify(created.error)}`)
        sessionID = created.data.id
        onSession(sessionID)

        // SSE is lazy: start consuming and wait for the connection before prompting.
        let onConnected!: () => void
        let onConnectionError!: (error: unknown) => void
        const connected = new Promise<void>((resolve, reject) => { onConnected = resolve; onConnectionError = reject })
        const sse = await client.event.subscribe({ query, signal, sseMaxRetryAttempts: 1 })
        const completion = settled(sse.stream, sessionID, onStep, onConnected).then(
          () => ({ error: null }),
          (error: unknown) => { onConnectionError(error); return { error } },
        )
        await connected
        signal.throwIfAborted()

        // `variant` is accepted by the server but missing from the SDK's body type.
        const body: NonNullable<Parameters<typeof client.session.promptAsync>[0]['body']> & { variant?: string } = {
          agent: req.agent,
          model: req.model ?? undefined,
          variant: req.variant ?? undefined,
          parts: [{ type: 'text', text: req.prompt }],
        }
        const res = await client.session.promptAsync({ path: { id: sessionID }, query, body, signal })
        signal.throwIfAborted()
        if (res.error) throw new Error(`opencode: prompt failed: ${JSON.stringify(res.error)}`)

        const result = await completion
        signal.throwIfAborted()
        if (result.error) throw result.error
        return { finalText: await lastAssistantText(client, query, sessionID, signal) }
      } catch (error) {
        const cause = signal.aborted ? signal.reason : error
        if (sessionID) {
          // Use a fresh bounded signal: the run's signal is already aborted on timeout.
          try {
            const stopped = await client.session.abort({ path: { id: sessionID }, query, signal: AbortSignal.timeout(5000) })
            if (stopped.error || stopped.data !== true) throw new Error(JSON.stringify(stopped.error ?? stopped.data))
          } catch (cancelError) {
            throw new Error(`${cause instanceof Error ? cause.message : String(cause)}; could not cancel OpenCode session ${sessionID}: ${String(cancelError)}`)
          }
        }
        throw cause
      } finally {
        clearTimeout(timer)
        controller.abort()
      }
    },
  }
}

/**
 * Resolve on `session.idle` for `sessionID`, reject on its `session.error`; report each tool
 * call of that session once, when it completes. Other events are ignored.
 */
async function settled(stream: AsyncIterable<unknown>, sessionID: string, onStep: (step: AgentStep) => void, onConnected: () => void): Promise<void> {
  const reported = new Set<string>()
  for await (const raw of stream) {
    const event = raw as Event
    if (event.type === 'server.connected') onConnected()
    if (event.type === 'session.idle' && event.properties.sessionID === sessionID) return
    if (event.type === 'session.error' && event.properties.sessionID === sessionID) {
      throw new Error(describeError(event.properties.error))
    }
    if (event.type === 'message.part.updated' && event.properties.part.sessionID === sessionID) {
      const step = completedStep(event.properties.part)
      if (step && !reported.has(step.callID)) {
        reported.add(step.callID)
        onStep({ tool: step.tool, title: step.title })
      }
    }
  }
  throw new Error('opencode: event stream closed before the session went idle')
}

function describeError(err: unknown): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: { message?: string } }).data
    if (data?.message) return data.message
  }
  return 'agent run failed'
}

/** A finished tool part as a step, or null for anything else. */
function completedStep(part: Part): { callID: string; tool: string; title: string } | null {
  if (part.type !== 'tool' || part.state.status !== 'completed') return null
  return { callID: part.callID, tool: part.tool, title: part.state.title || part.tool }
}

/** The text of the assistant's last message in the session, or null. */
async function lastAssistantText(client: ReturnType<typeof createOpencodeClient>, query: { directory: string }, sessionID: string, signal: AbortSignal): Promise<string | null> {
  const res = await client.session.messages({ path: { id: sessionID }, query, signal })
  signal.throwIfAborted()
  if (res.error) throw new Error(`opencode: could not read response: ${JSON.stringify(res.error)}`)
  const assistant = (res.data ?? []).filter((m) => m.info.role === 'assistant')
  const last = assistant[assistant.length - 1]
  if (!last) return null
  const text = last.parts
    .filter((p): p is Extract<Part, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .trim()
  return text || null
}
