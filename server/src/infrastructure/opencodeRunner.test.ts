import { createServer, type Server, type ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentRunRequest, AgentStep } from '../domain/agentRunner.ts'
import { opencodeRunner } from './opencodeRunner.ts'

describe('opencodeRunner', () => {
  let server: Server
  let baseUrl: string
  let events: ServerResponse | undefined
  let abortReply: ServerResponse | undefined
  let mode: 'complete' | 'hang' | 'error'
  let holdAbort: boolean
  let abortStatus: number
  let streamClosed: boolean
  let calls: string[]
  const request: AgentRunRequest = {
    directory: '/review-worktree', title: 'review', agent: 'pr-reviewer', model: null,
    variant: null, prompt: 'Review the supplied diff.', timeoutMs: 5000,
  }

  /** Send an OpenCode SSE frame through the actual HTTP connection. */
  function emit(event: unknown): void {
    events!.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  beforeEach(async () => {
    mode = 'complete'
    holdAbort = false
    abortStatus = 200
    streamClosed = false
    events = undefined
    abortReply = undefined
    calls = []
    server = createServer((req, res) => {
      const url = new URL(req.url!, 'http://localhost')
      calls.push(`${req.method} ${url.pathname}`)
      req.resume()
      if (url.pathname === '/event') {
        events = res
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.on('close', () => { streamClosed = true })
        emit({ type: 'server.connected', properties: {} })
        return
      }
      if (url.pathname === '/session') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 'ses_review' }))
        return
      }
      if (url.pathname === '/session/ses_review/prompt_async') {
        res.writeHead(204).end()
        if (mode === 'complete') {
          emit({ type: 'message.part.updated', properties: { part: {
            type: 'tool', sessionID: 'ses_review', callID: 'read-1', tool: 'read',
            state: { status: 'completed', title: 'Read supplied diff' },
          } } })
          emit({ type: 'session.idle', properties: { sessionID: 'ses_review' } })
        } else if (mode === 'error') {
          emit({ type: 'session.error', properties: { sessionID: 'ses_review', error: { data: { message: 'provider failed' } } } })
        }
        return
      }
      if (url.pathname === '/session/ses_review/message') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify([
          { info: { role: 'assistant' }, parts: [{ type: 'text', text: '{"event":"COMMENT","body":"Done","comments":[]}' }] },
        ]))
        return
      }
      if (url.pathname === '/session/ses_review/abort') {
        abortReply = res
        if (!holdAbort) res.writeHead(abortStatus, { 'content-type': 'application/json' }).end(abortStatus === 200 ? 'true' : '{"error":"unavailable"}')
        return
      }
      res.writeHead(404).end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('test server did not bind a port')
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })

  it('subscribes before prompting, returns JSON and closes the event connection', async () => {
    const sessions: string[] = []
    const steps: AgentStep[] = []
    const result = await opencodeRunner({ baseUrl }).run(request, (id) => sessions.push(id), (step) => steps.push(step))
    expect(JSON.parse(result.finalText!)).toMatchObject({ event: 'COMMENT', comments: [] })
    expect(sessions).toEqual(['ses_review'])
    expect(steps).toEqual([{ tool: 'read', title: 'Read supplied diff' }])
    expect(calls).toEqual(['POST /session', 'GET /event', 'POST /session/ses_review/prompt_async', 'GET /session/ses_review/message'])
    await vi.waitFor(() => expect(streamClosed).toBe(true))
  })

  it('waits for remote cancellation before rejecting a timed-out run', async () => {
    mode = 'hang'
    holdAbort = true
    let settled = false
    const result = opencodeRunner({ baseUrl }).run({ ...request, timeoutMs: 300 }, () => {}).catch((error: unknown) => {
      settled = true
      return error
    })
    await vi.waitFor(() => expect(abortReply).toBeDefined())
    expect(settled).toBe(false)
    abortReply!.writeHead(200, { 'content-type': 'application/json' }).end('true')
    expect(await result).toMatchObject({ message: expect.stringContaining('did not finish') })
    expect(calls.filter((call) => call.endsWith('/abort'))).toHaveLength(1)
    await vi.waitFor(() => expect(streamClosed).toBe(true))
  })

  it('reports cancellation failure rather than claiming the session stopped', async () => {
    mode = 'hang'
    abortStatus = 503
    await expect(opencodeRunner({ baseUrl }).run({ ...request, timeoutMs: 300 }, () => {})).rejects.toThrow('could not cancel OpenCode session ses_review')
    await vi.waitFor(() => expect(streamClosed).toBe(true))
  })

  it('cleans up the remote session when the provider fails', async () => {
    mode = 'error'
    await expect(opencodeRunner({ baseUrl }).run(request, () => {})).rejects.toThrow('provider failed')
    expect(calls).toContain('POST /session/ses_review/abort')
    await vi.waitFor(() => expect(streamClosed).toBe(true))
  })
})
