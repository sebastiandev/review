import type { ProviderKind } from './pullRequests.ts'

/** A stored provider token and who it belongs to. */
export type Credential = {
  provider: ProviderKind
  token: string
  login: string
  scopes: string[]
  /** `oauth` came from the device flow; `cli` was borrowed from the provider's CLI (`gh`). */
  source: 'oauth' | 'cli'
}

/** Where credentials persist (the OS keychain in production). One entry per provider. */
export type CredentialStore = {
  read(provider: ProviderKind): Promise<Credential | null>
  write(credential: Credential): Promise<void>
  delete(provider: ProviderKind): Promise<void>
}

/** What the provider hands back when a device flow starts. */
export type DeviceGrant = {
  deviceCode: string
  userCode: string
  verificationUri: string
  /** Seconds until the code expires. */
  expiresIn: number
  /** Minimum seconds between polls. */
  interval: number
}

export type DevicePoll =
  | { status: 'pending' }
  | { status: 'slow_down' }
  | { status: 'granted'; token: string }
  | { status: 'failed'; message: string }

/** The provider's OAuth device flow plus a way to name the token's owner. */
export type OAuthDeviceFlow = {
  /** False when no OAuth client id is configured; the CLI path is then the only one. */
  available: boolean
  scopes: string[]
  start(): Promise<DeviceGrant>
  poll(deviceCode: string): Promise<DevicePoll>
  /** The login and granted scopes behind `token`. Rejects when the token is invalid. */
  identify(token: string): Promise<{ login: string; scopes: string[] }>
}

/** The token the provider's own CLI is logged in with, if any. */
export type CliCredentials = {
  token(): Promise<string | null>
}
