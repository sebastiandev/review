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
      // Subscribe before prompting so the idle event cannot slip past us.
      const sse = await client.event.subscribe({ query })
      const created = await client.session.create({ body: { title: req.title }, query })
      if (!created.data) throw new Error(`opencode: could not create session: ${JSON.stringify(created.error)}`)
      const sessionID = created.data.id
      onSession(sessionID)

      // `variant` is accepted by the server but missing from the SDK's body type.
      const body: NonNullable<Parameters<typeof client.session.promptAsync>[0]['body']> & { variant?: string } = {
        agent: req.agent,
        model: req.model ?? undefined,
        variant: req.variant ?? undefined,
        parts: [{ type: 'text', text: req.prompt }],
      }
      const res = await client.session.promptAsync({ path: { id: sessionID }, query, body })
      if (res.error) throw new Error(`opencode: prompt failed: ${JSON.stringify(res.error)}`)

      await settled(sse.stream, sessionID, onStep)
    },
  }
}

/**
 * Resolve on `session.idle` for `sessionID`, reject on its `session.error`; report each tool
 * call of that session once, when it completes. Other events are ignored.
 */
async function settled(stream: AsyncIterable<unknown>, sessionID: string, onStep: (step: AgentStep) => void): Promise<void> {
  const reported = new Set<string>()
  for await (const raw of stream) {
    const event = raw as Event
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
