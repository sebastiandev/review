import { useState } from 'react'
import type { ModelRef, UserSettings } from '@review/shared'
import type { RunReviewOptions } from '../api'
import { useConfig, useSettings, useUpdateSettings } from './queries'
import { Modal } from '../shell/Modal'
import { Segmented } from '../shell/Segmented'

type RunReviewModalProps = {
  prNumber: number
  /** The previous run on this head, when re-running; its choices are the starting point. */
  previous: RunReviewOptions | null
  busy: boolean
  onRun: (options: RunReviewOptions) => void
  onClose: () => void
}

export function modelKey(model: ModelRef | null): string {
  return model ? `${model.providerID}/${model.modelID}` : ''
}

/** Starting choices: the previous run's, else the settings defaults. */
export function initialOptions(previous: RunReviewOptions | null, settings: UserSettings | undefined): RunReviewOptions {
  if (previous) return previous
  return {
    agent: settings?.defaultReviewAgent ?? '',
    model: settings?.defaultModel ?? null,
    variant: settings?.defaultVariant ?? null,
  }
}

/** "Run the automatic review": pick agent, model and variant for this run; optionally save them as the defaults. */
export function RunReviewModal({ prNumber, previous, busy, onRun, onClose }: RunReviewModalProps) {
  const config = useConfig()
  const settings = useSettings()
  const update = useUpdateSettings()
  const [options, setOptions] = useState<RunReviewOptions>(() => initialOptions(previous, settings.data))
  const [saveDefaults, setSaveDefaults] = useState(false)

  const agents = config.data?.agents ?? []
  const models = config.data?.models ?? []
  const currentModel = models.find((m) => modelKey(m) === modelKey(options.model)) ?? null
  const variants = currentModel?.variants ?? []
  const agentKnown = agents.some((a) => a.name === options.agent)

  const run = () => {
    if (saveDefaults) {
      update.mutate({ defaultReviewAgent: options.agent, defaultModel: options.model, defaultVariant: options.variant })
    }
    onRun(options)
  }

  return (
    <Modal label="Run the automatic review" maxWidth={460} onClose={onClose}>
      <div className="sheet-head">
        <h4>Run the automatic review</h4>
        <span className="sheet-hint mono">#{prNumber}</span>
        <button type="button" className="ichat-btn modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="modal-lede">The agent reads the worktree and the diff, then proposes findings you keep or dismiss.</p>
      {config.isError && <p className="modal-error">opencode is not reachable; agents and models could not be listed.</p>}
      <div className="settings-grid">
        <div className="field">
          <label htmlFor="run-agent">Agent</label>
          <select id="run-agent" className="input mono" value={options.agent} onChange={(e) => setOptions({ ...options, agent: e.target.value })}>
            {!agentKnown && <option value={options.agent}>{options.agent || 'pick an agent'}</option>}
            {agents.map((a) => (
              <option key={a.name} value={a.name} title={a.description}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="run-model">Model</label>
          <select
            id="run-model"
            className="input mono"
            value={modelKey(options.model)}
            onChange={(e) => {
              const next = models.find((m) => modelKey(m) === e.target.value) ?? null
              setOptions({
                ...options,
                model: next ? { providerID: next.providerID, modelID: next.modelID } : null,
                variant: next && options.variant && next.variants.includes(options.variant) ? options.variant : null,
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
      </div>
      <div className="field run-variant">
        <span className="field-label">Effort / variant</span>
        {variants.length === 0 ? (
          <span className="settings-muted">{currentModel ? 'this model has no variants' : 'pick a model to choose a variant'}</span>
        ) : (
          <Segmented<string>
            label="Variant"
            value={options.variant ?? ''}
            options={[{ value: '', label: 'default' }, ...variants.map((v) => ({ value: v, label: v }))]}
            onChange={(v) => setOptions({ ...options, variant: v || null })}
          />
        )}
      </div>
      <label className="check-label">
        <button
          type="button"
          role="checkbox"
          aria-checked={saveDefaults}
          className={`checkbox${saveDefaults ? ' checkbox-on' : ''}`}
          onClick={() => setSaveDefaults((v) => !v)}
        >
          {saveDefaults && '✓'}
        </button>
        <span>Make these the defaults</span>
      </label>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !options.agent} onClick={run}>
          {busy ? 'Starting…' : 'Run review'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
