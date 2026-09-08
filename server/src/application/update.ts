import { execFile } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** The repository root: two levels above `server/src` (or `server/dist`). */
export function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
}

/**
 * Bring the checkout to the latest version and rebuild. Fast-forward only: local commits or
 * a dirty tree stop the update instead of creating a merge. Schema migrations run on the next
 * start (`openDatabase` applies pending ones). Returns the exit code.
 */
export async function updateApp(log: (line: string) => void, root: string = repoRoot()): Promise<number> {
  const git = (args: string[]) => run('git', args, { cwd: root })
  const { stdout: status } = await git(['status', '--porcelain'])
  if (status.trim()) {
    log('working tree has local changes; commit or stash them first:')
    log(status.trimEnd())
    return 1
  }
  const { stdout: before } = await git(['rev-parse', '--short', 'HEAD'])
  log(`at ${before.trim()} — fetching…`)
  try {
    await git(['pull', '--ff-only'])
  } catch (e) {
    log(`pull failed: ${(e as { stderr?: string }).stderr?.trim() || (e as Error).message}`)
    log('the branch has diverged from its upstream; resolve it manually (git status / git log --oneline @{u}..)')
    return 1
  }
  const { stdout: after } = await git(['rev-parse', '--short', 'HEAD'])
  if (before.trim() === after.trim()) {
    log('already up to date')
  } else {
    log(`updated ${before.trim()} → ${after.trim()}`)
    const { stdout: changes } = await git(['log', '--oneline', `${before.trim()}..${after.trim()}`])
    log(changes.trimEnd())
  }
  log('installing dependencies…')
  await run('npm', ['install', '--no-audit', '--no-fund'], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
  log('building…')
  await run('npm', ['run', 'build'], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
  log('done. Pending database migrations run automatically on the next start.')
  return 0
}
