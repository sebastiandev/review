import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { ServerEvent } from '@review/shared'

type Listener = (event: ServerEvent) => void

type EventsContextValue = { subscribe: (listener: Listener) => () => void }

const EventsContext = createContext<EventsContextValue | null>(null)

/** Holds the single `/api/events` EventSource and fans every event out to the subscribed hooks. */
export function ServerEventsProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>())

  useEffect(() => {
    const source = new EventSource('/api/events')
    // Named `ping` events keep the proxy alive and never reach onmessage.
    source.onmessage = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as ServerEvent
      for (const listener of listeners.current) listener(event)
    }
    return () => source.close()
  }, [])

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  const value = useMemo(() => ({ subscribe }), [subscribe])
  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
}

/** Calls `handler` for every server event. The latest handler is always used; no resubscribe on change. */
export function useServerEvent(handler: Listener): void {
  const context = useContext(EventsContext)
  if (!context) throw new Error('useServerEvent needs a ServerEventsProvider')
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => context.subscribe((event) => latest.current(event)), [context])
}
