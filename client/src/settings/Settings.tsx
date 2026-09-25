import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from '@phosphor-icons/react'
import type { AccountInfo, ModelRef, RepoSummary, UserSettings } from '@review/shared'
import { disconnectAccount, patchRepo, removeMergedWorktrees, removeWorktrees, untrackRepo } from '../api'
import { keys, useAccount, useConfig, useRepos, useUpdateSettings, useWorktrees } from '../pr/queries'
import { Segmented } from '../shell/Segmented'
import { ShortcutTable } from '../shell/ShortcutsSheet'
import { SwatchPair } from '../diff/DiffToolbarAppearance'
import { CODE_FONT_INFO, DIFF_THEME_INFO, STYLE_MODE_INFO, UI_THEME_INFO } from '../theme/catalog'
import { CODE_FONTS, DIFF_THEMES, STYLE_MODES, UI_THEMES, type CodeFont, type DiffTheme, type StyleMode, type UiTheme } from '../theme/useTheme'
import { formatBytes } from './bytes'
import { SECTIONS, SECTION_LABEL, sectionInView, type SectionId } from './sections'

type SettingsSidebarProps = {
  section: SectionId
  width: number
  onSection: (section: SectionId) => void
  onStartResize: (e: React.PointerEvent<HTMLElement>) => void
}

