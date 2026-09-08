import { describe, expect, it } from 'vitest'
import { fakeCli, fakeCredentialStore, fakeDeviceFlow, noSleep } from '../testing/fakes.ts'
import { CliNotAuthenticated, DeviceFlowFailed, DeviceFlowUnavailable } from '../errors.ts'
import { completeDeviceFlow, connectWithCli, startDeviceFlow, type ConnectAccountDeps } from './connectAccount.ts'

const deps = (overrides: Partial<ConnectAccountDeps> = {}): ConnectAccountDeps => ({
  credentials: fakeCredentialStore(),
  deviceFlow: fakeDeviceFlow(),
  cli: fakeCli(),
  sleep: noSleep,
  ...overrides,
})

describe('connectWithCli', () => {
  it('stores the CLI token under the login it identifies as', async () => {
    const d = deps()
    const credential = await connectWithCli(d)
    expect(credential).toMatchObject({ provider: 'github', token: 'tok-cli', login: 'sebastiandev', source: 'cli' })
    expect(await d.credentials.read('github')).toEqual(credential)
  })

  it('refuses when the CLI is not logged in', async () => {
    await expect(connectWithCli(deps({ cli: fakeCli(null) }))).rejects.toBeInstanceOf(CliNotAuthenticated)
  })
})

describe('startDeviceFlow', () => {
  it('refuses without a client id', async () => {
    const flow = fakeDeviceFlow()
    flow.available = false
    await expect(startDeviceFlow(deps({ deviceFlow: flow }))).rejects.toBeInstanceOf(DeviceFlowUnavailable)
  })
})

describe('completeDeviceFlow', () => {
  const grant = { deviceCode: 'dev-1', userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device', expiresIn: 900, interval: 5 }

  it('polls until granted, then stores the oauth credential', async () => {
    const flow = fakeDeviceFlow([{ status: 'pending' }, { status: 'pending' }, { status: 'granted', token: 'tok-oauth' }])
    const d = deps({ deviceFlow: flow })
    const credential = await completeDeviceFlow(d, grant)
    expect(credential).toMatchObject({ token: 'tok-oauth', login: 'sebastiandev', source: 'oauth' })
    expect(flow.calls.filter((c) => c.startsWith('poll'))).toHaveLength(3)
  })

  it('waits the interval before each poll and backs off on slow_down', async () => {
    const waits: number[] = []
    const flow = fakeDeviceFlow([{ status: 'slow_down' }, { status: 'pending' }, { status: 'granted', token: 'tok-oauth' }])
    await completeDeviceFlow(deps({ deviceFlow: flow, sleep: async (s) => void waits.push(s) }), grant)
    expect(waits).toEqual([5, 10, 10])
  })

  it('throws on denial and stores nothing', async () => {
    const d = deps({ deviceFlow: fakeDeviceFlow([{ status: 'failed', message: 'authorization was denied' }]) })
    await expect(completeDeviceFlow(d, grant)).rejects.toBeInstanceOf(DeviceFlowFailed)
    expect(await d.credentials.read('github')).toBeNull()
  })

  it('stops polling once cancelled and resolves null', async () => {
    let cancelled = false
    const flow = fakeDeviceFlow([{ status: 'pending' }])
    const d = deps({
      deviceFlow: flow,
      sleep: async () => {
        cancelled = true
      },
    })
    expect(await completeDeviceFlow(d, grant, () => cancelled)).toBeNull()
    expect(flow.calls).toEqual([])
  })
})
