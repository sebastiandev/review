import type { UserSettings } from '@review/shared'

/** What `settings.read()` returns before the user changed anything. */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  pollInterval: 5,
  autoReviewOnFetch: false,
  defaultReviewAgent: 'pr-reviewer',
  defaultModel: null,
  defaultVariant: null,
  theme: 'nocturne',
  diffTheme: 'nocturne',
  defaultDiffMode: 'unified',
}
