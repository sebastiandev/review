import { mkdirSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PayloadFiles } from '../domain/agentRunner.ts'

/** `PayloadFiles` under `dir` (created if missing), one file per run. */
export function fsPayloads(dir: string): PayloadFiles {
  mkdirSync(dir, { recursive: true })
  return {
    pathFor: (r) => join(dir, `pr-${r.prId}-${r.headSha}-${r.id}.json`),
    diffPathFor: (r) => join(dir, `pr-${r.prId}-${r.headSha}-${r.id}.diff`),
    write: (path, text) => writeFile(path, text, 'utf8'),
    async read(path) {
      try {
        return await readFile(path, 'utf8')
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw e
      }
    },
  }
}

/** Whether a regular file exists at `path`. */
export async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}
