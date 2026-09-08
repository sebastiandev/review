export const RAIL_WIDTH = 48
export const DOCK_OPEN_WIDTH = 344
export const DOCK_MIN = 280
export const DOCK_MAX = 640
export const DOCK_RAIL_WIDTH = 44
export const SIDEBAR_DEFAULT = 306
export const SIDEBAR_MIN = 220
export const SIDEBAR_MAX = 460
/** The diff pane never drops below this when the sidebar is clamped. */
export const CENTER_MIN = 480

export const NARROW_BELOW = 1300
export const DOCK_AUTO_COLLAPSE_BELOW = 1060
export const COMPACT_HEADER_BELOW = 720

/** Dock width clamped to `[280, min(640, viewportW − rail − sidebar − 480)]`; the lower bound wins when they cross. */
export function clampDockWidth(width: number, viewportW: number, sidebarW: number): number {
  const max = Math.max(DOCK_MIN, Math.min(DOCK_MAX, viewportW - RAIL_WIDTH - sidebarW - CENTER_MIN))
  return Math.max(DOCK_MIN, Math.min(max, width))
}

/** Sidebar width clamped to `[220, min(460, viewportW − rail − dock − 480)]`; the lower bound wins when they cross. */
export function clampSidebarWidth(width: number, viewportW: number, dockW: number): number {
  const max = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, viewportW - RAIL_WIDTH - dockW - CENTER_MIN))
  return Math.max(SIDEBAR_MIN, Math.min(max, width))
}

export type Layout = {
  narrow: boolean
  /** The dock as actually shown: the preference, auto-collapsed below 1060px. */
  dockOpen: boolean
  dockW: number
  /** Sidebar hidden in favour of the top PR bar. */
  tight: boolean
  centerW: number
  /** File header toolbar drops to its own row; "Side by side" becomes "Split". */
  compact: boolean
}

/** Derives the responsive layout from the viewport, the dock preference and the stored sidebar and dock widths. */
export function computeLayout(viewportW: number, dockPreference: boolean, sidebarW: number, dockOpenW: number = DOCK_OPEN_WIDTH): Layout {
  const narrow = viewportW < NARROW_BELOW
  const dockOpen = dockPreference && viewportW >= DOCK_AUTO_COLLAPSE_BELOW
  const dockW = dockOpen ? dockOpenW : DOCK_RAIL_WIDTH
  const tight = narrow && dockOpen
  const centerW = viewportW - RAIL_WIDTH - (tight ? 0 : sidebarW) - dockW
  return { narrow, dockOpen, dockW, tight, centerW, compact: centerW < COMPACT_HEADER_BELOW }
}
