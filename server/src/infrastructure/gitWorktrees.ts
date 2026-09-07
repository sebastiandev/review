import { access, mkdir } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import type { Worktrees } from '../domain/worktrees.ts'
import type { Runner } from './process.ts'

export type GitWorktreesOptions = {
  /** Root holding `repos/<owner>/<name>` clones and `worktrees/<owner>/<name>/<n>` checkouts. */
  cacheDir: string
  run: Runner
}

/**
 * `Worktrees` over git: one clone per repo, one detached worktree per PR head.
 * Layout: `<cacheDir>/repos/<owner>/<name>` and `<cacheDir>/worktrees/<owner>/<name>/<n>`.
 */
export function gitWorktrees(opts: GitWorktreesOptions): Worktrees {
  const { cacheDir, run } = opts
  const reposDir = join(cacheDir, 'repos')
  const worktreesDir = join(cacheDir, 'worktrees')

  return {
    async create(req, onStage) {
      const repoDir = join(reposDir, req.repo.owner, req.repo.name)
      const path = join(worktreesDir, req.repo.owner, req.repo.name, String(req.number))
      if (!(await exists(repoDir))) {
        onStage('cloning')
        await mkdir(dirname(repoDir), { recursive: true })
        await run('git', ['clone', '--quiet', req.cloneUrl, repoDir])
      }
      onStage('fetching')
      await run('git', ['fetch', '--quiet', 'origin', `pull/${req.number}/head:refs/review/pr/${req.number}`], { cwd: repoDir })
      onStage('checking-out')
      await mkdir(dirname(path), { recursive: true })
      await run('git', ['worktree', 'add', '--detach', path, req.headSha], { cwd: repoDir })
      onStage('ready')
      return { path }
    },

    async remove(path) {
      // `<worktreesDir>/<owner>/<name>/<n>` → `<reposDir>/<owner>/<name>`.
      const [owner, name] = relative(worktreesDir, path).split(sep)
      const repoDir = join(reposDir, owner, name)
      await run('git', ['worktree', 'remove', '--force', path], { cwd: repoDir })
      await run('git', ['worktree', 'prune'], { cwd: repoDir })
    },

    exists,

    async sizeBytes(path) {
      const out = await run('du', ['-sk', path])
      return Number.parseInt(out, 10) * 1024
    },
  }
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  )
}
