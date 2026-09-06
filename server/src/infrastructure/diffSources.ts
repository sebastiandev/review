import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { DiffSource } from '../domain/diff.ts'

const run = promisify(execFile)

/** A diff read from a patch file on disk. */
export function patchFileSource(path: string): DiffSource {
  return {
    ref: { kind: 'patch', path },
    read: () => readFile(path, 'utf8'),
  }
}

/**
 * A diff computed from a git working tree.
 * Without `base`: everything uncommitted vs HEAD, untracked files included.
 * With `base`: the current branch vs `base` (three-dot merge-base diff), working tree included.
 */
export function localRepoSource(path: string, base: string | null): DiffSource {
  return {
    ref: { kind: 'repo', path, base },
    async read() {
      if (base) {
        const { stdout } = await git(path, ['diff', `${base}...HEAD`])
        const { stdout: wt } = await git(path, ['diff', 'HEAD'])
        return stdout + wt
      }
      const tracked = await git(path, ['diff', 'HEAD'])
      const untracked = await untrackedAsDiff(path)
      return tracked.stdout + untracked
    },
  }
}

async function untrackedAsDiff(repo: string): Promise<string> {
  const { stdout } = await git(repo, ['ls-files', '--others', '--exclude-standard', '-z'])
  const files = stdout.split('\0').filter(Boolean)
  const parts = await Promise.all(
    files.map(async (f) => {
      // `git diff --no-index` exits 1 when files differ, which is the normal case.
      const out = await git(repo, ['diff', '--no-index', '--', '/dev/null', f]).catch((e) => e)
      return typeof out.stdout === 'string' ? out.stdout : ''
    }),
  )
  return parts.join('')
}

function git(cwd: string, args: string[]) {
  return run('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 })
}
