import { mkdtemp, mkdir, writeFile, rename, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { buildDiffDocument } from '../../domain/diff.ts'
import type { RepoRef } from '../../domain/pullRequests.ts'
import { execFileRunner, type Runner } from '../process.ts'
import { ghProvider } from './ghProvider.ts'
import { gitPullRequestDiff } from './gitPullRequestDiff.ts'
import { withGithubToken } from './oauthDeviceFlow.ts'
import { syncRepo } from '../../domain/commands/syncRepo.ts'
import { fakeProvider, fakeWorktrees, fixedClock, memoryEvents, NOW, openTestStore, remotePr, SAMPLE_PATCH } from '../../domain/testing/fakes.ts'

const repo: RepoRef = { provider: 'github', owner: 'acme', name: 'widgets' }
const addedPaths = Array.from({ length: 305 }, (_, i) => `src/file-${i}.txt`)
const identity = { GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' }
let root: string
let upstream: string
let baseSha: string
let headSha: string

/** Real Git against a disposable upstream; identity is scoped to the process environment. */
function git(args: string[]) { return execFileRunner('git', args, { cwd: upstream, env: identity }) }

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'review-large-diff-'))
  upstream = join(root, 'upstream')
  await mkdir(upstream)
  await git(['init', '--quiet', '--initial-branch=main'])
  await Promise.all([
    writeFile(join(upstream, 'changed.txt'), 'old\n'),
    writeFile(join(upstream, 'deleted.txt'), 'removed\n'),
    writeFile(join(upstream, 'before.txt'), 'same content, different name\n'),
    writeFile(join(upstream, 'binary.bin'), Buffer.from([0, 1, 2, 3])),
  ])
  await git(['add', '.'])
  await git(['commit', '--quiet', '-m', 'base'])
  await git(['checkout', '--quiet', '-b', 'feature'])
  await mkdir(join(upstream, 'src'))
  await Promise.all(addedPaths.map((path) => writeFile(join(upstream, path), `content for ${path}\n`)))
  await writeFile(join(upstream, 'changed.txt'), 'new\n')
  await writeFile(join(upstream, 'binary.bin'), Buffer.from([0, 4, 5, 6]))
  await rename(join(upstream, 'before.txt'), join(upstream, 'after.txt'))
  await rm(join(upstream, 'deleted.txt'))
  await git(['add', '-A'])
  await git(['commit', '--quiet', '-m', 'large feature'])
  headSha = (await git(['rev-parse', 'HEAD'])).trim()
  // The base advances independently: the PR diff must compare against the merge base.
  await git(['checkout', '--quiet', 'main'])
  await writeFile(join(upstream, 'base-only.txt'), 'not part of the PR\n')
  await git(['add', '.'])
  await git(['commit', '--quiet', '-m', 'advance base'])
  baseSha = (await git(['rev-parse', 'HEAD'])).trim()
})

afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }) })

/** Substitute GitHub's HTTP/credential responses and remote URL; every Git operation is real. */
function localGithub(failFirstClone = false) {
  const calls: { cmd: string; args: string[]; opts?: Parameters<Runner>[2] }[] = []
  let cloneFailed = false
  const shell: Runner = async (cmd, args, opts) => {
    calls.push({ cmd, args, opts })
    if (cmd === 'gh' && args[0] === 'pr') throw new Error('HTTP 406: Sorry, the diff exceeded the maximum number of files (300). PullRequest.diff too_large')
    if (cmd === 'gh' && args[0] === 'auth') return `${opts?.env?.GH_TOKEN}\n`
    if (failFirstClone && args.includes('clone') && !cloneFailed) {
      cloneFailed = true
      throw new Error('connection reset by peer')
    }
    return execFileRunner(cmd, args.map((arg) => arg === 'https://github.com/acme/widgets.git' ? pathToFileURL(upstream).href : arg), opts)
  }
  return { calls, run: withGithubToken(shell, () => 'fixture-token') }
}

