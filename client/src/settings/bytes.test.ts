import { describe, expect, it } from 'vitest'
import { formatBytes } from './bytes'

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [284_000_000, '284 MB'],
    [1_200_000_000, '1.2 GB'],
    [2_000_000_000, '2 GB'],
    [3_450_000_000_000, '3.5 TB'],
  ])('%d → %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text)
  })
})
