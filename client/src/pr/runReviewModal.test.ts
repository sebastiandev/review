import { describe, expect, it } from 'vitest'
import type { UserSettings } from '@review/shared'
import { initialOptions } from './RunReviewModal'

const settings: UserSettings = {
  pollInterval: 5,
  lookbackDays: 30,
  autoReviewOnFetch: false,
  defaultReviewAgent: 'pr-reviewer',
  defaultModel: { providerID: 'anthropic', modelID: 'claude-sonnet-4' },
  defaultVariant: 'high',
  theme: 'nocturne',
  styleMode: 'framed',
  diffTheme: 'nocturne',
  codeFont: 'jetbrains-mono',
  previewLines: 2,
  threadsDefault: 'unread',
  defaultDiffMode: 'unified',
}

describe('initialOptions', () => {
  it('starts from the settings defaults on a first run', () => {
    expect(initialOptions(null, settings)).toEqual({ agent: 'pr-reviewer', model: settings.defaultModel, variant: 'high' })
  })

  it('starts from the previous run when re-running', () => {
    const previous = { agent: 'strict', model: null, variant: null }
    expect(initialOptions(previous, settings)).toEqual(previous)
  })

  it('is empty before the settings load', () => {
    expect(initialOptions(null, undefined)).toEqual({ agent: '', model: null, variant: null })
  })
})
