import type { AccountInfo, DeviceCodeInfo } from '@review/shared'
import type { Credential, DeviceGrant } from '../domain/accounts.ts'
import {
  completeDeviceFlow,
  connectWithCli,
  disconnectAccount,
  startDeviceFlow,
  type ConnectAccountDeps,
} from '../domain/commands/connectAccount.ts'
import type { Clock, Events } from '../domain/ports.ts'

export type AccountSession = {
  /** Loads the stored credential, or silently borrows the CLI's token on a fresh install. */
  load(): Promise<void>
  info(): AccountInfo
  /** The token `gh` should run with, or null to let `gh` use its own login. */
  token(): string | null
  connectWithCli(): Promise<AccountInfo>
  /** Starts the device flow and keeps polling in the background until it ends or is cancelled. */
  startDeviceFlow(): Promise<DeviceCodeInfo>
  cancelDeviceFlow(): void
  disconnect(): Promise<void>
}

type Pending = { grant: DeviceGrant; startedAt: string; cancelled: boolean }

/**
 * Per-process account state: the active credential and, while a device flow runs, its grant.
 * Commands do the work; this holds what the routes read between requests and announces the
 * transitions on the event bus.
 */
export function accountSession(deps: ConnectAccountDeps & { events: Events; clock: Clock }): AccountSession {
  let credential: Credential | null = null
  let pending: Pending | null = null

  const codeInfo = (p: Pending): DeviceCodeInfo => ({
    userCode: p.grant.userCode,
    verificationUri: p.grant.verificationUri,
    expiresAt: new Date(Date.parse(p.startedAt) + p.grant.expiresIn * 1000).toISOString(),
    interval: p.grant.interval,
    scopes: deps.deviceFlow.scopes,
  })

  const info = (): AccountInfo => ({
    provider: 'github',
    phase: pending ? 'pending' : credential ? 'connected' : 'disconnected',
    login: credential?.login ?? null,
    scopes: credential?.scopes ?? [],
    source: credential?.source ?? null,
    deviceFlowAvailable: deps.deviceFlow.available,
    pending: pending ? codeInfo(pending) : null,
  })

  const connected = (c: Credential) => {
    credential = c
    deps.events.emit({ type: 'account.connected', provider: c.provider, login: c.login, source: c.source })
  }

  return {
    async load() {
      credential = await deps.credentials.read('github')
      if (credential) return
      try {
        credential = await connectWithCli(deps)
      } catch {
        credential = null
      }
    },
    info,
    token: () => credential?.token ?? null,

    async connectWithCli() {
      connected(await connectWithCli(deps))
      return info()
    },

    async startDeviceFlow() {
      if (pending) pending.cancelled = true
      const grant = await startDeviceFlow(deps)
      const current: Pending = { grant, startedAt: deps.clock(), cancelled: false }
      pending = current
      deps.events.emit({ type: 'account.pending', provider: 'github', userCode: grant.userCode })
      void completeDeviceFlow(deps, grant, () => current.cancelled)
        .then((result) => {
          if (pending === current) pending = null
          if (result) connected(result)
        })
        .catch((e: unknown) => {
          if (pending === current) pending = null
          deps.events.emit({ type: 'account.failed', provider: 'github', message: e instanceof Error ? e.message : String(e) })
        })
      return codeInfo(current)
    },

    cancelDeviceFlow() {
      if (!pending) return
      pending.cancelled = true
      pending = null
    },

    async disconnect() {
      await disconnectAccount(deps)
      credential = null
      deps.events.emit({ type: 'account.disconnected', provider: 'github' })
    },
  }
}
