import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { DiffMode } from '../diff/DiffView'
import { ApiError, LOCAL_SCOPE, fetchDiff } from '../api'
import { OpenScopeForm } from './OpenScopeForm'
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

/**
 * Diff mode: the `local` scope's diff with the scope selector and localStorage viewed marks. Until a
 * folder or patch is opened (PR-mode server), or when the user asks to change it, the open form shows.
 */
export function DiffWorkspace({ layout, defaultDiffMode, scopeMenuOpen, onToggleScopeMenu, onScope }: DiffWorkspaceProps) {
  const diff = useQuery({ queryKey: ['diff', LOCAL_SCOPE], queryFn: () => fetchDiff(LOCAL_SCOPE), retry: false })
  const [changing, setChanging] = useState(false)
  const document = diff.data
  const scopePath = document ? scopeLabel(document.source) : null
  const viewed = useViewed(scopePath)

  useEffect(() => onScope(scopePath), [onScope, scopePath])

  const nothingOpen = diff.isError && diff.error instanceof ApiError && diff.error.status === 404
  if (!document || changing) {
    return (
      <main className="center">
        {diff.isPending && <p className="notice">Loading diff…</p>}
        {diff.isError && !nothingOpen && <p className="notice">Could not load the diff: {String(diff.error)}</p>}
        {(nothingOpen || changing) && (
          <div className="inbox">
            <OpenScopeForm
              lede={changing ? 'Pick another folder or patch to review.' : 'Nothing is open yet. Point Review at a repository folder or a patch file.'}
              onOpened={() => setChanging(false)}
              onCancel={changing ? () => setChanging(false) : undefined}
            />
          </div>
        )}
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
      sidebarHeader={
        <ScopeSelector
          document={document}
          menuOpen={scopeMenuOpen}
          onToggleMenu={onToggleScopeMenu}
          onOpenOther={() => {
            onToggleScopeMenu()
            setChanging(true)
          }}
        />
      }
      topBarLead={<span className="toppr-scope">{scopePath}</span>}
    />
  )
}
