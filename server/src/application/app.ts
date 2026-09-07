import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { serveStatic } from '@hono/node-server/serve-static'
import type { ChatSendRequest, PermissionReply, Settings } from '@review/shared'
import type { DiffSource } from '../domain/diff.ts'
import { buildDiffDocument } from '../domain/diff.ts'
import type { ChatSession } from '../domain/chat.ts'
import { readOpencodeCatalog } from '../infrastructure/opencodeCatalog.ts'

export type AppDeps = {
  source: DiffSource
  chat: ChatSession
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

  app.get('/api/config', async (c) => {
    const catalog = await readOpencodeCatalog(deps.opencodeUrl, deps.directory)
    return c.json({ ...catalog, settings: deps.settings })
  })

  app.post('/api/chat', async (c) => {
    const body = (await c.req.json()) as ChatSendRequest
    await deps.chat.send({
      text: body.text,
      selections: body.selections ?? [],
      command: body.command,
      agent: body.agent,
      model: body.model,
      variant: body.variant,
    })
    return c.body(null, 202)
  })

  app.get('/api/chat/history', async (c) => c.json(await deps.chat.history()))

  app.post('/api/permission/:id', async (c) => {
    const { response } = (await c.req.json()) as { response: PermissionReply }
    await deps.chat.respondPermission(c.req.param('id'), response)
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
