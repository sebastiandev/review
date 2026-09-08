import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { AccountInfo, DeviceCodeInfo } from '@review/shared'
import { cancelDeviceFlow, connectWithCli, startDeviceFlow } from '../api'
import { useServerEvent } from '../events/useServerEvents'
import { useNow } from '../inbox/useNow'
import { Modal } from '../shell/Modal'

type Step = { kind: 'idle' } | { kind: 'code'; code: DeviceCodeInfo } | { kind: 'polling'; code: DeviceCodeInfo } | { kind: 'done'; login: string }

type ConnectModalProps = {
  account: AccountInfo
  onClose: () => void
  onConnected: (login: string) => void
}

/** `14:32` until `iso`, or `expired`. */
export function countdown(iso: string, now: number): string {
  const left = Math.max(0, Math.floor((Date.parse(iso) - now) / 1000))
  if (left === 0) return 'expired'
  const m = Math.floor(left / 60)
  const s = left % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Connect GitHub: the device-flow code step, the polling step, and done; plus the one-click
 * "use the gh CLI token" path. Reopening while a flow is pending resumes at the polling step.
 */
export function ConnectModal({ account, onClose, onConnected }: ConnectModalProps) {
  const [step, setStep] = useState<Step>(() => (account.pending ? { kind: 'polling', code: account.pending } : { kind: 'idle' }))
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const now = useNow(1_000)

  useServerEvent((event) => {
    if (event.type === 'account.connected') {
      setStep({ kind: 'done', login: event.login })
      onConnected(event.login)
    }
    if (event.type === 'account.failed') {
      setError(event.message)
      setStep({ kind: 'idle' })
    }
  })

  const cli = useMutation({
    mutationFn: connectWithCli,
    onSuccess: (info) => {
      if (info.login) {
        setStep({ kind: 'done', login: info.login })
        onConnected(info.login)
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })
  const device = useMutation({
    mutationFn: startDeviceFlow,
    onMutate: () => setError(null),
    onSuccess: (code) => setStep({ kind: 'code', code }),
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })
  const cancel = useMutation({
    mutationFn: cancelDeviceFlow,
    onSettled: () => setStep({ kind: 'idle' }),
  })

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  const openPage = (code: DeviceCodeInfo) => {
    window.open(code.verificationUri, '_blank', 'noopener')
    setStep({ kind: 'polling', code })
  }

  const cliRow = (
    <>
      <div className="connect-divider" />
      <button type="button" className="btn btn-ghost connect-cli" disabled={cli.isPending} onClick={() => cli.mutate()}>
        {cli.isPending ? 'Reading the gh token…' : 'Use the token from the gh CLI instead'}
      </button>
    </>
  )

  return (
    <Modal label="Connect GitHub" maxWidth={440} onClose={onClose}>
      <div className="sheet-head">
        <h4>Connect GitHub</h4>
        <button type="button" className="ichat-btn modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      {step.kind === 'idle' && (
        <>
          <p className="modal-lede">
            {account.deviceFlowAvailable
              ? 'Sign in on github.com with a one-time code. The token is stored in your OS keychain.'
              : 'The device flow needs an OAuth client id (REVIEW_GITHUB_CLIENT_ID). Until one is set, borrow the token the gh CLI is logged in with.'}
          </p>
          {error && <p className="modal-error">{error}</p>}
          <div className="modal-actions">
            {account.deviceFlowAvailable && (
              <button type="button" className="btn btn-primary" disabled={device.isPending} onClick={() => device.mutate()}>
                {device.isPending ? 'Requesting a code…' : 'Get a code'}
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
          {cliRow}
        </>
      )}

      {step.kind === 'code' && (
        <>
          <p className="modal-lede">Open GitHub's device page and type this code. Review keeps checking until you approve.</p>
          <div className="device-code-box">
            <span className="device-code mono">{step.code.userCode}</span>
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => copy(step.code.userCode)}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="device-meta mono">
            expires in {countdown(step.code.expiresAt, now)} · scopes: {step.code.scopes.join(', ')}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={() => openPage(step.code)}>
              Open {step.code.verificationUri.replace(/^https?:\/\//, '')}
            </button>
            <button type="button" className="btn btn-secondary" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancel
            </button>
          </div>
          {cliRow}
        </>
      )}

      {step.kind === 'polling' && (
        <>
          <div className="device-wait">
            <span className="status-dot status-dot-pending" aria-hidden />
            <span>Waiting for you to approve in the browser…</span>
          </div>
          <p className="device-wait-note">
            Code <span className="mono">{step.code.userCode}</span> at {step.code.verificationUri.replace(/^https?:\/\//, '')} · polling every{' '}
            {step.code.interval}s · expires in {countdown(step.code.expiresAt, now)}
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => window.open(step.code.verificationUri, '_blank', 'noopener')}>
              Reopen the page
            </button>
            <button type="button" className="btn btn-secondary" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancel
            </button>
          </div>
        </>
      )}

      {step.kind === 'done' && (
        <>
          <div className="device-wait">
            <span className="status-dot status-dot-on" aria-hidden />
            <span>GitHub connected as {step.login}</span>
          </div>
          <p className="device-wait-note">Token stored in the keychain. First fetch runs on the next sync.</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
