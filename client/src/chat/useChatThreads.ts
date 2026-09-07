import { useCallback, useEffect, useState } from 'react'
import type { ChatSendRequest, ChatThreadRef, DiffSelection, PermissionReply, ServerEvent } from '@review/shared'
import { LOCAL_SCOPE, createLineThread, fetchChatHistory, fetchThreads, replyPermission, sendChat } from '../api'
import {
  EMPTY_THREAD,
  applyEvent,
  applyHistory,
  markFailed,
  markSending,
  removePermission,
  type ThreadState,
  type ThreadsState,
} from './threadStore'

export const DOCK_THREAD = 'dock'

export type ChatThreads = {
  /** Threads the client shows: `dock` plus line threads not closed in this session. */
  refs: ChatThreadRef[]
  thread: (id: string) => ThreadState
  send: (id: string, request: ChatSendRequest) => Promise<void>
  loadHistory: (id: string) => Promise<void>
  respondPermission: (id: string, permissionID: string, reply: PermissionReply) => Promise<void>
  /** Get-or-create the thread anchored to `anchor`'s start line and load its history. */
  openLineThread: (anchor: DiffSelection) => Promise<ChatThreadRef>
  /** Hides a thread in this session; the server keeps it and a reload lists it again. */
  forget: (id: string) => void
}

/** Every chat thread of one scope, fed by one /api/events stream, with histories loaded on mount. */
export function useChatThreads(scope: string = LOCAL_SCOPE): ChatThreads {
  const [threads, setThreads] = useState<ThreadsState>({})
  const [refs, setRefs] = useState<ChatThreadRef[]>([])

  const loadHistory = useCallback(async (id: string) => {
    try {
      const history = await fetchChatHistory(id, scope)
      setThreads((current) => applyHistory(current, id, history))
    } catch (e: unknown) {
      setThreads((current) => markFailed(current, id, String(e)))
    }
  }, [scope])

  useEffect(() => {
    fetchThreads(scope)
      .then((list) => {
        setRefs(list)
        for (const ref of list) void loadHistory(ref.id)
      })
      .catch((e: unknown) => setThreads((current) => markFailed(current, DOCK_THREAD, String(e))))
  }, [loadHistory, scope])

  useEffect(() => {
    const source = new EventSource('/api/events')
    source.onmessage = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as ServerEvent
      // The bus carries every scope; chat events name theirs.
      if ('scope' in event && event.scope !== scope) return
      setThreads((current) => applyEvent(current, event))
    }
    return () => source.close()
  }, [scope])

  const send = useCallback(
    async (id: string, request: ChatSendRequest) => {
      setThreads((current) => markSending(current, id))
      try {
        await sendChat(id, request, scope)
      } catch (e: unknown) {
        setThreads((current) => markFailed(current, id, String(e)))
      }
    },
    [scope],
  )

  const respondPermission = useCallback(
    async (id: string, permissionID: string, reply: PermissionReply) => {
      await replyPermission(id, permissionID, reply, scope)
      setThreads((current) => removePermission(current, id, permissionID))
    },
    [scope],
  )

  const openLineThread = useCallback(
    async (anchor: DiffSelection) => {
      const ref = await createLineThread(anchor, scope)
      setRefs((current) => (current.some((r) => r.id === ref.id) ? current : [...current, ref]))
      await loadHistory(ref.id)
      return ref
    },
    [loadHistory, scope],
  )

  const forget = useCallback((id: string) => setRefs((current) => current.filter((r) => r.id !== id)), [])

  const thread = useCallback((id: string) => threads[id] ?? EMPTY_THREAD, [threads])

  return { refs, thread, send, loadHistory, respondPermission, openLineThread, forget }
}
