import { describe, expect, it } from 'vitest'
import type { DiffSourceRef } from '@review/shared'
import { scopeKind, scopeLabel } from './scope'

describe('scope labels', () => {
  it.each<[DiffSourceRef, string, string]>([
    [{ kind: 'patch', path: '/tmp/x.diff' }, 'patch file', '/tmp/x.diff'],
    [{ kind: 'repo', path: '/src/app', base: 'main' }, 'working tree', '/src/app'],
    [{ kind: 'pr', repo: 'acme/widgets', number: 415, headSha: 'abc' }, 'pull request', 'acme/widgets#415'],
  ])('%o -> %s / %s', (source, kind, label) => {
    expect(scopeKind(source)).toBe(kind)
    expect(scopeLabel(source)).toBe(label)
  })
})
