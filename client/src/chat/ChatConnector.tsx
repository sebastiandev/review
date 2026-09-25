import { useLayoutEffect, useState, type RefObject } from 'react'

/** Fixed elbow from selected diff rows to the dock quote; clipped/dashed when the rows scroll offscreen. */
export function ChatConnector({ bodyRef, active }: { bodyRef: RefObject<HTMLDivElement | null>; active: boolean }) {
  const [geometry, setGeometry] = useState('')
  useLayoutEffect(() => {
    const measure = () => {
      const body = bodyRef.current
      const quote = document.querySelector('[data-dock-quote]')
      const rows = body?.querySelectorAll<HTMLElement>('.drow-anchored, .side-anchored')
      if (!active || !body || !quote || !rows?.length) { setGeometry(''); return }
      const pane = body.getBoundingClientRect(), card = quote.getBoundingClientRect()
      const first = rows[0]!.getBoundingClientRect(), last = rows[rows.length - 1]!.getBoundingClientRect()
      const top = Math.max(pane.top, Math.min(pane.bottom, first.top))
      const bottom = Math.max(pane.top, Math.min(pane.bottom, last.bottom))
      setGeometry(JSON.stringify({ x: Math.min(first.right, pane.right), y: (top + bottom) / 2, top, bottom, endX: card.left, endY: card.top + 15, dashed: last.bottom < pane.top || first.top > pane.bottom }))
    }
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    const observer = new ResizeObserver(measure)
    if (bodyRef.current) observer.observe(bodyRef.current)
    const quote = document.querySelector('[data-dock-quote]')
    if (quote) observer.observe(quote)
    return () => { window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure); observer.disconnect() }
  })
  if (!geometry || !active) return null
  const g = JSON.parse(geometry) as { x: number; y: number; top: number; bottom: number; endX: number; endY: number; dashed: boolean }
  const seam = g.endX - 15, d = Math.sign(g.endY - g.y) || 1, r = Math.min(8, Math.abs(g.endY - g.y) / 2)
  return <svg className="chat-connector" aria-hidden><path strokeWidth="2" d={`M ${g.x} ${g.top} V ${g.bottom}`} /><path strokeWidth="1.5" strokeDasharray={g.dashed ? '4 4' : undefined} d={`M ${g.x} ${g.y} H ${seam - 8} Q ${seam} ${g.y} ${seam} ${g.y + d * r} V ${g.endY - d * r} Q ${seam} ${g.endY} ${seam + 8} ${g.endY} H ${g.endX}`} /><circle cx={g.x} cy={g.y} r="3.5" /><circle cx={g.endX} cy={g.endY} r="3.5" /></svg>
}
