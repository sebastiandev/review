import type { AgentReviewDetail, InboxRow, ModelRef, PrDetail, RepoSummary, ServerEvent } from '@review/shared'

export type PrTarget = { owner: string; name: string; number: number }

/** `https://github.com/o/r/pull/12`, `o/r#12` → parts; null otherwise. */
export function parsePrTarget(text: string): PrTarget | null {
  const url = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/i.exec(text.trim())
  if (url) return { owner: url[1]!, name: url[2]!, number: Number(url[3]) }
  const qualified = /^([^/\s#]+)\/([^/\s#]+)#(\d+)$/.exec(text.trim())
  if (qualified) return { owner: qualified[1]!, name: qualified[2]!, number: Number(qualified[3]) }
  return null
}

export type ReviewOptions = { agent?: string; model?: ModelRef; variant?: string }

type Log = (line: string) => void

/** Thin HTTP client over a running review server; the CLI's `pr` command drives it. */
export class ReviewClient {
  constructor(
    private readonly baseUrl: string,
    private readonly log: Log = () => {},
  ) {}

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } })
    if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`)
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  /** True when a review server answers at the base url. */
  async reachable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/settings`, { signal: AbortSignal.timeout(1500) })
      return res.ok
    } catch {
      return false
    }
  }

  /** Point the running server's `local` scope at a folder or patch file (`review diff` against a live server). */
  async openLocalScope(target: string, base: string | null): Promise<void> {
    await this.json('/api/scopes/local', { method: 'POST', body: JSON.stringify({ target, base }) })
  }

  /** The tracked repo for `target`, tracking it first when needed. */
  async ensureRepo(target: PrTarget): Promise<RepoSummary> {
    const repos = await this.json<RepoSummary[]>('/api/repos')
    const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0
    const found = repos.find((r) => same(r.owner, target.owner) && same(r.name, target.name) && r.tracked)
    if (found) return found
    this.log(`tracking ${target.owner}/${target.name}`)
    return this.json<RepoSummary>('/api/repos', {
      method: 'POST',
      body: JSON.stringify({ provider: 'github', owner: target.owner, name: target.name, autoReview: false }),
    })
  }

  /** The inbox row for the PR, adding it to the inbox when it is not there yet. */
  async ensurePr(repo: RepoSummary, target: PrTarget): Promise<InboxRow> {
    const inbox = await this.json<InboxRow[]>(`/api/repos/${repo.id}/prs`)
    const existing = inbox.find((r) => r.number === target.number)
    if (existing) return existing
    this.log(`adding #${target.number} to the inbox`)
    const added = await this.json<InboxRow[]>(`/api/repos/${repo.id}/prs`, {
      method: 'POST',
      body: JSON.stringify({ numbers: [target.number], reviewOnOpen: false }),
    })
    const row = added.find((r) => r.number === target.number)
    if (!row) throw new Error(`#${target.number} could not be added`)
    return row
  }

  /** Make sure the worktree exists (clone/fetch/checkout), waiting for `worktree.ready`. */
  async ensureWorktree(prId: number): Promise<void> {
    const detail = await this.json<PrDetail>(`/api/prs/${prId}`)
    if (detail.pr.worktreePath) return
    this.log('preparing the worktree…')
    const ready = this.waitFor((e) => (e.type === 'worktree.ready' || e.type === 'worktree.failed') && e.prId === prId)
    await this.json(`/api/prs/${prId}/open`, { method: 'POST' })
    const event = await ready
    if (event.type === 'worktree.failed') throw new Error(`worktree failed: ${event.message}`)
  }

  /** Queue the review and wait for it to end; resolves with the run's detail. */
  async runReview(prId: number, options: ReviewOptions, onStep: (title: string) => void): Promise<AgentReviewDetail> {
    const done = this.waitFor(
      (e) => (e.type === 'review.ready' || e.type === 'review.failed') && e.prId === prId,
      (e) => {
        if (e.type === 'review.progress' && e.prId === prId) onStep(`${e.tool} ${e.title}`)
      },
    )
    const { status } = await this.json<{ status: 'queued' | 'busy' }>(`/api/prs/${prId}/review`, {
      method: 'POST',
      body: JSON.stringify({ agent: options.agent, model: options.model, variant: options.variant }),
    })
    if (status === 'busy') this.log('another review is running; queued behind it')
    const event = await done
    if (event.type === 'review.failed') throw new Error(`review failed: ${event.message}`)
    const detail = await this.json<PrDetail>(`/api/prs/${prId}`)
    if (!detail.agentReview) throw new Error('review finished but no run is recorded')
    return detail.agentReview
  }

  /** Resolve with the first `/api/events` event matching `match`; `each` sees every event meanwhile. */
  private waitFor(match: (e: ServerEvent) => boolean, each: (e: ServerEvent) => void = () => {}): Promise<ServerEvent> {
    return new Promise((resolve, reject) => {
      const controller = new AbortController()
      fetch(`${this.baseUrl}/api/events`, { signal: controller.signal })
        .then(async (res) => {
          const reader = res.body?.getReader()
          if (!reader) throw new Error('event stream unavailable')
          const decoder = new TextDecoder()
          let buffer = ''
          for (;;) {
            const { value, done } = await reader.read()
            if (done) throw new Error('event stream closed')
            buffer += decoder.decode(value, { stream: true })
            const frames = buffer.split('\n\n')
            buffer = frames.pop() ?? ''
            for (const frame of frames) {
              const data = frame
                .split('\n')
                .filter((l) => l.startsWith('data:'))
                .map((l) => l.slice(5).trim())
                .join('')
              if (!data) continue
              const event = JSON.parse(data) as ServerEvent
              each(event)
              if (match(event)) {
                controller.abort()
                resolve(event)
                return
              }
            }
          }
        })
        .catch((e: unknown) => {
          if (!(e instanceof Error && e.name === 'AbortError')) reject(e)
        })
    })
  }
}

const SEVERITY_TAG: Record<AgentReviewDetail['findings'][number]['severity'], string> = { block: 'BLOCK', question: 'QUESTION', note: 'NOTE' }

/** The run as terminal text: feedback, conclusion, then one entry per inline comment. */
export function formatReview(pr: InboxRow, detail: AgentReviewDetail): string {
  const { review, findings } = detail
  const model = review.model ? `${review.model.providerID}/${review.model.modelID}` : 'default model'
  const lines = [
    `${pr.url}`,
    `#${pr.number} ${pr.title}`,
    `agent: ${review.agent} · ${model}${review.variant ? ` · ${review.variant}` : ''}`,
    '',
    'Feedback',
    `  ${(review.summary ?? '(none)').split('\n').join('\n  ')}`,
    '',
    `Conclusion: ${review.verdict ?? '—'}`,
    `Coverage: ${review.coverage}`,
    '',
    `Comments (${findings.length})${review.invalidAnchorCount ? ` · ${review.invalidAnchorCount} invalid inline anchors — see summary` : ''}`,
  ]
  for (const f of findings) {
    const range = f.startLine && f.startLine !== f.line ? `${f.startLine}-${f.line}` : `${f.line}`
    lines.push(`  ${f.path}:${range}${f.side === 'LEFT' ? ' (old)' : ''}  [${SEVERITY_TAG[f.severity]}]`)
    lines.push(`    ${f.body.replace(/^\s*(block|question|note)\s*:\s*/i, '').split('\n').join('\n    ')}`)
  }
  if (findings.length === 0) lines.push('  (none)')
  return lines.join('\n')
}
