import { spawn, type ChildProcess } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { createOpencodeClient, type GlobalEvent } from '@opencode-ai/sdk'

const READY_TIMEOUT_MS = 20_000
const PROBE_TIMEOUT_MS = 1_500
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]']

type Log = (line: string) => void

/** The opencode server Review talks to. `url` is fixed for the life of the process. */
export type OpencodeServer = {
  url: string
  /** Settles once the server answers `/global/health`. */
  ready: Promise<void>
  /**
   * Restart the server when it has run for at least `maxAgeMs` and no session is busy, so it
   * reloads its model catalog (opencode reads models.dev only at process start).
   * Returns true when it restarted; always false for a server Review did not spawn.
   */
  restartIfStale(maxAgeMs: number): Promise<boolean>
}

/** True when an opencode server answers at `baseUrl`. */
export async function opencodeReachable(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/global/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Spawn a private `opencode serve` on a free local port and supervise it: it dies with this
 * process, and `restartIfStale` replaces it on the same port. The URL is written to
 * `<cacheDir>/opencode.url` for debugging scripts.
 */
export async function spawnOpencode(cacheDir: string, log: Log = () => {}): Promise<OpencodeServer> {
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  await writeFile(join(cacheDir, 'opencode.url'), url)

  let child: ChildProcess | null = null
  let startedAt = 0
  let restarting = false
  const busy = new Set<string>()

  const start = async () => {
    log(`opencode: starting \`opencode serve --port ${port}\``)
    child = await startServe(url, port, '127.0.0.1')
    startedAt = Date.now()
    busy.clear()
    log(`opencode: listening on ${url}`)
  }
  killWithProcess(() => child)
  const ready = start()
  void ready.then(() => trackBusySessions(url, busy)).catch(() => {})

  return {
    url,
    ready,
    async restartIfStale(maxAgeMs) {
      if (restarting || child === null || Date.now() - startedAt < maxAgeMs || busy.size > 0) return false
      restarting = true
      try {
        log('opencode: restarting to reload the model catalog')
        await stop(child)
        await start()
        return true
      } finally {
        restarting = false
      }
    },
  }
}

/**
 * Use the opencode server at `baseUrl` (from `--opencode`). When none answers and the URL is
 * local, spawn `opencode serve` on that port; the child dies with this process. Never restarted.
 */
export function attachOpencode(baseUrl: string, log: Log = () => {}): OpencodeServer {
  const ready = (async () => {
    if (await opencodeReachable(baseUrl)) return
    const url = new URL(baseUrl)
    if (!LOCAL_HOSTS.includes(url.hostname)) throw new Error(`opencode is not reachable at ${baseUrl}`)
    const port = Number(url.port || '80')
    log(`opencode: not running at ${baseUrl}, starting \`opencode serve --port ${port}\``)
    const child = await startServe(baseUrl, port, url.hostname)
    killWithProcess(() => child)
    log(`opencode: listening on ${baseUrl}`)
  })()
  return { url: baseUrl, ready, restartIfStale: async () => false }
}

/** Spawn `opencode serve` and wait until it answers at `url`. */
async function startServe(url: string, port: number, hostname: string): Promise<ChildProcess> {
  const child = spawn('opencode', ['serve', '--port', String(port), '--hostname', hostname], { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`opencode serve exited with ${child.exitCode}: ${stderr.trim()}`)
    if (await opencodeReachable(url)) return child
    await new Promise((r) => setTimeout(r, 300))
  }
  child.kill()
  throw new Error(`opencode serve did not come up within ${READY_TIMEOUT_MS / 1000}s: ${stderr.trim()}`)
}

/** Kill the child and wait for it to exit, so its port is free again. */
function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    child.once('exit', () => resolve())
    child.kill()
  })
}

/** The current child dies when this process exits or is interrupted. */
function killWithProcess(current: () => ChildProcess | null) {
  const kill = () => current()?.kill()
  process.once('exit', kill)
  process.once('SIGINT', () => {
    kill()
    process.exit(130)
  })
  process.once('SIGTERM', () => {
    kill()
    process.exit(143)
  })
}

/**
 * Keep `busy` equal to the sessions opencode reports as busy or retrying, across every
 * directory. The SSE client reconnects on its own, including after a restart.
 */
async function trackBusySessions(url: string, busy: Set<string>) {
  const client = createOpencodeClient({ baseUrl: url })
  const sse = await client.global.event()
  for await (const raw of sse.stream) {
    const event = (raw as GlobalEvent).payload
    if (event.type === 'session.status') {
      if (event.properties.status.type === 'idle') busy.delete(event.properties.sessionID)
      else busy.add(event.properties.sessionID)
    } else if (event.type === 'session.idle') {
      busy.delete(event.properties.sessionID)
    }
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no free port'))))
    })
  })
}
