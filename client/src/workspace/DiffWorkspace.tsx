import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { DiffMode } from '../diff/DiffView'
import { LOCAL_SCOPE, fetchDiff } from '../api'
import { ScopeSelector } from '../files/ScopeSelector'
import { scopeLabel } from '../files/scope'
import { useViewed } from '../files/useViewed'
import type { LayoutState } from '../shell/useLayout'
import { Workspace } from './Workspace'

type DiffWorkspaceProps = {
  layout: LayoutState
  defaultDiffMode: DiffMode
  scopeMenuOpen: boolean
  onToggleScopeMenu: () => void
  /** Reports the scope path for the status bar once the diff has loaded. */
  onScope: (path: string | null) => void
}

/** Diff mode: the `local` scope's diff with the scope selector and localStorage viewed marks. */
export function DiffWorkspace({ layout, defaultDiffMode, scopeMenuOpen, onToggleScopeMenu, onScope }: DiffWorkspaceProps) {
  const diff = useQuery({ queryKey: ['diff', LOCAL_SCOPE], queryFn: () => fetchDiff(LOCAL_SCOPE) })
  const document = diff.data
  const scopePath = document ? scopeLabel(document.source) : null
  const viewed = useViewed(scopePath)

  useEffect(() => onScope(scopePath), [onScope, scopePath])

  if (!document) {
    return (
      <main className="center">
        {diff.isPending && <p className="notice">Loading diff…</p>}
        {diff.isError && <p className="notice">Could not load the diff: {String(diff.error)}</p>}
      </main>
    )
  }

  return (
    <Workspace
      scope={LOCAL_SCOPE}
      document={document}
      layout={layout}
      viewed={viewed}
      defaultDiffMode={defaultDiffMode}
      chatEnabled
      sidebarHeader={<ScopeSelector document={document} menuOpen={scopeMenuOpen} onToggleMenu={onToggleScopeMenu} />}
      topBarLead={<span className="toppr-scope">{scopePath}</span>}
    />
  )
}
