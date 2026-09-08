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

export type Mention = { start: number; query: string }

/**
 * An `@` mention being typed at `caret`: the `@` must start the draft or follow whitespace, and the
 * text between it and the caret has no whitespace. Returns where it starts and what was typed so far.
 */
export function mentionAt(draft: string, caret: number): Mention | null {
  const before = draft.slice(0, caret)
  const match = /(?:^|\s)@([^\s@]*)$/.exec(before)
  if (!match) return null
  return { start: caret - match[1]!.length - 1, query: match[1]! }
}

/** The draft with the mention at `mention` replaced by `@path ` and where the caret lands afterwards. */
export function completeMention(draft: string, mention: Mention, caret: number, path: string): { draft: string; caret: number } {
  const inserted = `@${path} `
  return { draft: draft.slice(0, mention.start) + inserted + draft.slice(caret), caret: mention.start + inserted.length }
}
