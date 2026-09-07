import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WorktreeRequest } from '../domain/worktrees.ts'
import { gitWorktrees } from './gitWorktrees.ts'
import type { Runner } from './process.ts'

type Call = { cmd: string; args: string[]; cwd?: string }

describe('gitWorktrees', () => {
  let cacheDir: string
  let calls: Call[]
  let run: Runner
  const req: WorktreeRequest = {
    repo: { provider: 'github', owner: 'acme', name: 'widgets' },
    cloneUrl: 'https://github.com/acme/widgets.git',
    number: 415,
    headRef: 'feat/store',
    headSha: '9f2c1c3e',
  }

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'review-wt-'))
    calls = []
    run = async (cmd, args, opts) => {
      calls.push({ cmd, args, cwd: opts?.cwd })
      return cmd === 'du' ? '2048\t/some/path\n' : ''
    }
  })
  afterEach(() => rm(cacheDir, { recursive: true, force: true }))

  it('clones on first use, then fetches the PR head and adds a detached worktree, reporting each stage', async () => {
    const stages: string[] = []
    const { path } = await gitWorktrees({ cacheDir, run }).create(req, (s) => stages.push(s))

    const repoDir = join(cacheDir, 'repos', 'acme', 'widgets')
    expect(path).toBe(join(cacheDir, 'worktrees', 'acme', 'widgets', '415'))
    expect(stages).toEqual(['cloning', 'fetching', 'checking-out', 'ready'])
    expect(calls).toEqual([
      { cmd: 'git', args: ['clone', '--quiet', req.cloneUrl, repoDir], cwd: undefined },
      { cmd: 'git', args: ['fetch', '--quiet', 'origin', 'pull/415/head:refs/review/pr/415'], cwd: repoDir },
      { cmd: 'git', args: ['worktree', 'add', '--detach', path, '9f2c1c3e'], cwd: repoDir },
    ])
  })

  it('skips the clone when the repo dir already exists', async () => {
    await mkdir(join(cacheDir, 'repos', 'acme', 'widgets'), { recursive: true })
    const stages: string[] = []
    await gitWorktrees({ cacheDir, run }).create(req, (s) => stages.push(s))
    expect(stages).toEqual(['fetching', 'checking-out', 'ready'])
    expect(calls.map((c) => c.args[0])).toEqual(['fetch', 'worktree'])
  })

  it('remove runs from the repo clone and prunes', async () => {
    const path = join(cacheDir, 'worktrees', 'acme', 'widgets', '415')
    await gitWorktrees({ cacheDir, run }).remove(path)
    const repoDir = join(cacheDir, 'repos', 'acme', 'widgets')
    expect(calls).toEqual([
      { cmd: 'git', args: ['worktree', 'remove', '--force', path], cwd: repoDir },
      { cmd: 'git', args: ['worktree', 'prune'], cwd: repoDir },
    ])
  })

  it('exists reflects the filesystem', async () => {
    const wt = gitWorktrees({ cacheDir, run })
    expect(await wt.exists(join(cacheDir, 'nope'))).toBe(false)
    expect(await wt.exists(cacheDir)).toBe(true)
  })

  it('sizeBytes converts du kilobytes', async () => {
    expect(await gitWorktrees({ cacheDir, run }).sizeBytes('/some/path')).toBe(2048 * 1024)
  })

  it('propagates a failing git command', async () => {
    run = async () => {
      throw new Error('git clone failed: repository not found')
    }
    await expect(gitWorktrees({ cacheDir, run }).create(req, () => {})).rejects.toThrow('repository not found')
  })
})
