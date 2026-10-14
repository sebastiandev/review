import { execFile } from 'node:child_process'

/** Run a command and resolve with its stdout. Adapters take one of these so tests can fake the shell. */
export type Runner = (cmd: string, args: string[], opts?: { cwd?: string; input?: string; env?: Record<string, string> }) => Promise<string>

/**
 * `Runner` over `execFile`; rejects on non-zero exit with stderr and stdout in the message.
 * `gh api` prints the HTTP status on stderr but GitHub's error body (the actual reason) on stdout.
 */
export const execFileRunner: Runner = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { cwd: opts.cwd, env: opts.env ? { ...process.env, ...opts.env } : process.env, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${cmd} ${args.join(' ')} failed: ${[stderr.trim() || error.message, stdout.trim()].filter(Boolean).join('\n')}`))
      else resolve(stdout)
    })
    if (opts.input !== undefined) child.stdin?.end(opts.input)
  })
