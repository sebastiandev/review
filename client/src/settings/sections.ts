export const SECTIONS = ['accounts', 'repositories', 'agent', 'fetching', 'appearance', 'worktrees', 'shortcuts'] as const
export type SectionId = (typeof SECTIONS)[number]

export const SECTION_LABEL: Record<SectionId, string> = {
  accounts: 'Accounts',
  repositories: 'Tracked repositories',
  agent: 'Review agent',
  fetching: 'Fetching',
  appearance: 'Appearance',
  worktrees: 'Worktrees',
  shortcuts: 'Shortcuts',
}

/** How far below the column top a section may start and still count as "in view". */
const SPY_SLACK = 40

/**
 * The section to highlight: the last one whose top is at or above `scrollTop + SPY_SLACK`, or the
 * first section. `tops` are offsets inside the scrolling column, in document order.
 */
export function sectionInView<T extends string>(tops: { id: T; top: number }[], scrollTop: number): T | null {
  let current: T | null = tops[0]?.id ?? null
  for (const { id, top } of tops) {
    if (top <= scrollTop + SPY_SLACK) current = id
    else break
  }
  return current
}
