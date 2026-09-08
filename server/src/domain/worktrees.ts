import type { WorktreeStage } from '@review/shared'
import type { RepoRef } from './pullRequests.ts'

export type { WorktreeStage }

export type WorktreeRequest = { repo: RepoRef; cloneUrl: string; number: number; headRef: string; headSha: string }

/** Checked-out PR heads on disk. Implemented in infrastructure over git. */
export type Worktrees = {
  create(req: WorktreeRequest, onStage: (s: WorktreeStage) => void): Promise<{ path: string }>
  /** The commit checked out at `path`. */
  headSha(path: string): Promise<string>
  /** Fetch the PR head again and move the existing worktree at `path` onto `req.headSha`. */
  checkout(path: string, req: WorktreeRequest, onStage: (s: WorktreeStage) => void): Promise<void>
  remove(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  sizeBytes(path: string): Promise<number>
}
