import type {
  AppConfig,
  ChatPart,
  ChatSendRequest,
  ChatThreadRef,
  DiffDocument,
  DiffSelection,
  PermissionReply,
} from '@review/shared'

export type FileContent = { path: string; content: string }

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

/** The scope diff mode serves. PR mode uses `pr:<id>`. */
export const LOCAL_SCOPE = 'local'

/** Scope ids contain `:`; they travel as one path segment. */
const scopePath = (scope: string) => `/api/scopes/${encodeURIComponent(scope)}`

/** Thread ids contain `/` and `:`; they travel as one path segment. */
const threadPath = (scope: string, thread: string) => `${scopePath(scope)}/chat/${encodeURIComponent(thread)}`

/** The diff the scope is reviewing. */
export function fetchDiff(scope = LOCAL_SCOPE): Promise<DiffDocument> {
  return requestJson<DiffDocument>(`${scopePath(scope)}/diff`)
}

/** Full new-side content of one changed file. Rejects with a 404 when the source cannot provide it (patch files). */
export function fetchFile(path: string, scope = LOCAL_SCOPE): Promise<FileContent> {
  return requestJson<FileContent>(`${scopePath(scope)}/file?path=${encodeURIComponent(path)}`)
}

/** Agents, models and commands opencode offers, plus server settings. */
export function fetchConfig(): Promise<AppConfig> {
  return requestJson<AppConfig>('/api/config')
}

/** Every thread the server knows: `dock` plus the line threads created so far. */
export function fetchThreads(scope = LOCAL_SCOPE): Promise<ChatThreadRef[]> {
  return requestJson<ChatThreadRef[]>(`${scopePath(scope)}/threads`)
}

/** The thread anchored to `anchor`'s start line, created on first use. */
export function createLineThread(anchor: DiffSelection, scope = LOCAL_SCOPE): Promise<ChatThreadRef> {
  return requestJson<ChatThreadRef>(`${scopePath(scope)}/threads/line`, jsonInit(anchor))
}

/** Chat parts already produced in one thread. */
export function fetchChatHistory(thread: string, scope = LOCAL_SCOPE): Promise<ChatPart[]> {
  return requestJson<ChatPart[]>(`${threadPath(scope, thread)}/history`)
}

/** Sends a user turn to one thread; the reply streams over /api/events. */
export function sendChat(thread: string, body: ChatSendRequest, scope = LOCAL_SCOPE): Promise<void> {
  return postJson(threadPath(scope, thread), body)
}

/** Answers a pending permission ask in one thread. */
export function replyPermission(thread: string, id: string, response: PermissionReply, scope = LOCAL_SCOPE): Promise<void> {
  return postJson(`${threadPath(scope, thread)}/permission/${encodeURIComponent(id)}`, { response })
}
