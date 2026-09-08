import { describe, expect, it } from 'vitest'
import type { AccountInfo } from '@review/shared'
import { countdown } from './ConnectModal'
import { accountMeta } from './Settings'

const base: AccountInfo = { provider: 'github', phase: 'disconnected', login: null, scopes: [], source: null, deviceFlowAvailable: true, pending: null }

describe('accountMeta', () => {
  it.each<[string, Partial<AccountInfo>, string]>([
    ['disconnected', {}, 'Not connected'],
    ['pending', { phase: 'pending' }, 'Waiting for authorization…'],
    ['oauth with scopes', { phase: 'connected', login: 'seba', scopes: ['repo', 'read:org'], source: 'oauth' }, 'seba · repo, read:org'],
    ['borrowed from gh, no scope header', { phase: 'connected', login: 'seba', source: 'cli' }, 'seba · via gh'],
  ])('%s', (_, patch, expected) => {
    expect(accountMeta({ ...base, ...patch })).toBe(expected)
  })
})

describe('countdown', () => {
  const now = Date.parse('2026-09-07T10:00:00.000Z')
  it.each([
    ['2026-09-07T10:14:32.000Z', '14:32'],
    ['2026-09-07T10:00:05.000Z', '0:05'],
    ['2026-09-07T09:59:00.000Z', 'expired'],
  ])('%s → %s', (iso, text) => {
    expect(countdown(iso, now)).toBe(text)
  })
})
