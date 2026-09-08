import type { AccountRepo, RepoSummary } from '@review/shared'

/** Account repos not yet tracked, so the picker never offers a duplicate. */
export function untrackedAccountRepos(account: AccountRepo[], repos: Pick<RepoSummary, 'owner' | 'name' | 'tracked'>[]): AccountRepo[] {
  const tracked = new Set(repos.filter((r) => r.tracked).map((r) => `${r.owner}/${r.name}`))
  return account.filter((r) => !tracked.has(`${r.owner}/${r.name}`))
}

/** `owner/name` → its parts, or null when the text is not exactly two slash-separated segments. */
export function parseRepoSlug(text: string): { owner: string; name: string } | null {
  const m = /^\s*([^\s/]+)\/([^\s/]+)\s*$/.exec(text)
  if (!m) return null
  const [, owner = '', name = ''] = m
  return { owner, name }
}
