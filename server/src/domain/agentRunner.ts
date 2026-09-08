import type { AgentReview, ModelRef } from '@review/shared'

export type AgentRunRequest = {
  /** Working directory for the agent: the PR's worktree. */
  directory: string
  title: string
  agent: string
  model: ModelRef | null
  variant: string | null
  prompt: string
}

/** One visible step of the agent's work, as the runner sees it finish: `Read src/a.py`, `Grep foo`. */
export type AgentStep = { tool: string; title: string }

/** Drives one agent session to completion. Implemented over opencode in infrastructure. */
export type AgentRunner = {
  /**
   * Create a session in `directory`, send `prompt`, resolve when the session goes idle.
   * Rejects when the session reports an error. `onSession` fires as soon as the id is known;
   * `onStep` fires for each tool call the agent completes.
   */
  run(req: AgentRunRequest, onSession: (sessionId: string) => void, onStep?: (step: AgentStep) => void): Promise<AgentRunOutcome>
}

/** What the session ended with: the assistant's last text, for agents that answer inline instead of writing the file. */
export type AgentRunOutcome = { finalText: string | null }

/** Files exchanged with the agent: the diff the Command hands it, the payload it writes back. */
export type PayloadFiles = {
  /** Unique per run so a re-run on the same head can never read a stale file. */
  pathFor(review: Pick<AgentReview, 'id' | 'prId' | 'headSha'>): string
  /** Where the Command writes the cached diff for the agent to read. */
  diffPathFor(review: Pick<AgentReview, 'id' | 'prId' | 'headSha'>): string
  write(path: string, text: string): Promise<void>
  /** File contents, or null when the agent wrote nothing. */
  read(path: string): Promise<string | null>
}
