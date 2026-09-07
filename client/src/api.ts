import type { AppConfig, ChatPart, ChatSendRequest, DiffDocument, PermissionReply } from '@revu/shared'

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} -> ${res.status}`)
  return (await res.json()) as T
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${url} -> ${res.status}`)
}

/** The diff the session is reviewing. */
export function fetchDiff(): Promise<DiffDocument> {
  return requestJson<DiffDocument>('/api/diff')
}

/** Agents, models and commands opencode offers, plus server settings. */
export function fetchConfig(): Promise<AppConfig> {
  return requestJson<AppConfig>('/api/config')
}

/** Chat parts already produced in this session. */
export function fetchChatHistory(): Promise<ChatPart[]> {
  return requestJson<ChatPart[]>('/api/chat/history')
}

/** Sends a user turn; the reply streams over /api/events. */
export function sendChat(body: ChatSendRequest): Promise<void> {
  return postJson('/api/chat', body)
}

/** Answers a pending permission ask. */
export function replyPermission(id: string, response: PermissionReply): Promise<void> {
  return postJson(`/api/permission/${encodeURIComponent(id)}`, { response })
}
