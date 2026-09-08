import { describe, expect, it } from 'vitest'
import { parseRepoSlug, untrackedAccountRepos } from './accountRepos'

describe('untrackedAccountRepos', () => {
  const account = [
    { owner: 'acme', name: 'widgets', openPrCount: 2 },
    { owner: 'acme', name: 'gadgets', openPrCount: 0 },
    { owner: 'seba', name: 'atelier', openPrCount: 1 },
  ]

  it('drops repos that are currently tracked', () => {
    const repos = [{ owner: 'acme', name: 'widgets', tracked: true }]
    expect(untrackedAccountRepos(account, repos).map((r) => r.name)).toEqual(['gadgets', 'atelier'])
  })

  it('keeps repos that were untracked again', () => {
    const repos = [{ owner: 'acme', name: 'widgets', tracked: false }]
    expect(untrackedAccountRepos(account, repos)).toEqual(account)
  })
})

describe('parseRepoSlug', () => {
  it.each([
    ['acme/widgets', { owner: 'acme', name: 'widgets' }],
    ['  acme/widgets ', { owner: 'acme', name: 'widgets' }],
    ['widgets', null],
    ['acme/widgets/extra', null],
    ['', null],
  ])('%j → %j', (text, expected) => {
    expect(parseRepoSlug(text)).toEqual(expected)
  })
})
