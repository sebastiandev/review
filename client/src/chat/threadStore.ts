import type { ChatPart, PermissionAsk, ServerEvent } from '@review/shared'

/** What actually answered the latest assistant turn, from the `chat.turn` event. */
export type ChatTurn = Extract<ServerEvent, { type: 'chat.turn' }>

/** One conversation as the client sees it. */
export type ThreadState = {
  parts: ChatPart[]
  idle: boolean
  permissions: PermissionAsk[]
  error: string | null
  lastTurn: ChatTurn | null
}

/** Every thread by id. Threads absent from the record read as `EMPTY_THREAD`. */
export type ThreadsState = Record<string, ThreadState>

export const EMPTY_THREAD: ThreadState = { parts: [], idle: true, permissions: [], error: null, lastTurn: null }

function upsert(parts: ChatPart[], part: ChatPart): ChatPart[] {
  const index = parts.findIndex((p) => p.id === part.id)
  if (index < 0) return [...parts, part]
  const next = parts.slice()
  next[index] = part
  return next
}

function patch(state: ThreadsState, id: string, change: (thread: ThreadState) => Partial<ThreadState>): ThreadsState {
  const thread = state[id] ?? EMPTY_THREAD
  return { ...state, [id]: { ...thread, ...change(thread) } }
}

/** Folds one server event into the thread it names; other threads are untouched, unknown types ignored. */
export function applyEvent(state: ThreadsState, event: ServerEvent): ThreadsState {
  switch (event.type) {
    case 'chat.part':
      return patch(state, event.thread, (t) => ({ parts: upsert(t.parts, event.part) }))
    case 'chat.idle':
      return patch(state, event.thread, () => ({ idle: true }))
    case 'chat.turn':
      return patch(state, event.thread, () => ({ lastTurn: event }))
    case 'chat.error':
      return patch(state, event.thread, () => ({ error: event.message, idle: true }))
    case 'permission.ask':
      return patch(state, event.thread, (t) => ({
        permissions: [...t.permissions.filter((p) => p.id !== event.permission.id), event.permission],
      }))
    case 'permission.done':
      return removePermission(state, event.thread, event.permissionID)
    default:
      // Newer servers may emit event types this client does not know yet.
      return state
  }
}

/** Merges loaded history into a thread, keeping any parts that already streamed in. */
export function applyHistory(state: ThreadsState, id: string, history: ChatPart[]): ThreadsState {
  return patch(state, id, (t) => ({ parts: history.reduce(upsert, t.parts) }))
}

/** Marks a thread busy with no error; the send just started. */
export function markSending(state: ThreadsState, id: string): ThreadsState {
  return patch(state, id, () => ({ idle: false, error: null }))
}

/** Records a client-side failure and returns the thread to idle. */
export function markFailed(state: ThreadsState, id: string, message: string): ThreadsState {
  return patch(state, id, () => ({ error: message, idle: true }))
}

/** Drops one permission ask from a thread. */
export function removePermission(state: ThreadsState, id: string, permissionID: string): ThreadsState {
  return patch(state, id, (t) => ({ permissions: t.permissions.filter((p) => p.id !== permissionID) }))
}
