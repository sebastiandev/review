import { createOpencodeClient } from '@opencode-ai/sdk'
import type { AppConfig } from '@review/shared'

/** What the opencode server can run: agents and models, for the pickers. */
export async function readOpencodeCatalog(baseUrl: string, directory: string): Promise<Pick<AppConfig, 'agents' | 'models' | 'commands'>> {
  const client = createOpencodeClient({ baseUrl })
  const [agents, providers, commands] = await Promise.all([
    client.app.agents({ query: { directory } }),
    client.config.providers({ query: { directory } }),
    client.command.list({ query: { directory } }),
  ])

  const models: AppConfig['models'] = []
  for (const p of providers.data?.providers ?? []) {
    for (const [modelID, m] of Object.entries(p.models)) {
      // `variants` is on the wire but not yet in the SDK's Model type.
      const variants = (m as { variants?: Record<string, unknown> }).variants ?? {}
      models.push({ providerID: p.id, modelID, name: `${p.name} / ${m.name}`, variants: Object.keys(variants) })
    }
  }

  return {
    agents: (agents.data ?? [])
      // `hidden` is in the wire format (compaction, title, summary) but not yet in the SDK type.
      .filter((a: { mode: string; hidden?: boolean }) => a.mode !== 'subagent' && !a.hidden)
      .map((a) => ({ name: a.name, description: a.description })),
    models,
    commands: (commands.data ?? []).map((c) => ({ name: c.name, description: c.description })),
  }
}
