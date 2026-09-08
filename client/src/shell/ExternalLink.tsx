import { ArrowSquareOut } from '@phosphor-icons/react'
import type { MouseEvent } from 'react'

type ExternalLinkProps = { href: string; label: string; className?: string }

/** Icon link that opens `href` in a new tab without triggering the row/card it sits in. */
export function ExternalLink({ href, label, className = 'ext-link' }: ExternalLinkProps) {
  const stop = (e: MouseEvent) => e.stopPropagation()
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className} title={label} aria-label={label} onClick={stop} onKeyDown={(e) => e.stopPropagation()}>
      <ArrowSquareOut size={13} />
    </a>
  )
}