it('falls back end to end to a complete merge-base diff exceeding 300 files', async () => {
  const { run, calls } = localGithub()
  const provider = ghProvider(run, gitPullRequestDiff({ run, cacheDir: join(root, 'complete') }))
  const patch = await provider.diff(repo, 415, { baseSha, headSha })
  const doc = buildDiffDocument({ kind: 'pr', repo: 'acme/widgets', number: 415, headSha }, patch)
  expect(doc.files.map((f) => f.path).sort()).toEqual([...addedPaths, 'changed.txt', 'deleted.txt', 'after.txt', 'binary.bin'].sort())
  expect(doc.files).toContainEqual(expect.objectContaining({ path: 'after.txt', status: 'renamed' }))
  expect(doc.files).toContainEqual(expect.objectContaining({ path: 'deleted.txt', status: 'deleted' }))
  expect(doc.anchors[addedPaths.at(-1)!]).toEqual([1])
  expect(doc.files.some((f) => f.path === 'base-only.txt')).toBe(false)
  const gitCalls = calls.filter((c) => c.cmd === 'git')
  expect(gitCalls.every((c) => c.opts?.env?.GH_TOKEN === 'fixture-token')).toBe(true)
  expect(gitCalls.every((c) => !c.args.join(' ').includes('fixture-token'))).toBe(true)
})

it('serializes concurrent requests into one reusable bare clone', async () => {
  const { run, calls } = localGithub()
  const cacheDir = join(root, 'concurrent')
  const diff = gitPullRequestDiff({ run, cacheDir })
  const [first, second] = await Promise.all([diff(repo, 415, { baseSha, headSha }), diff(repo, 416, { baseSha, headSha })])
  expect(second).toBe(first)
  expect(calls.filter((c) => c.args.includes('clone'))).toHaveLength(1)
  expect((await execFileRunner('git', ['rev-parse', '--is-bare-repository'], { cwd: join(cacheDir, 'acme', 'widgets.git') })).trim()).toBe('true')
  expect((await git(['rev-parse', 'HEAD'])).trim()).toBe(baseSha)
  expect(await git(['status', '--porcelain'])).toBe('')
})

it('syncs an oversized PR and still records another PR becoming merged', async () => {
  const test = await openTestStore()
  try {
    const { run } = localGithub()
    const remote: Runner = (cmd, args, opts) => cmd === 'gh' && args[0] === 'pr' && args[2] === '416'
      ? Promise.resolve(SAMPLE_PATCH) : run(cmd, args, opts)
    const github = ghProvider(remote, gitPullRequestDiff({ run, cacheDir: join(root, 'sync') }))
    const provider = fakeProvider([
      remotePr({ number: 415, baseSha, headSha }),
      remotePr({ number: 416, state: 'merged' }),
    ])
    provider.diff = github.diff
    const storedRepo = test.store.repos.insert({ ...repo, tracked: true, autoReview: false, syncedAt: null, syncError: null })
    test.store.pullRequests.upsert(storedRepo.id, remotePr({ number: 416, state: 'open' }), {}, NOW)
    const events = memoryEvents()

    const result = await syncRepo({ store: test.store, providers: { github: provider, gitlab: provider }, worktrees: fakeWorktrees(), clock: fixedClock(), events }, { repoId: storedRepo.id })

    expect(result).toMatchObject({ added: 1, updated: 1 })
    expect(test.store.pullRequests.find(storedRepo.id, 416)?.state).toBe('merged')
    const large = test.store.pullRequests.find(storedRepo.id, 415)!
    expect(test.store.diffs.get(large.id, headSha)?.files).toHaveLength(addedPaths.length + 4)
    expect(test.store.repos.get(storedRepo.id)?.syncError).toBeNull()
    expect(events.ofType('sync.finished')).toHaveLength(1)
  } finally {
    await test.close()
  }
})

it('cleans up a failed clone and permits the next sync to retry', async () => {
  const { run } = localGithub(true)
  const cacheDir = join(root, 'retry')
  const diff = gitPullRequestDiff({ run, cacheDir })
  await expect(diff(repo, 415, { baseSha, headSha })).rejects.toThrow('connection reset by peer')
  expect(await readdir(join(cacheDir, 'acme'))).toEqual([])
  expect(await diff(repo, 415, { baseSha, headSha })).toContain('diff --git')
  expect(await readdir(join(cacheDir, 'acme'))).toEqual(['widgets.git'])
})

it('refuses invalid revision IDs before invoking Git', async () => {
  const { run, calls } = localGithub()
  await expect(gitPullRequestDiff({ run, cacheDir: join(root, 'invalid') })(repo, 415, { baseSha, headSha: '--bad-ref' })).rejects.toThrow('invalid base/head commit')
  expect(calls).toEqual([])
})
