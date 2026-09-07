import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServerEvent, WorktreeStage } from '@review/shared'
import type { Clock, Events } from '../ports.ts'
import type {
  PullRequestProvider,
  RemoteComment,
  RemotePullRequest,
  RepoRef,
  ReviewPayload,
} from '../pullRequests.ts'
import type { Store } from '../store.ts'
import type { WorktreeRequest, Worktrees } from '../worktrees.ts'
import { openDatabase } from '../../infrastructure/sqlite/database.ts'
import { sqliteStore } from '../../infrastructure/sqlite/store.ts'

export const NOW = '2026-09-07T10:00:00.000Z'

/** A clock stuck at `at`. */
export const fixedClock =
  (at: string = NOW): Clock =>
  () => at

export const GITHUB_REPO: RepoRef = { provider: 'github', owner: 'acme', name: 'widgets' }

/** A plausible open PR; override what the test cares about. */
export function remotePr(overrides: Partial<RemotePullRequest> = {}): RemotePullRequest {
  const number = overrides.number ?? 1
  return {
    number,
    title: `PR ${number}`,
    author: 'alice',
    url: `https://github.com/acme/widgets/pull/${number}`,
    body: '',
    headRef: `feature-${number}`,
    baseRef: 'main',
    headSha: `sha-${number}-a`,
    baseSha: 'base-sha',
    isDraft: false,
    state: 'open',
    additions: 1,
    deletions: 1,
    changedFiles: 1,
    reviewRequested: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    ...overrides,
  }
}

export const SAMPLE_PATCH = `diff --git a/src/a.py b/src/a.py
--- a/src/a.py
+++ b/src/a.py
@@ -1,3 +1,3 @@
 keep
-old
+new
 tail
`

export type FakeProvider = PullRequestProvider & {
  /** Remote state by PR number; mutate to simulate the world moving. */
  remote: Map<number, RemotePullRequest>
  patches: Map<number, string>
  remoteComments: Map<number, RemoteComment[]>
  /** Every method invocation, as `name:number` (or `name`). */
  calls: string[]
  submitted: { repo: RepoRef; number: number; payload: ReviewPayload }[]
}

/** In-memory `PullRequestProvider`. `listOpen` returns the open PRs in `remote`. */
export function fakeProvider(prs: RemotePullRequest[] = []): FakeProvider {
  const remote = new Map(prs.map((p) => [p.number, p]))
  const patches = new Map<number, string>()
  const remoteComments = new Map<number, RemoteComment[]>()
  const calls: string[] = []
  const submitted: FakeProvider['submitted'] = []
  return {
    kind: 'github',
    remote,
    patches,
    remoteComments,
    calls,
    submitted,
    cloneUrl: (repo) => `https://github.com/${repo.owner}/${repo.name}.git`,
    async listOpen() {
      calls.push('listOpen')
      return [...remote.values()].filter((p) => p.state === 'open')
    },
    async get(_repo, number) {
      calls.push(`get:${number}`)
      return remote.get(number) ?? null
    },
    async diff(_repo, number) {
      calls.push(`diff:${number}`)
      return patches.get(number) ?? SAMPLE_PATCH
    },
    async comments(_repo, number) {
      calls.push(`comments:${number}`)
      return remoteComments.get(number) ?? []
    },
    async submitReview(repo, number, payload) {
      calls.push(`submitReview:${number}`)
      submitted.push({ repo, number, payload })
      return { remoteReviewId: `review-${submitted.length}` }
    },
    parseReference(input, repo) {
      const m = /^#?(\d+)$/.exec(input.trim())
      return m ? { repo, number: Number(m[1]) } : null
    },
  }
}

export type FakeWorktrees = Worktrees & {
  /** Paths currently on "disk". */
  paths: Set<string>
  created: WorktreeRequest[]
  removed: string[]
  /** When set, `create` waits on it before finishing; lets a test hold a creation open. */
  gate: Promise<void> | null
  /** Make `create` reject with this. */
  failWith: Error | null
}

/** In-memory `Worktrees`. `create` reports every stage in order and yields a deterministic path. */
export function fakeWorktrees(): FakeWorktrees {
  const stages: WorktreeStage[] = ['cloning', 'fetching', 'checking-out', 'ready']
  const fake: FakeWorktrees = {
    paths: new Set(),
    created: [],
    removed: [],
    gate: null,
    failWith: null,
    async create(req, onStage) {
      fake.created.push(req)
      for (const s of stages) onStage(s)
      if (fake.gate) await fake.gate
      if (fake.failWith) throw fake.failWith
      const path = `/wt/${req.repo.owner}/${req.repo.name}/${req.number}`
      fake.paths.add(path)
      return { path }
    },
    async remove(path) {
      fake.removed.push(path)
      fake.paths.delete(path)
    },
    async exists(path) {
      return fake.paths.has(path)
    },
    async sizeBytes() {
      return 1024
    },
  }
  return fake
}

export type MemoryEvents = Events & { events: ServerEvent[]; ofType<T extends ServerEvent['type']>(t: T): Extract<ServerEvent, { type: T }>[] }

/** `Events` that records everything emitted. */
export function memoryEvents(): MemoryEvents {
  const events: ServerEvent[] = []
  const listeners = new Set<(e: ServerEvent) => void>()
  return {
    events,
    ofType: (t) => events.filter((e): e is Extract<ServerEvent, { type: typeof t }> => e.type === t),
    emit(e) {
      events.push(e)
      listeners.forEach((l) => l(e))
    },
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}

/** A real SQLite `Store` on a fresh temp file with migrations applied. `close()` deletes it. */
export async function openTestStore(): Promise<{ store: Store; path: string; close(): Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'review-store-'))
  const path = join(dir, 'review.db')
  const db = openDatabase(path)
  return {
    store: sqliteStore(db),
    path,
    async close() {
      db.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}
