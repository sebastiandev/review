import { readFile } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { DiffSourceRef } from '@review/shared'
import type { DiffSource } from '../domain/diff.ts'
import type { PrDiff } from '../domain/pullRequests.ts'

const run = promisify(execFile)

/** A diff read from a patch file on disk. */
export function patchFileSource(path: string): DiffSource {
  return {
    ref: { kind: 'patch', path },
    read: () => readFile(path, 'utf8'),
    // A patch carries only hunks; there is no file to read.
    fileContent: async () => null,
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
    async fileContent(file) {
      const full = resolve(path, file)
      const rel = relative(path, full)
      if (rel.startsWith('..') || isAbsolute(rel)) return null
      return readFile(full, 'utf8').catch(() => null)
    },
  }
}

/**
 * A PR's cached diff. `fileContent` reads the checked-out head in `worktreePath`, or yields
 * null when no worktree exists (or the path escapes it).
 */
export function prDiffSource(ref: Extract<DiffSourceRef, { kind: 'pr' }>, diff: PrDiff, worktreePath: string | null): DiffSource {
  return {
    ref,
    read: async () => diff.patch,
    async fileContent(file) {
      if (!worktreePath) return null
      const full = resolve(worktreePath, file)
      const rel = relative(worktreePath, full)
      if (rel.startsWith('..') || isAbsolute(rel)) return null
      return readFile(full, 'utf8').catch(() => null)
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
