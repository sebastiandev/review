import type {
  AppConfig,
  ChatPart,
  ChatSendRequest,
  ChatThreadRef,
  DiffDocument,
  DiffSelection,
  PermissionReply,
} from '@review/shared'

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} -> ${res.status}`)
  return (await res.json()) as T
}

const jsonInit = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, jsonInit(body))
  if (!res.ok) throw new Error(`POST ${url} -> ${res.status}`)
}

/** Thread ids contain `/` and `:`; they travel as one path segment. */
const threadPath = (thread: string) => `/api/chat/${encodeURIComponent(thread)}`

/** The diff the session is reviewing. */
export function fetchDiff(): Promise<DiffDocument> {
  return requestJson<DiffDocument>('/api/diff')
}

/** Agents, models and commands opencode offers, plus server settings. */
export function fetchConfig(): Promise<AppConfig> {
  return requestJson<AppConfig>('/api/config')
}

/** Every thread the server knows: `dock` plus the line threads created so far. */
export function fetchThreads(): Promise<ChatThreadRef[]> {
  return requestJson<ChatThreadRef[]>('/api/threads')
}

/** The thread anchored to `anchor`'s start line, created on first use. */
export function createLineThread(anchor: DiffSelection): Promise<ChatThreadRef> {
  return requestJson<ChatThreadRef>('/api/threads/line', jsonInit(anchor))
}

/** Chat parts already produced in one thread. */
export function fetchChatHistory(thread: string): Promise<ChatPart[]> {
  return requestJson<ChatPart[]>(`${threadPath(thread)}/history`)
}

/** Sends a user turn to one thread; the reply streams over /api/events. */
export function sendChat(thread: string, body: ChatSendRequest): Promise<void> {
  return postJson(threadPath(thread), body)
}

/** Answers a pending permission ask in one thread. */
export function replyPermission(thread: string, id: string, response: PermissionReply): Promise<void> {
  return postJson(`${threadPath(thread)}/permission/${encodeURIComponent(id)}`, { response })
}
