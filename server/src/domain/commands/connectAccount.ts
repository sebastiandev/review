import type { CliCredentials, Credential, CredentialStore, DeviceGrant, OAuthDeviceFlow } from '../accounts.ts'
import { CliNotAuthenticated, DeviceFlowFailed, DeviceFlowUnavailable } from '../errors.ts'
import type { ProviderKind } from '../pullRequests.ts'

export type ConnectAccountDeps = {
  credentials: CredentialStore
  deviceFlow: OAuthDeviceFlow
  cli: CliCredentials
  /** Waits `seconds`; injected so tests do not. */
  sleep: (seconds: number) => Promise<void>
}

const PROVIDER: ProviderKind = 'github'

/**
 * Borrow the token the provider CLI is logged in with.
 * Pre-conditions:
 * - the CLI has a token (else `CliNotAuthenticated`) that the provider accepts
 * Post-conditions:
 * - the credential is stored with `source = 'cli'`
 */
export async function connectWithCli(deps: ConnectAccountDeps): Promise<Credential> {
  const token = await deps.cli.token()
  if (!token) throw new CliNotAuthenticated('gh')
  return adopt(deps, token, 'cli')
}

/**
 * Begin the OAuth device flow: the user gets a code to type on the provider's device page.
 * Pre-conditions:
 * - the flow is configured (else `DeviceFlowUnavailable`)
 * Post-conditions:
 * - nothing is stored yet; the grant carries the code the user types
 */
export async function startDeviceFlow(deps: ConnectAccountDeps): Promise<DeviceGrant> {
  if (!deps.deviceFlow.available) throw new DeviceFlowUnavailable()
  return deps.deviceFlow.start()
}

/**
 * Poll the device flow until the user approves, it fails, or `cancelled()` turns true.
 * Pre-conditions:
 * - `grant` came from `startDeviceFlow`
 * Post-conditions:
 * - approved: the credential is stored with `source = 'oauth'`
 * - denied / expired: `DeviceFlowFailed` is thrown
 * - cancelled: resolves null, nothing is stored
 */
export async function completeDeviceFlow(
  deps: ConnectAccountDeps,
  grant: DeviceGrant,
  cancelled: () => boolean = () => false,
): Promise<Credential | null> {
  let interval = grant.interval
  while (!cancelled()) {
    await deps.sleep(interval)
    if (cancelled()) return null
    const poll = await deps.deviceFlow.poll(grant.deviceCode)
    switch (poll.status) {
      case 'pending':
        break
      case 'slow_down':
        interval += 5
        break
      case 'granted':
        return adopt(deps, poll.token, 'oauth')
      case 'failed':
        throw new DeviceFlowFailed(poll.message)
    }
  }
  return null
}

/** Forget the stored credential. Post-condition: the store has no entry for the provider. */
export async function disconnectAccount(deps: Pick<ConnectAccountDeps, 'credentials'>): Promise<void> {
  await deps.credentials.delete(PROVIDER)
}

/** Name the token's owner and store it. */
async function adopt(deps: ConnectAccountDeps, token: string, source: Credential['source']): Promise<Credential> {
  const { login, scopes } = await deps.deviceFlow.identify(token)
  const credential: Credential = { provider: PROVIDER, token, login, scopes, source }
  await deps.credentials.write(credential)
  return credential
}
