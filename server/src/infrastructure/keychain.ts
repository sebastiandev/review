import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Credential, CredentialStore } from '../domain/accounts.ts'
import type { ProviderKind } from '../domain/pullRequests.ts'
import type { Runner } from './process.ts'

const SERVICE = 'review'

/**
 * `CredentialStore` over the macOS keychain (`security`). One generic password per provider,
 * the whole credential JSON as the secret so login and scopes travel with the token.
 */
export function keychainCredentialStore(run: Runner): CredentialStore {
  return {
    async read(provider) {
      try {
        const out = await run('security', ['find-generic-password', '-s', SERVICE, '-a', provider, '-w'])
        return JSON.parse(out.trim()) as Credential
      } catch {
        return null
      }
    },
    async write(credential) {
      await run('security', ['add-generic-password', '-U', '-s', SERVICE, '-a', credential.provider, '-w', JSON.stringify(credential)])
    },
    async delete(provider) {
      try {
        await run('security', ['delete-generic-password', '-s', SERVICE, '-a', provider])
      } catch {
        // Nothing stored: already the state we want.
      }
    },
  }
}

/** `CredentialStore` in a 0600 JSON file, for platforms without the macOS keychain. */
export function fileCredentialStore(path: string): CredentialStore {
  const readAll = async (): Promise<Partial<Record<ProviderKind, Credential>>> => {
    try {
      return JSON.parse(await readFile(path, 'utf8'))
    } catch {
      return {}
    }
  }
  const writeAll = async (all: Partial<Record<ProviderKind, Credential>>) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(all), { mode: 0o600 })
    await chmod(path, 0o600)
  }
  return {
    read: async (provider) => (await readAll())[provider] ?? null,
    async write(credential) {
      await writeAll({ ...(await readAll()), [credential.provider]: credential })
    },
    async delete(provider) {
      const all = await readAll()
      delete all[provider]
      if (Object.keys(all).length === 0) await rm(path, { force: true })
      else await writeAll(all)
    },
  }
}
