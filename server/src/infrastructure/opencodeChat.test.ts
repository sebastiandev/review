import { createServer, type Server, type ServerResponse } from 'node:http'
import type { ChatEvent } from '@review/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openOpencodeChat } from './opencodeChat.ts'

describe('openOpencodeChat permissions', () => {
  let server: Server
  let baseUrl: string
  let events: ServerResponse | undefined
  let replies: { path: string; directory: string | null; body: unknown }[]

  /** Send an opencode SSE frame through the actual HTTP connection. */
  const emit = (event: unknown) => events!.write(`data: ${JSON.stringify(event)}\n\n`)

  beforeEach(async () => {
    events = undefined
    replies = []
    server = createServer((req, res) => {
      const url = new URL(req.url!, 'http://localhost')
      let raw = ''
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()))
      req.on('end', () => {
        if (url.pathname === '/event') {
          events = res
          res.writeHead(200, { 'content-type': 'text/event-stream' })
          emit({ type: 'server.connected', properties: {} })
          return
        }
        if (url.pathname === '/session') {
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 'ses_dock' }))
          return
        }
        if (url.pathname.startsWith('/permission/')) {
          replies.push({ path: url.pathname, directory: url.searchParams.get('directory'), body: JSON.parse(raw) })
          res.writeHead(200, { 'content-type': 'application/json' }).end('true')
          return
        }
        res.writeHead(404).end()
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('no test server address')
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    events?.end()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  const openHub = async () => {
    const hub = await openOpencodeChat({ baseUrl, directory: '/worktree', title: 'pr', systemContext: '', defaultAgent: null })
    const seen: ChatEvent[] = []
    hub.subscribe((e) => seen.push(e))
    await vi.waitFor(() => expect(events).toBeDefined())
    return { hub, seen }
  }

  it('relays a permission.asked request to the dock thread', async () => {
    const { seen } = await openHub()

    emit({
      type: 'permission.asked',
      properties: { id: 'per_1', sessionID: 'ses_dock', permission: 'external_directory', patterns: ['/Users/me/.agents/*'], metadata: {}, always: [] },
    })

    await vi.waitFor(() =>
      expect(seen).toContainEqual({
        type: 'permission.ask',
        thread: 'dock',
        permission: { id: 'per_1', sessionID: 'ses_dock', title: 'external_directory: /Users/me/.agents/*', pattern: ['/Users/me/.agents/*'] },
      }),
    )
  })

  it('relays permission.replied as done for that request', async () => {
    const { seen } = await openHub()

    emit({ type: 'permission.replied', properties: { sessionID: 'ses_dock', requestID: 'per_1', reply: 'once' } })

    await vi.waitFor(() => expect(seen).toContainEqual({ type: 'permission.done', thread: 'dock', permissionID: 'per_1' }))
  })

  it('answers a request through the permission reply endpoint', async () => {
    const { hub } = await openHub()

    await hub.dock().respondPermission('per_1', 'always')

    expect(replies).toEqual([{ path: '/permission/per_1/reply', directory: '/worktree', body: { reply: 'always' } }])
  })
})
