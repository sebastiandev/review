import type { WorktreeStage } from '@review/shared'
import type { RepoRef } from './pullRequests.ts'

export type { WorktreeStage }

export type WorktreeRequest = { repo: RepoRef; cloneUrl: string; number: number; headRef: string; headSha: string }

/** Checked-out PR heads on disk. Implemented in infrastructure over git. */
export type Worktrees = {
  create(req: WorktreeRequest, onStage: (s: WorktreeStage) => void): Promise<{ path: string }>
  remove(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  sizeBytes(path: string): Promise<number>
}
