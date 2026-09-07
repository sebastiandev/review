import type { DiffSourceRef } from '@review/shared'

export type ScopeKind = 'working tree' | 'folder' | 'patch file' | 'pull request'

/** Kind label for the scope selector. A repo source is a working tree; the server does not distinguish sub-folders. */
export function scopeKind(source: DiffSourceRef): ScopeKind {
  switch (source.kind) {
    case 'patch':
      return 'patch file'
    case 'repo':
      return 'working tree'
    case 'pr':
      return 'pull request'
  }
}

/** What identifies the scope to the user: the path on disk, or `owner/name#n` for a PR. */
export function scopeLabel(source: DiffSourceRef): string {
  return source.kind === 'pr' ? `${source.repo}#${source.number}` : source.path
}

/** Last path segment. */
export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** Directory part including the trailing slash, or '' for a bare filename. */
export function dirname(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut < 0 ? '' : path.slice(0, cut + 1)
}
