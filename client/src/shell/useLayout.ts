import { useCallback, useEffect, useState, type PointerEvent } from 'react'
import { clampDockWidth, clampSidebarWidth, computeLayout, DOCK_MIN, DOCK_OPEN_WIDTH, SIDEBAR_DEFAULT, SIDEBAR_MIN, type Layout } from './layout'

const SIDEBAR_KEY = 'review.sidebarWidth'
const DOCK_KEY = 'review.dockWidth'

function storedWidth(key: string, min: number, fallback: number): number {
  const stored = Number(localStorage.getItem(key))
  return stored >= min ? stored : fallback
}

export type LayoutState = Layout & {
  sidebarW: number
  /** The dock's open width (kept while collapsed). */
  dockOpenW: number
  toggleDock: () => void
  /** Sets the preference to open; the dock still auto-collapses below 1060px. */
  openDock: () => void
  /** Begins a pointer drag on the sidebar's right edge. */
  startSidebarResize: (e: PointerEvent<HTMLElement>) => void
  /** Begins a pointer drag on the dock's left edge. */
  startDockResize: (e: PointerEvent<HTMLElement>) => void
}

/**
 * Viewport-driven shell layout. The stored sidebar width is the single source of truth:
 * clamped on drag and on window resize, never at render.
 */
export function useLayout(): LayoutState {
  const [viewportW, setViewportW] = useState(() => window.innerWidth)
  const [dockPreference, setDockPreference] = useState(true)
  const [sidebarW, setSidebarW] = useState(() => storedWidth(SIDEBAR_KEY, SIDEBAR_MIN, SIDEBAR_DEFAULT))
  const [dockOpenW, setDockOpenW] = useState(() => storedWidth(DOCK_KEY, DOCK_MIN, DOCK_OPEN_WIDTH))

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(sidebarW))
  }, [sidebarW])
  useEffect(() => {
    localStorage.setItem(DOCK_KEY, String(dockOpenW))
  }, [dockOpenW])

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth
      setViewportW(w)
      setSidebarW((current) => clampSidebarWidth(current, w, computeLayout(w, dockPreference, current, dockOpenW).dockW))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [dockPreference, dockOpenW])

  const layout = computeLayout(viewportW, dockPreference, sidebarW, dockOpenW)

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

  const startDockResize = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = dockOpenW
      const sidebar = layout.tight ? 0 : sidebarW
      const onMove = (move: globalThis.PointerEvent) => {
        // The dock's left edge moves opposite to the pointer: dragging left widens it.
        setDockOpenW(clampDockWidth(startW - (move.clientX - startX), window.innerWidth, sidebar))
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
    [dockOpenW, sidebarW, layout.tight],
  )

  const toggleDock = useCallback(() => setDockPreference((v) => !v), [])
  const openDock = useCallback(() => setDockPreference(true), [])

  return { ...layout, sidebarW, dockOpenW, toggleDock, openDock, startSidebarResize, startDockResize }
}
