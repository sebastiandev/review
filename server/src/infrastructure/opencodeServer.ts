import { spawn, type ChildProcess } from 'node:child_process'

const READY_TIMEOUT_MS = 20_000
const PROBE_TIMEOUT_MS = 1_500

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
 * Make sure an opencode server is listening at `baseUrl`. When none is and the URL is local,
 * spawn `opencode serve` on that port and wait for it; the child dies with this process.
 * Returns the child, or null when a server was already there (or the URL is remote).
 */
export async function ensureOpencode(baseUrl: string, log: (line: string) => void = () => {}): Promise<ChildProcess | null> {
  if (await opencodeReachable(baseUrl)) return null
  const url = new URL(baseUrl)
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) {
    throw new Error(`opencode is not reachable at ${baseUrl}`)
  }
  const port = url.port || '80'
  log(`opencode: not running at ${baseUrl}, starting \`opencode serve --port ${port}\``)
  const child = spawn('opencode', ['serve', '--port', port, '--hostname', url.hostname], { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })
  const stop = () => child.kill()
  process.once('exit', stop)
  process.once('SIGINT', () => {
    stop()
    process.exit(130)
  })
  process.once('SIGTERM', () => {
    stop()
    process.exit(143)
  })

  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`opencode serve exited with ${child.exitCode}: ${stderr.trim()}`)
    if (await opencodeReachable(baseUrl)) {
      log(`opencode: listening on ${baseUrl}`)
      return child
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  child.kill()
  throw new Error(`opencode serve did not come up within ${READY_TIMEOUT_MS / 1000}s: ${stderr.trim()}`)
}
