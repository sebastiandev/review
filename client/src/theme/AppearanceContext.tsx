import { createContext, useContext } from 'react'
import type { DiffTheme } from './useTheme'

/** Appearance state the diff toolbar shares with the app root: the diff theme (also picked in Settings) and focus mode. */
export type Appearance = {
  diffTheme: DiffTheme
  onDiffTheme: (theme: DiffTheme) => void
  /** Focus mode as it applies right now (only inside the workspace). */
  focus: boolean
  onToggleFocus: () => void
}

const AppearanceContext = createContext<Appearance | null>(null)

export const AppearanceProvider = AppearanceContext.Provider

/** The appearance state; null outside `AppearanceProvider` (tests, isolated renders). */
export function useAppearance(): Appearance | null {
  return useContext(AppearanceContext)
}
