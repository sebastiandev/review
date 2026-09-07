import { useCallback, useEffect, useState } from 'react'
import type { ChatPart, ChatSendRequest, PermissionAsk, PermissionReply, ServerEvent } from '@revu/shared'
import { fetchChatHistory, replyPermission, sendChat } from '../api'

/** What actually answered the latest assistant turn, from the `chat.turn` event. */
export type ChatTurn = Extract<ServerEvent, { type: 'chat.turn' }>

export type ChatState = {
  parts: ChatPart[]
  idle: boolean
  permissions: PermissionAsk[]
  error: string | null
  lastTurn: ChatTurn | null
  send: (request: ChatSendRequest) => Promise<void>
  answerPermission: (id: string, response: PermissionReply) => Promise<void>
}

function upsert(parts: ChatPart[], part: ChatPart): ChatPart[] {
  const index = parts.findIndex((p) => p.id === part.id)
  if (index < 0) return [...parts, part]
  const next = parts.slice()
  next[index] = part
  return next
}

/** Chat session state fed by /api/events, with history loaded on mount. */
export function useChat(): ChatState {
  const [parts, setParts] = useState<ChatPart[]>([])
  const [idle, setIdle] = useState(true)
  const [permissions, setPermissions] = useState<PermissionAsk[]>([])
  const [error, setError] = useState<string | null>(null)
  const [lastTurn, setLastTurn] = useState<ChatTurn | null>(null)

  useEffect(() => {
    fetchChatHistory()
      .then((history) => setParts((current) => history.reduce(upsert, current)))
      .catch((e: unknown) => setError(String(e)))
  }, [])

  useEffect(() => {
    const source = new EventSource('/api/events')
    source.onmessage = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as ServerEvent
      switch (event.type) {
        case 'chat.part':
          setParts((current) => upsert(current, event.part))
          break
        case 'chat.idle':
          setIdle(true)
          break
        case 'chat.turn':
          setLastTurn(event)
          break
        case 'chat.error':
          setError(event.message)
          setIdle(true)
          break
        case 'permission.ask':
          setPermissions((current) => [...current.filter((p) => p.id !== event.permission.id), event.permission])
          break
        case 'permission.done':
          setPermissions((current) => current.filter((p) => p.id !== event.permissionID))
          break
        default:
          // Newer servers may emit event types this client does not know yet.
          break
      }
    }
    return () => source.close()
  }, [])

  const send = useCallback(async (request: ChatSendRequest) => {
    setError(null)
    setIdle(false)
    try {
      await sendChat(request)
    } catch (e: unknown) {
      setError(String(e))
      setIdle(true)
    }
  }, [])

  const answerPermission = useCallback(async (id: string, response: PermissionReply) => {
    await replyPermission(id, response)
    setPermissions((current) => current.filter((p) => p.id !== id))
  }, [])

  return { parts, idle, permissions, error, lastTurn, send, answerPermission }
}
