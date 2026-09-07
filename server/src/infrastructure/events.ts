import type { ServerEvent } from '@review/shared'
import type { Events } from '../domain/ports.ts'

/** In-process `Events`: synchronous fan-out to every subscriber. */
export function eventBus(): Events {
  const listeners = new Set<(e: ServerEvent) => void>()
  return {
    emit(e) {
      listeners.forEach((l) => l(e))
    },
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}
