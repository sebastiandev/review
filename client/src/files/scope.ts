import type { DiffSourceRef } from '@revu/shared'

export type ScopeKind = 'working tree' | 'folder' | 'patch file'

/** Kind label for the scope selector. A repo source is a working tree; the server does not distinguish sub-folders. */
export function scopeKind(source: DiffSourceRef): ScopeKind {
  return source.kind === 'patch' ? 'patch file' : 'working tree'
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
