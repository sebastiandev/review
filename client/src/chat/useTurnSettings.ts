import { useCallback, useEffect, useState } from 'react'
import type { ModelRef, TurnSettings } from '@review/shared'

const STORAGE_KEY = 'review.turnSettings'

export type TurnSettingsState = {
  settings: TurnSettings
  setAgent: (agent: string | undefined) => void
  /** `variants` are the ones the new model offers; a variant it does not offer is dropped. */
  setModel: (model: ModelRef, variants: string[]) => void
  setVariant: (variant: string | undefined) => void
}

/** Settings with `model` replaced; `variant` survives only if the new model offers it. */
export function withModel(settings: TurnSettings, model: ModelRef, variants: string[]): TurnSettings {
  const variant = settings.variant !== undefined && variants.includes(settings.variant) ? settings.variant : undefined
  return { ...settings, model, variant }
}

function storedSettings(): TurnSettings {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as TurnSettings
  } catch {
    return {}
  }
}

/** Who answers the next turn (agent, model, variant), persisted in localStorage. */
export function useTurnSettings(): TurnSettingsState {
  const [settings, setSettings] = useState<TurnSettings>(storedSettings)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const setAgent = useCallback((agent: string | undefined) => setSettings((s) => ({ ...s, agent })), [])
  const setModel = useCallback(
    (model: ModelRef, variants: string[]) => setSettings((s) => withModel(s, model, variants)),
    [],
  )
  const setVariant = useCallback((variant: string | undefined) => setSettings((s) => ({ ...s, variant })), [])

  return { settings, setAgent, setModel, setVariant }
}
