import type { CliCredentials, DeviceGrant, DevicePoll, OAuthDeviceFlow } from '../../domain/accounts.ts'
import type { Runner } from '../process.ts'

export const GITHUB_SCOPES = ['repo', 'read:org']

type Fetch = typeof fetch

type DeviceCodeResponse = {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

type TokenResponse = { access_token: string } | { error: string; error_description?: string }

/**
 * GitHub's OAuth device flow (RFC 8628) for a public OAuth app identified by `clientId`.
 * `available` is false without a client id; the CLI path still works then.
 */
export function githubDeviceFlow(clientId: string | null, fetchImpl: Fetch = fetch): OAuthDeviceFlow {
  const form = async <T>(url: string, body: Record<string, string>): Promise<T> => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    })
    if (!res.ok) throw new Error(`${url} answered ${res.status}`)
    return (await res.json()) as T
  }

  return {
    available: clientId !== null,
    scopes: GITHUB_SCOPES,

    async start(): Promise<DeviceGrant> {
      const r = await form<DeviceCodeResponse>('https://github.com/login/device/code', {
        client_id: clientId ?? '',
        scope: GITHUB_SCOPES.join(' '),
      })
      return { deviceCode: r.device_code, userCode: r.user_code, verificationUri: r.verification_uri, expiresIn: r.expires_in, interval: r.interval }
    },

    async poll(deviceCode): Promise<DevicePoll> {
      const r = await form<TokenResponse>('https://github.com/login/oauth/access_token', {
        client_id: clientId ?? '',
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      })
      if ('access_token' in r) return { status: 'granted', token: r.access_token }
      switch (r.error) {
        case 'authorization_pending':
          return { status: 'pending' }
        case 'slow_down':
          return { status: 'slow_down' }
        case 'expired_token':
          return { status: 'failed', message: 'the code expired before it was approved' }
        case 'access_denied':
          return { status: 'failed', message: 'authorization was denied' }
        default:
          return { status: 'failed', message: r.error_description ?? r.error }
      }
    },

    async identify(token) {
      const res = await fetchImpl('https://api.github.com/user', {
        headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'user-agent': 'review' },
      })
      if (!res.ok) throw new Error(`token rejected by GitHub (${res.status})`)
      const { login } = (await res.json()) as { login: string }
      const scopes = (res.headers.get('x-oauth-scopes') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      return { login, scopes }
    },
  }
}

/** The token `gh` is logged in with (`gh auth token`), or null when it is not. */
export function ghCliCredentials(run: Runner): CliCredentials {
  return {
    async token() {
      try {
        const out = (await run('gh', ['auth', 'token'])).trim()
        return out || null
      } catch {
        return null
      }
    },
  }
}

/**
 * A `Runner` that hands `gh` the stored token through `GH_TOKEN`, so the account connected in
 * Settings is the one every GitHub call uses. Other commands pass through untouched.
 */
export function withGithubToken(run: Runner, token: () => string | null): Runner {
  return (cmd, args, opts = {}) => {
    const current = cmd === 'gh' ? token() : null
    return current ? run(cmd, args, { ...opts, env: { GH_TOKEN: current } }) : run(cmd, args, opts)
  }
}
