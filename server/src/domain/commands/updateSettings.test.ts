import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_USER_SETTINGS } from '../settings.ts'
import type { Store } from '../store.ts'
import { openTestStore } from '../testing/fakes.ts'
import { updateSettings } from './updateSettings.ts'

describe('updateSettings', () => {
  let store: Store
  let close: () => Promise<void>

  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
  })
  afterEach(() => close())

  it('merges the patch over the defaults on first write', () => {
    const result = updateSettings({ store }, { pollInterval: 15 })
    expect(result).toEqual({ ...DEFAULT_USER_SETTINGS, pollInterval: 15 })
    expect(store.settings.read()).toEqual(result)
  })

  it('keeps earlier changes when patching another key', () => {
    updateSettings({ store }, { pollInterval: 'manual' })
    const result = updateSettings({ store }, { theme: 'nocturne' })
    expect(result).toMatchObject({ pollInterval: 'manual', theme: 'nocturne' })
  })
})
