import { useCallback, useEffect, useState } from 'react'

export type Mode = 'pr' | 'diff'

const MODE_KEY = 'review.mode'

function storedMode(): Mode {
  return localStorage.getItem(MODE_KEY) === 'diff' ? 'diff' : 'pr'
}

export type ModeState = {
  mode: Mode
  /** False while the probe is pending or when the server was started with `review diff`. */
  prAvailable: boolean
  /** True once the probe answered: PR routes exist or they do not. */
  probed: boolean
  setMode: (mode: Mode) => void
}

/**
 * The user's mode, persisted. `prAvailable` comes from the `/api/repos` probe: while unknown or
 * absent the effective mode is Diff regardless of the stored preference.
 */
export function useMode(probe: { isSuccess: boolean; isError: boolean }): ModeState {
  const [preference, setPreference] = useState<Mode>(storedMode)

  useEffect(() => {
    localStorage.setItem(MODE_KEY, preference)
  }, [preference])

  const setMode = useCallback((mode: Mode) => setPreference(mode), [])

  const prAvailable = probe.isSuccess
  return { mode: prAvailable ? preference : 'diff', prAvailable, probed: probe.isSuccess || probe.isError, setMode }
}