/** Settings sidebar: the section nav; the highlighted row follows the scroll position. */
export function SettingsSidebar({ section, width, onSection, onStartResize }: SettingsSidebarProps) {
  return (
    <aside className="sidebar" style={{ width }}>
      <div className="settings-nav-heading">Settings</div>
      <div className="side-nav" role="listbox" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            role="option"
            aria-selected={s === section}
            className={`side-nav-row${s === section ? ' side-nav-row-on' : ''}`}
            onClick={() => onSection(s)}
          >
            {SECTION_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="sidebar-resize" role="separator" aria-orientation="vertical" title="Drag to resize" onPointerDown={onStartResize} />
    </aside>
  )
}

const ACCOUNT_DOT: Record<AccountInfo['phase'], string> = {
  connected: 'status-dot-on',
  pending: 'status-dot-pending',
  disconnected: 'status-dot-off',
}

/** The mono meta line under the provider name. */
export function accountMeta(account: AccountInfo): string {
  switch (account.phase) {
    case 'pending':
      return 'Waiting for authorization…'
    case 'disconnected':
      return 'Not connected'
    case 'connected':
      return [account.login, account.scopes.length ? account.scopes.join(', ') : null, account.source === 'cli' ? 'via gh' : null].filter(Boolean).join(' · ')
  }
}

function modelKey(model: ModelRef | null): string {
  return model ? `${model.providerID}/${model.modelID}` : ''
}

function Section({ id, title, lede, children }: { id: SectionId; title: string; lede: string; children: ReactNode }) {
  return (
    <section className="settings-section" data-section={id} aria-labelledby={`settings-${id}`}>
      <h5 id={`settings-${id}`}>{title}</h5>
      <p className="settings-lede">{lede}</p>
      {children}
    </section>
  )
}

function Checkbox({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <label className="check-label">
      <button type="button" role="checkbox" aria-checked={on} className={`checkbox${on ? ' checkbox-on' : ''}`} onClick={onToggle}>
        {on && <Check size={10} weight="bold" />}
      </button>
      <span>{label}</span>
    </label>
  )
}

type ThemeCardProps = {
  on: boolean
  label: string
  note: string
  /** The code-font cards render their own name in their own face. */
  labelStyle?: React.CSSProperties
  onPick: () => void
}

/** Bordered appearance card: a 12.5px label over a 10.5px note, accent border when selected. */
function ThemeCard({ on, label, note, labelStyle, onPick }: ThemeCardProps) {
  return (
    <button type="button" role="radio" aria-checked={on} className={`theme-card${on ? ' theme-card-on' : ''}`} onClick={onPick}>
      <span className="theme-card-title" style={labelStyle}>
        {label}
      </span>
      <span className="theme-card-note">{note}</span>
    </button>
  )
}

type SettingsProps = {
  settings: UserSettings
  uiTheme: UiTheme
  styleMode: StyleMode
  diffTheme: DiffTheme
  codeFont: CodeFont
  /** Section the sidebar (or a deep link such as "Manage repositories…") asked to scroll to. */
  requestedSection: SectionId | null
  onSectionInView: (section: SectionId) => void
  onUiTheme: (theme: UiTheme) => void
  onStyleMode: (mode: StyleMode) => void
  onDiffTheme: (theme: DiffTheme) => void
  onCodeFont: (font: CodeFont) => void
  onTrackRepo: () => void
  onConnect: () => void
  onFlash: (text: string) => void
}

/** Screen 7: one scrolling column with every settings section. Each control saves on change. */
export function Settings({
  settings,
  uiTheme,
  styleMode,
  diffTheme,
  codeFont,
  requestedSection,
  onSectionInView,
  onUiTheme,
  onStyleMode,
  onDiffTheme,
  onCodeFont,
  onTrackRepo,
  onConnect,
  onFlash,
}: SettingsProps) {
  const client = useQueryClient()
  const column = useRef<HTMLDivElement>(null)
  const repos = useRepos()
  const config = useConfig()
  const account = useAccount()
  const worktrees = useWorktrees()
  const update = useUpdateSettings()
  const [picked, setPicked] = useState<Set<number>>(new Set())

  const fail = (what: string) => (e: unknown) => onFlash(`${what}: ${e instanceof Error ? e.message : String(e)}`)
  const save = (patch: Partial<UserSettings>) => update.mutate(patch, { onError: fail('could not save') })

  const disconnect = useMutation({
    mutationFn: disconnectAccount,
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.account }),
    onError: fail('could not disconnect'),
  })
  const invalidateRepos = () => void client.invalidateQueries({ queryKey: keys.repos })
  const repoAuto = useMutation({
    mutationFn: ({ id, autoReview }: { id: number; autoReview: boolean }) => patchRepo(id, { autoReview }),
    onSuccess: invalidateRepos,
    onError: fail('could not update the repository'),
  })
  const untrack = useMutation({
    mutationFn: (id: number) => untrackRepo(id),
    onSuccess: () => {
      invalidateRepos()
      void client.invalidateQueries({ queryKey: keys.accountRepos })
    },
    onError: fail('could not remove the repository'),
  })
  const invalidateWorktrees = () => {
    setPicked(new Set())
    void client.invalidateQueries({ queryKey: keys.worktrees })
  }
  const removePicked = useMutation({
    mutationFn: (prIds: number[]) => removeWorktrees(prIds),
    onSuccess: ({ removed }) => {
      invalidateWorktrees()
      onFlash(`${removed.length} worktree${removed.length === 1 ? '' : 's'} removed`)
    },
    onError: fail('could not remove worktrees'),
  })
  const removeMerged = useMutation({
    mutationFn: () => removeMergedWorktrees(),
    onSuccess: ({ removed }) => {
      invalidateWorktrees()
      onFlash(removed.length === 0 ? 'no merged PR has a worktree' : `${removed.length} worktree${removed.length === 1 ? '' : 's'} removed`)
    },
    onError: fail('could not remove worktrees'),
  })

  // Scroll spy: report the section under the top edge; jump when the sidebar asks for one.
  useEffect(() => {
    const el = column.current
    if (!el) return
    const onScroll = () => {
      const tops = [...el.querySelectorAll<HTMLElement>('[data-section]')].map((s) => ({
        id: s.dataset.section as SectionId,
        top: s.offsetTop - el.offsetTop,
      }))
      const current = sectionInView(tops, el.scrollTop)
      if (current) onSectionInView(current)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [onSectionInView])
  useEffect(() => {
    if (!requestedSection) return
    column.current?.querySelector<HTMLElement>(`[data-section="${requestedSection}"]`)?.scrollIntoView({ block: 'start' })
  }, [requestedSection])

  const tracked = (repos.data ?? []).filter((r) => r.tracked)
  const models = config.data?.models ?? []
  const currentModel = models.find((m) => modelKey(m) === modelKey(settings.defaultModel)) ?? null
  const variants = currentModel?.variants ?? []
  const rows = worktrees.data?.rows ?? []
  const togglePicked = (prId: number) =>
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(prId)) next.delete(prId)
      else next.add(prId)
      return next
    })

  return (
    <main className="center settings" ref={column}>
      <div className="settings-column">
        <Section id="accounts" title="Accounts" lede="OAuth tokens are stored in your OS keychain.">
          <div className="settings-list">
            <div className="settings-row">
              <span className={`status-dot ${ACCOUNT_DOT[account.data?.phase ?? 'disconnected']}`} aria-hidden />
              <span className="settings-row-main">
                <span className="settings-row-title">GitHub</span>
                <span className="settings-row-meta mono">{account.data ? accountMeta(account.data) : account.isError ? 'Not connected' : 'Checking…'}</span>
              </span>
              {account.data?.phase === 'connected' && (
                <button type="button" className="btn btn-ghost btn-xs" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
                  Disconnect
                </button>
              )}
              <button
                type="button"
                className={`btn settings-account-action ${account.data?.phase === 'connected' ? 'btn-secondary' : 'btn-primary'}`}
                disabled={!account.data}
                onClick={onConnect}
              >
                {account.data?.phase === 'connected' ? 'Reauthorize' : account.data?.phase === 'pending' ? 'Authorizing…' : 'Connect'}
              </button>
            </div>
            <div className="settings-row">
              <span className="status-dot status-dot-off" aria-hidden />
              <span className="settings-row-main">
                <span className="settings-row-title">GitLab</span>
                <span className="settings-row-meta mono">Not available yet</span>
              </span>
              <button type="button" className="btn btn-primary settings-account-action" disabled>
                Connect
              </button>
            </div>
          </div>
        </Section>

        <Section id="repositories" title="Tracked repositories" lede="Each repository is fetched separately; you review one at a time from the rail's selector.">
          <div className="settings-list">
            {repos.isSuccess && tracked.length === 0 && <p className="notice">No tracked repositories.</p>}
            {tracked.map((r: RepoSummary) => (
              <div key={r.id} className="settings-row">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={r.autoReview}
                  title="Automatic review on this repository"
                  className={`checkbox${r.autoReview ? ' checkbox-on' : ''}`}
                  disabled={repoAuto.isPending}
                  onClick={() => repoAuto.mutate({ id: r.id, autoReview: !r.autoReview })}
                >
                  {r.autoReview && <Check size={10} weight="bold" />}
                </button>
                <span className="settings-row-main">
                  <span className="settings-row-title mono">
                    {r.owner}/{r.name}
                  </span>
                  <span className="settings-row-meta">
                    {r.provider} · {r.activeCount} active · auto-review {r.autoReview ? 'on' : 'off'}
                    {r.syncError ? ` · ${r.syncError}` : ''}
                  </span>
                </span>
                <button type="button" className="btn btn-ghost btn-xs" disabled={untrack.isPending} onClick={() => untrack.mutate(r.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="settings-actions">
            <button type="button" className="btn btn-primary" onClick={onTrackRepo}>
              Track a repository…
            </button>
          </div>
        </Section>

        <Section id="agent" title="Review agent" lede="Runs on demand and, optionally, on every fetch.">
          <div className="settings-grid">
            <div className="field">
              <label htmlFor="settings-provider">Provider</label>
              <select id="settings-provider" className="input" value="opencode" disabled>
                <option value="opencode">opencode</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="settings-agent">Agent</label>
              <select
                id="settings-agent"
                className="input mono"
                value={settings.defaultReviewAgent}
                onChange={(e) => save({ defaultReviewAgent: e.target.value })}
              >
                {!config.data?.agents.some((a) => a.name === settings.defaultReviewAgent) && (
                  <option value={settings.defaultReviewAgent}>{settings.defaultReviewAgent}</option>
                )}
                {(config.data?.agents ?? []).map((a) => (
                  <option key={a.name} value={a.name} title={a.description}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="settings-model">Model</label>
              <select
                id="settings-model"
                className="input mono"
                value={modelKey(settings.defaultModel)}
                onChange={(e) => {
                  const next = models.find((m) => modelKey(m) === e.target.value) ?? null
                  save({
                    defaultModel: next ? { providerID: next.providerID, modelID: next.modelID } : null,
                    defaultVariant: next && settings.defaultVariant && next.variants.includes(settings.defaultVariant) ? settings.defaultVariant : null,
                  })
                }}
              >
                <option value="">opencode default</option>
                {models.map((m) => (
                  <option key={modelKey(m)} value={modelKey(m)}>
                    {modelKey(m)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="field-label">Effort / variant</span>
              {variants.length === 0 ? (
                <span className="settings-muted">{currentModel ? 'this model has no variants' : 'pick a model first'}</span>
              ) : (
                <Segmented<string>
                  label="Variant"
                  value={settings.defaultVariant ?? ''}
                  options={[{ value: '', label: 'default' }, ...variants.map((v) => ({ value: v, label: v }))]}
                  onChange={(v) => save({ defaultVariant: v || null })}
                />
              )}
            </div>
          </div>
        </Section>

        <Section id="fetching" title="Fetching" lede="How often tracked repositories are polled, how far back to look, and what happens with new commits.">
          <div className="field">
            <span className="field-label">Poll interval</span>
            <Segmented<string>
              label="Poll interval"
              value={String(settings.pollInterval)}
              options={[
                { value: '1', label: '1 min' },
                { value: '5', label: '5 min' },
                { value: '15', label: '15 min' },
                { value: 'manual', label: 'manual' },
              ]}
              onChange={(v) => save({ pollInterval: v === 'manual' ? 'manual' : (Number(v) as 1 | 5 | 15) })}
            />
          </div>
          <div className="field">
            <span className="field-label">Fetch PRs updated in the last</span>
            <Segmented<string>
              label="Lookback window"
              value={String(settings.lookbackDays)}
              options={[
                { value: '7', label: '7 days' },
                { value: '14', label: '14 days' },
                { value: '30', label: '30 days' },
                { value: '90', label: '90 days' },
              ]}
              onChange={(v) => save({ lookbackDays: Number(v) as UserSettings['lookbackDays'] })}
            />
          </div>
          <Checkbox
            on={settings.autoReviewOnFetch}
            label="Run the automatic review on newly fetched commits"
            onToggle={() => save({ autoReviewOnFetch: !settings.autoReviewOnFetch })}
          />
        </Section>

        <Section id="appearance" title="Appearance" lede="Any palette runs in either surface style, with any diff theme and any code font.">
          <div className="settings-grid">
            <div className="field"><span className="field-label">Conversation previews</span><Segmented label="Preview lines" value={String(settings.previewLines ?? 2)} options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n} line${n === 1 ? '' : 's'}` }))} onChange={(v) => save({ previewLines: Number(v) as UserSettings['previewLines'] })} /></div>
            <div className="field"><span className="field-label">Threads default</span><Segmented<UserSettings['threadsDefault']> label="Threads default" value={settings.threadsDefault ?? 'unread'} options={[{ value: 'unread', label: 'Unread only' }, { value: 'open', label: 'All open' }, { value: 'collapsed', label: 'All collapsed' }]} onChange={(threadsDefault) => save({ threadsDefault })} /></div>
            <div className="field">
              <span className="field-label">Default diff view</span>
              <Segmented<UserSettings['defaultDiffMode']>
                label="Default diff view"
                value={settings.defaultDiffMode}
                options={[
                  { value: 'unified', label: 'Merged' },
                  { value: 'split', label: 'Side by side' },
                ]}
                onChange={(v) => save({ defaultDiffMode: v })}
              />
            </div>
            <div className="field">
              <span className="field-label">Surface style</span>
              <div className="theme-cards" role="radiogroup" aria-label="Surface style">
                {STYLE_MODES.map((mode) => (
                  <ThemeCard key={mode} on={styleMode === mode} label={STYLE_MODE_INFO[mode].label} note={STYLE_MODE_INFO[mode].note} onPick={() => onStyleMode(mode)} />
                ))}
              </div>
            </div>
            <div className="field settings-grid-span">
              <span className="field-label">Theme</span>
              <div className="theme-cards" role="radiogroup" aria-label="Theme">
                {UI_THEMES.map((theme) => (
                  <ThemeCard key={theme} on={uiTheme === theme} label={UI_THEME_INFO[theme].label} note={UI_THEME_INFO[theme].note} onPick={() => onUiTheme(theme)} />
                ))}
              </div>
            </div>
            <div className="field settings-grid-span">
              <span className="field-label">Code font</span>
              <div className="theme-cards" role="radiogroup" aria-label="Code font">
                {CODE_FONTS.map((font) => (
                  <ThemeCard
                    key={font}
                    on={codeFont === font}
                    label={CODE_FONT_INFO[font].label}
                    note={CODE_FONT_INFO[font].note}
                    labelStyle={{ fontFamily: CODE_FONT_INFO[font].stack }}
                    onPick={() => onCodeFont(font)}
                  />
                ))}
              </div>
            </div>
            <div className="field settings-grid-span">
              <span className="field-label">Diff theme</span>
              <div className="diff-theme-row" role="radiogroup" aria-label="Diff theme">
                {DIFF_THEMES.map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    role="radio"
                    aria-checked={diffTheme === theme}
                    className={`diff-theme-btn${diffTheme === theme ? ' diff-theme-btn-on' : ''}`}
                    onClick={() => onDiffTheme(theme)}
                  >
                    <SwatchPair add={DIFF_THEME_INFO[theme].add} del={DIFF_THEME_INFO[theme].del} size={12} />
                    {DIFF_THEME_INFO[theme].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section id="worktrees" title="Worktrees" lede="Created when you open a PR for review; safe to remove once the PR is closed.">
          <div className="settings-list">
            {worktrees.isPending && <p className="notice">Measuring worktrees…</p>}
            {worktrees.isError && <p className="notice">Could not list worktrees.</p>}
            {worktrees.isSuccess && rows.length === 0 && <p className="notice">No worktrees on disk.</p>}
            {rows.map((w) => (
              <div key={w.prId} className="settings-row">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={picked.has(w.prId)}
                  aria-label={`Select ${w.path}`}
                  className={`checkbox${picked.has(w.prId) ? ' checkbox-on' : ''}`}
                  onClick={() => togglePicked(w.prId)}
                >
                  {picked.has(w.prId) && <Check size={10} weight="bold" />}
                </button>
                <span className="settings-row-main">
                  <span className="settings-row-title mono">{w.path}</span>
                  <span className="settings-row-meta">
                    {w.repo}#{w.number} · {w.state} · {formatBytes(w.sizeBytes)}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  disabled={removePicked.isPending}
                  onClick={() => removePicked.mutate([w.prId])}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="settings-actions">
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              disabled={picked.size === 0 || removePicked.isPending}
              onClick={() => removePicked.mutate([...picked])}
            >
              Remove selected · {picked.size}
            </button>
            <button type="button" className="btn btn-ghost btn-xs" disabled={removeMerged.isPending} onClick={() => removeMerged.mutate()}>
              Remove all for merged PRs
            </button>
            {worktrees.data && (
              <span className="settings-muted">
                {rows.length} worktree{rows.length === 1 ? '' : 's'} · {formatBytes(worktrees.data.totalBytes)} on disk
              </span>
            )}
          </div>
        </Section>

        <Section id="shortcuts" title="Shortcuts" lede="Also available anywhere with ?.">
          <ShortcutTable />
        </Section>
      </div>
    </main>
  )
}
