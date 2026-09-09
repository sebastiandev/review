import type { UserSettings } from '@review/shared'

/** What `settings.read()` returns before the user changed anything. */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  pollInterval: 5,
  lookbackDays: 30,
  autoReviewOnFetch: false,
  defaultReviewAgent: 'pr-reviewer',
  defaultModel: null,
  defaultVariant: null,
  theme: 'nocturne',
  styleMode: 'framed',
  diffTheme: 'nocturne',
  codeFont: 'jetbrains-mono',
  defaultDiffMode: 'unified',
}
