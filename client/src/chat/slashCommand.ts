/** Client-side pickers reachable as slash commands. */
export const LOCAL_COMMANDS = ['models', 'agents', 'variants'] as const

export type LocalCommand = (typeof LOCAL_COMMANDS)[number]

export type SlashCommand =
  | { kind: 'local'; name: LocalCommand }
  | { kind: 'server'; name: string; args: string }
  | { kind: 'text' }

const SLASH = /^\/(\S+)(?:\s([\s\S]*))?$/

function isLocalCommand(name: string): name is LocalCommand {
  return (LOCAL_COMMANDS as readonly string[]).includes(name)
}

/** Classifies a composer draft: a local picker, a known server command with its arguments, or plain text. */
export function parseSlashCommand(draft: string, knownCommands: string[]): SlashCommand {
  const match = SLASH.exec(draft.trim())
  if (!match) return { kind: 'text' }
  const name = match[1]!
  const args = (match[2] ?? '').trim()
  if (isLocalCommand(name) && args === '') return { kind: 'local', name }
  if (knownCommands.includes(name)) return { kind: 'server', name, args }
  return { kind: 'text' }
}

/** True while the draft is a bare `/word` the autocomplete should filter on. */
export function slashPrefix(draft: string): string | null {
  const match = /^\/(\S*)$/.exec(draft)
  return match ? match[1]! : null
}
