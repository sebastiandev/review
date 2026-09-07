import { describe, expect, it } from 'vitest'
import { clampSidebarWidth, computeLayout } from './layout'

describe('clampSidebarWidth', () => {
  it.each([
    ['keeps a width inside the range', 306, 1440, 344, 306],
    ['raises to the minimum', 100, 1440, 344, 220],
    ['caps at 460 on a wide viewport', 900, 2000, 344, 460],
    ['caps so the centre keeps 480px', 460, 1300, 344, 1300 - 48 - 344 - 480],
    ['the minimum wins when the viewport cannot fit 480px of centre', 300, 900, 344, 220],
  ])('%s', (_, width, viewportW, dockW, expected) => {
    expect(clampSidebarWidth(width, viewportW, dockW)).toBe(expected)
  })
})

describe('computeLayout', () => {
  it('shows sidebar and open dock at the default width', () => {
    expect(computeLayout(1440, true, 306)).toEqual({
      narrow: false,
      dockOpen: true,
      dockW: 344,
      tight: false,
      centerW: 1440 - 48 - 306 - 344,
      compact: false,
    })
  })

  it('hides the sidebar when narrow with the dock open', () => {
    const layout = computeLayout(1200, true, 306)
    expect(layout.tight).toBe(true)
    expect(layout.centerW).toBe(1200 - 48 - 344)
  })

  it('auto-collapses the dock below 1060 without dropping the sidebar', () => {
    const layout = computeLayout(1000, true, 306)
    expect(layout.dockOpen).toBe(false)
    expect(layout.tight).toBe(false)
    expect(layout.centerW).toBe(1000 - 48 - 306 - 44)
  })

  it('flags compact when the centre is under 720', () => {
    expect(computeLayout(1000, false, 306).compact).toBe(true)
  })
})
