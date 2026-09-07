import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { serveStatic } from '@hono/node-server/serve-static'
import type { ChatSendRequest, DiffSelection, PermissionReply, UserSettings } from '@review/shared'
import { buildDiffDocument } from '../domain/diff.ts'
import { DomainError } from '../domain/errors.ts'
import type { Events } from '../domain/ports.ts'
import { updateSettings } from '../domain/commands/updateSettings.ts'
import type { Store } from '../domain/store.ts'
import { readOpencodeCatalog } from '../infrastructure/opencodeCatalog.ts'
import type { ScopeRegistry } from './scopes.ts'

export type AppDeps = {
  scopes: ScopeRegistry
  store: Pick<Store, 'transaction' | 'settings'>
  events: Events
  /** Called after settings change; the scheduler re-reads the poll interval. */
  settingsChanged: () => void
  opencodeUrl: string
  /** Directory opencode resolves agents and config for. */
  directory: string
  /** Route groups mounted ahead of the static fallback (PR mode routes). */
  routes: Hono[]
  /** Built client to serve, or null in dev where Vite serves it. */
  staticDir: string | null
}

/**
 * HTTP surface shared by both modes: scoped diff + chat routes, config, settings, events.
 * Parses input, calls one thing, maps the result. Domain errors map to status by code once, here.
 */
export function createApp(deps: AppDeps) {
  const app = new Hono()

  app.onError((err, c) => {
    if (err instanceof DomainError) {
      const body = 'ids' in err ? { code: err.code, ids: err.ids } : { code: err.code }
      return c.json(body, err.code === 'not_found' ? 404 : 409)
    }
    console.error(err)
    return c.json({ code: 'internal', message: err.message }, 500)
  })

  const scoped = new Hono()

  scoped.get('/diff', async (c) => {
    const { source } = await deps.scopes.resolve(c.req.param('scope')!)
    return c.json(buildDiffDocument(source.ref, await source.read()))
  })

  /** Full new-side content of one changed file, for the rich markdown view. */
  scoped.get('/file', async (c) => {
    const path = c.req.query('path')
    if (!path) return c.json({ error: 'path required' }, 400)
    const { source } = await deps.scopes.resolve(c.req.param('scope')!)
    const content = await source.fileContent(path)
    if (content === null) return c.json({ error: 'not available' }, 404)
    return c.json({ path, content })
  })

  scoped.get('/threads', async (c) => {
    const { chat } = await deps.scopes.resolve(c.req.param('scope')!)
    return c.json(chat.threads())
  })

  /** Get or create the thread anchored to a line; body is the anchor selection. */
  scoped.post('/threads/line', async (c) => {
    const { chat } = await deps.scopes.resolve(c.req.param('scope')!)
    const anchor = (await c.req.json()) as DiffSelection
    const thread = await chat.line(anchor)
    return c.json(thread.ref)
  })

  scoped.post('/chat/:thread', async (c) => {
    const { chat } = await deps.scopes.resolve(c.req.param('scope')!)
    const thread = chat.byId(c.req.param('thread')!)
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

  scoped.get('/chat/:thread/history', async (c) => {
    const { chat } = await deps.scopes.resolve(c.req.param('scope')!)
    const thread = chat.byId(c.req.param('thread')!)
    if (!thread) return c.json({ error: 'unknown thread' }, 404)
    return c.json(await thread.history())
  })

  scoped.post('/chat/:thread/permission/:id', async (c) => {
    const { chat } = await deps.scopes.resolve(c.req.param('scope')!)
    const thread = chat.byId(c.req.param('thread')!)
    if (!thread) return c.json({ error: 'unknown thread' }, 404)
    const { response } = (await c.req.json()) as { response: PermissionReply }
    await thread.respondPermission(c.req.param('id')!, response)
    return c.body(null, 204)
  })

  app.route('/api/scopes/:scope', scoped)

  app.get('/api/config', async (c) => {
    const catalog = await readOpencodeCatalog(deps.opencodeUrl, deps.directory)
    return c.json({ ...catalog, settings: deps.store.settings.read() })
  })

  app.get('/api/settings', (c) => c.json(deps.store.settings.read()))

  app.patch('/api/settings', async (c) => {
    const patch = (await c.req.json()) as Partial<UserSettings>
    const settings = updateSettings({ store: deps.store }, patch)
    deps.settingsChanged()
    return c.json(settings)
  })

  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = deps.events.subscribe((event) => {
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

  for (const routes of deps.routes) app.route('/', routes)

  if (deps.staticDir) {
    app.use('/*', serveStatic({ root: deps.staticDir }))
    app.get('*', serveStatic({ root: deps.staticDir, path: 'index.html' }))
  }

  return app
}
