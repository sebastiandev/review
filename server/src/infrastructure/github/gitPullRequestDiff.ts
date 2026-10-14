import { access, mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PullRequestProvider } from '../../domain/pullRequests.ts'
import type { Runner } from '../process.ts'

/** Full PR patches from pinned revisions in a cached, blob-filtered bare clone. */
export function gitPullRequestDiff({ run, cacheDir }: { run: Runner; cacheDir: string }): PullRequestProvider['diff'] {
  const pending = new Map<string, Promise<string>>()
  return async (repo, number, revision) => {
    for (const sha of [revision.baseSha, revision.headSha]) {
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(sha)) throw new Error('Cannot compute PR diff: missing or invalid base/head commit')
    }
    const slug = `${repo.owner}/${repo.name}`
    const directory = join(cacheDir, repo.owner, `${repo.name}.git`)
    // Clone/fetch/diff share a cache per repo. A failed request must not poison the next one.
    const previous = pending.get(directory) ?? Promise.resolve('')
    const task = previous.catch(() => '').then(async () => {
      console.info(`PR ${slug}#${number}: GitHub diff limit reached; computing the full diff with git`)
      // Uses the same gh account as API requests; credentials never enter command arguments or disk.
      const token = (await run('gh', ['auth', 'token', '--hostname', 'github.com'])).trim()
      const env = { GH_TOKEN: token, GIT_TERMINAL_PROMPT: '0' }
      const git = (args: string[], cwd?: string) => run('git', [
        '-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', ...args,
      ], { cwd, env })
      const exists = await access(join(directory, 'HEAD')).then(() => true, () => false)
      if (!exists) {
        await mkdir(dirname(directory), { recursive: true })
        const temporary = await mkdtemp(`${directory}.clone-`)
        try {
          await git(['clone', '--quiet', '--bare', '--filter=blob:none', '--single-branch', '--no-tags', `https://github.com/${slug}.git`, temporary])
          await rename(temporary, directory)
        } finally {
          await rm(temporary, { recursive: true, force: true })
        }
      }
      await git(['fetch', '--quiet', '--no-tags', '--filter=blob:none', 'origin', revision.baseSha, revision.headSha], directory)
      // Three-dot diff excludes changes that landed only on the base branch, as GitHub PRs do.
      return git(['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--find-renames',
        '--src-prefix=a/', '--dst-prefix=b/', `${revision.baseSha}...${revision.headSha}`, '--'], directory)
    })
    pending.set(directory, task)
    try {
      return await task
    } finally {
      if (pending.get(directory) === task) pending.delete(directory)
    }
  }
}
