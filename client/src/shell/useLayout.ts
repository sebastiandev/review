import { useCallback, useEffect, useState, type PointerEvent } from 'react'
import { clampSidebarWidth, computeLayout, SIDEBAR_DEFAULT, SIDEBAR_MIN, type Layout } from './layout'

const SIDEBAR_KEY = 'review.sidebarWidth'

function storedSidebarWidth(): number {
  const stored = Number(localStorage.getItem(SIDEBAR_KEY))
  return stored >= SIDEBAR_MIN ? stored : SIDEBAR_DEFAULT
}

export type LayoutState = Layout & {
  sidebarW: number
  toggleDock: () => void
  /** Sets the preference to open; the dock still auto-collapses below 1060px. */
  openDock: () => void
  /** Begins a pointer drag on the sidebar's right edge. */
  startSidebarResize: (e: PointerEvent<HTMLElement>) => void
}

/**
 * Viewport-driven shell layout. The stored sidebar width is the single source of truth:
 * clamped on drag and on window resize, never at render.
 */
export function useLayout(): LayoutState {
  const [viewportW, setViewportW] = useState(() => window.innerWidth)
  const [dockPreference, setDockPreference] = useState(true)
  const [sidebarW, setSidebarW] = useState(storedSidebarWidth)

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(sidebarW))
  }, [sidebarW])

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth
      setViewportW(w)
      setSidebarW((current) => clampSidebarWidth(current, w, computeLayout(w, dockPreference, current).dockW))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [dockPreference])

  const layout = computeLayout(viewportW, dockPreference, sidebarW)

  const startSidebarResize = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = sidebarW
      const dockW = layout.dockW
      const onMove = (move: globalThis.PointerEvent) => {
        setSidebarW(clampSidebarWidth(startW + move.clientX - startX, window.innerWidth, dockW))
      }
      const onUp = () => {
        document.body.style.cursor = ''
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      document.body.style.cursor = 'col-resize'
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [sidebarW, layout.dockW],
  )

  const toggleDock = useCallback(() => setDockPreference((v) => !v), [])
  const openDock = useCallback(() => setDockPreference(true), [])

  return { ...layout, sidebarW, toggleDock, openDock, startSidebarResize }
}
