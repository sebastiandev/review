import { CaretDown } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

/** Shared fold indicator; the surrounding header is the click target. */
export function FoldCaret({ open }: { open: boolean }) { return <CaretDown size={12} className={`fold-caret${open ? ' is-open' : ''}`} /> }

/** Compact initials avatar with the viewer distinguished through accent tokens. */
export function Avatar({ author, mine = false }: { author: string; mine?: boolean }) {
  return <span className={`comment-avatar${mine ? ' is-me' : ''}`} aria-hidden>{author.slice(0, 2).toUpperCase()}</span>
}

/** Shared accent/neutral conversation tag. */
export function AttentionTag({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return <span className={`attention-tag${accent ? ' accent' : ''}`}>{children}</span>
}

/** Filter chip with a stable count and pressed state. */
export function FilterChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return <button className="filter-chip" aria-pressed={active} onClick={onClick}>{label}<span>{count}</span></button>
}
