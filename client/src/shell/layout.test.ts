import { describe, expect, it } from 'vitest'
import { clampDockWidth, clampSidebarWidth, computeLayout } from './layout'

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

describe('clampDockWidth', () => {
  it.each([
    ['keeps a width inside the range', 400, 1440, 306, 400],
    ['raises to the minimum', 100, 1440, 306, 280],
    ['caps at 960 on a wide viewport', 1200, 2000, 306, 960],
    ['caps so the centre keeps 480px', 640, 1300, 306, 1300 - 48 - 306 - 480],
    ['the minimum wins when the viewport cannot fit 480px of centre', 400, 900, 306, 280],
  ])('%s', (_, width, viewportW, sidebarW, expected) => {
    expect(clampDockWidth(width, viewportW, sidebarW)).toBe(expected)
  })
})

describe('computeLayout with a resized dock', () => {
  it('uses the stored open width for the dock and the centre', () => {
    const layout = computeLayout(1600, true, 306, 500)
    expect(layout.dockW).toBe(500)
    expect(layout.centerW).toBe(1600 - 48 - 306 - 500)
  })

  it('ignores the open width while collapsed', () => {
    expect(computeLayout(1000, true, 306, 500).dockW).toBe(44)
  })
})
