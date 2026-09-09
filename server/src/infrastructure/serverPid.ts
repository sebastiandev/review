import { rmSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const PID_FILE = 'server.pid'

/** Record this process as the review server so a later `review` (or `review update`) can replace it. */
export async function writePidFile(cacheDir: string): Promise<void> {
  await writeFile(join(cacheDir, PID_FILE), String(process.pid))
  const cleanup = () => rmSync(join(cacheDir, PID_FILE), { force: true })
  process.on('exit', cleanup)
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      cleanup()
      process.exit(0)
    })
  }
}

/**
 * Stop the review server recorded in the cache dir, if it is alive, and wait for its port to free up.
 * Returns the pid that was stopped, or null when nothing was running.
 */
export async function stopRunningServer(cacheDir: string, port: number, log: (line: string) => void): Promise<number | null> {
  const pid = await readPid(cacheDir)
  if (pid === null || pid === process.pid || !alive(pid)) return null
  log(`stopping the review server already running on :${port} (pid ${pid})`)
  process.kill(pid, 'SIGTERM')
  for (let i = 0; i < 50 && (alive(pid) || (await portInUse(port))); i++) await sleep(100)
  if (alive(pid)) {
    log(`pid ${pid} did not exit; killing it`)
    process.kill(pid, 'SIGKILL')
    await sleep(200)
  }
  await rm(join(cacheDir, PID_FILE), { force: true })
  return pid
}

async function readPid(cacheDir: string): Promise<number | null> {
  try {
    const pid = Number((await readFile(join(cacheDir, PID_FILE), 'utf8')).trim())
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function portInUse(port: number): Promise<boolean> {
  try {
    await fetch(`http://localhost:${port}/api/settings`, { signal: AbortSignal.timeout(300) })
    return true
  } catch {
    return false
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
