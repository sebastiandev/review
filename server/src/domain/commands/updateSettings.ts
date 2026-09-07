import type { UserSettings } from '@review/shared'
import { DEFAULT_USER_SETTINGS } from '../settings.ts'
import type { Store } from '../store.ts'

export type UpdateSettingsDeps = { store: Pick<Store, 'transaction' | 'settings'> }

/**
 * Merge a partial change into the persisted user settings and return the result.
 * Post-conditions:
 * - the settings row holds every key of `UserSettings` (defaults fill what was never set)
 */
export function updateSettings(deps: UpdateSettingsDeps, patch: Partial<UserSettings>): UserSettings {
  const { store } = deps
  return store.transaction(() => {
    const next: UserSettings = { ...DEFAULT_USER_SETTINGS, ...store.settings.read(), ...patch }
    store.settings.write(next)
    return next
  })
}
