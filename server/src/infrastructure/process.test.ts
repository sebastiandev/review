import { describe, expect, it } from 'vitest'
import { execFileRunner } from './process.ts'

describe('execFileRunner', () => {
  it('puts stdout in the error, where gh api prints the response body', async () => {
    const run = execFileRunner('sh', ['-c', 'echo \'{"message":"Validation Failed"}\'; echo "gh: Unprocessable Entity (HTTP 422)" >&2; exit 1'])
    await expect(run).rejects.toThrow(/HTTP 422\)\n\{"message":"Validation Failed"\}/)
  })
})
