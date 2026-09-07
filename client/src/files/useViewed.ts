import { useCallback, useEffect, useState } from 'react'

const KEY_PREFIX = 'revu.viewed:'

function storedViewed(scope: string): Set<string> {
  const raw = localStorage.getItem(KEY_PREFIX + scope)
  if (!raw) return new Set()
  try {
    const parsed: unknown = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [])
  } catch {
    return new Set()
  }
}

type Stored = { scope: string | null; paths: Set<string> }

function load(scope: string | null): Stored {
  return { scope, paths: scope ? storedViewed(scope) : new Set() }
}

export type ViewedState = {
  viewed: ReadonlySet<string>
  toggle: (path: string) => void
}

/** Paths marked viewed, persisted per scope path in localStorage. */
export function useViewed(scope: string | null): ViewedState {
  const [state, setState] = useState<Stored>(() => load(scope))

  useEffect(() => {
    if (state.scope !== scope) setState(load(scope))
  }, [scope, state.scope])

  useEffect(() => {
    if (state.scope) localStorage.setItem(KEY_PREFIX + state.scope, JSON.stringify([...state.paths]))
  }, [state])

  const toggle = useCallback((path: string) => {
    setState((current) => {
      const paths = new Set(current.paths)
      if (paths.has(path)) paths.delete(path)
      else paths.add(path)
      return { scope: current.scope, paths }
    })
  }, [])

  return { viewed: state.scope === scope ? state.paths : new Set(), toggle }
}
