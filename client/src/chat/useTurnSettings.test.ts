import { describe, expect, it } from 'vitest'
import { withModel } from './useTurnSettings'

const opus = { providerID: 'anthropic', modelID: 'claude-opus-4' }
const gpt = { providerID: 'openai', modelID: 'gpt-5' }

describe('withModel', () => {
  it('keeps the variant when the new model offers it', () => {
    expect(withModel({ model: opus, variant: 'high' }, gpt, ['low', 'high'])).toEqual({ model: gpt, variant: 'high' })
  })

  it('clears the variant when the new model does not offer it', () => {
    expect(withModel({ model: opus, variant: 'max' }, gpt, ['low', 'high'])).toEqual({ model: gpt, variant: undefined })
  })

  it('clears the variant when the new model has no variants', () => {
    expect(withModel({ variant: 'high' }, gpt, [])).toEqual({ model: gpt, variant: undefined })
  })

  it('leaves the agent untouched', () => {
    expect(withModel({ agent: 'plan' }, gpt, [])).toEqual({ agent: 'plan', model: gpt, variant: undefined })
  })
})
