import type { ServerEvent } from '@review/shared'

/** ISO timestamp of now. Injected so Commands are deterministic under test. */
export type Clock = () => string

/** Process-wide event bus behind /api/events. */
export type Events = {
  emit(e: ServerEvent): void
  subscribe(l: (e: ServerEvent) => void): () => void
}
