import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { serveStatic } from '@hono/node-server/serve-static'
import type { ChatSendRequest, DiffSelection, PermissionReply, Settings } from '@review/shared'
import type { DiffSource } from '../domain/diff.ts'
import { buildDiffDocument } from '../domain/diff.ts'
import type { ChatHub } from '../domain/chat.ts'
import { readOpencodeCatalog } from '../infrastructure/opencodeCatalog.ts'

export type AppDeps = {
  source: DiffSource
  chat: ChatHub
  settings: Settings
  opencodeUrl: string
  /** Directory opencode resolves agents and config for. */
  directory: string
  /** Built client to serve, or null in dev where Vite serves it. */
  staticDir: string | null
}

/** HTTP surface for diff mode. Parses input, calls one thing, maps the result. */
export function createApp(deps: AppDeps) {
  const app = new Hono()

  app.get('/api/diff', async (c) => {
    const patch = await deps.source.read()
    return c.json(buildDiffDocument(deps.source.ref, patch))
  })

  /** Full new-side content of one changed file, for the rich markdown view. */
  app.get('/api/file', async (c) => {
    const path = c.req.query('path')
    if (!path) return c.json({ error: 'path required' }, 400)
    const content = await deps.source.fileContent(path)
    if (content === null) return c.json({ error: 'not available' }, 404)
    return c.json({ path, content })
  })

  app.get('/api/config', async (c) => {
    const catalog = await readOpencodeCatalog(deps.opencodeUrl, deps.directory)
    return c.json({ ...catalog, settings: deps.settings })
  })

  app.get('/api/threads', (c) => c.json(deps.chat.threads()))

  /** Get or create the thread anchored to a line; body is the anchor selection. */
  app.post('/api/threads/line', async (c) => {
    const anchor = (await c.req.json()) as DiffSelection
    const thread = await deps.chat.line(anchor)
    return c.json(thread.ref)
  })

  app.post('/api/chat/:thread', async (c) => {
    const thread = deps.chat.byId(c.req.param('thread'))
    if (!thread) return c.json({ error: 'unknown thread' }, 404)
    const body = (await c.req.json()) as ChatSendRequest
    await thread.send({
      text: body.text,
      selections: body.selections ?? [],
      command: body.command,
      agent: body.agent,
      model: body.model,
      variant: body.variant,
    })
    return c.body(null, 202)
  })

  app.get('/api/chat/:thread/history', async (c) => {
    const thread = deps.chat.byId(c.req.param('thread'))
    if (!thread) return c.json({ error: 'unknown thread' }, 404)
    return c.json(await thread.history())
  })

  app.post('/api/chat/:thread/permission/:id', async (c) => {
    const thread = deps.chat.byId(c.req.param('thread'))
    if (!thread) return c.json({ error: 'unknown thread' }, 404)
    const { response } = (await c.req.json()) as { response: PermissionReply }
    await thread.respondPermission(c.req.param('id'), response)
    return c.body(null, 204)
  })

  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = deps.chat.subscribe((event) => {
        void stream.writeSSE({ data: JSON.stringify(event) })
      })
      stream.onAbort(unsubscribe)
      // Keep the connection alive; proxies drop silent SSE streams.
      while (!stream.aborted) {
        await stream.writeSSE({ event: 'ping', data: '' })
        await stream.sleep(15_000)
      }
    }),
  )

  if (deps.staticDir) {
    app.use('/*', serveStatic({ root: deps.staticDir }))
    app.get('*', serveStatic({ root: deps.staticDir, path: 'index.html' }))
  }

  return app
}
