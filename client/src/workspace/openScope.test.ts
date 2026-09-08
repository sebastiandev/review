import { describe, expect, it } from 'vitest'
import { rememberScope } from './OpenScopeForm'

describe('rememberScope', () => {
  it('puts the path first and drops its older copy', () => {
    expect(rememberScope(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c'])
  })

  it('caps the list at six', () => {
    expect(rememberScope(['1', '2', '3', '4', '5', '6'], '0')).toEqual(['0', '1', '2', '3', '4', '5'])
  })
})
