import type { ReactNode } from 'react'

type ModalProps = {
  label: string
  /** Panel width cap; the README uses 520 for Add PR, 560 for Submit review. */
  maxWidth: number
  onClose: () => void
  children: ReactNode
}

/** Fixed dialog over a 78% backdrop. Clicking the backdrop closes; `esc` is handled by the app-level key handler. */
export function Modal({ label, maxWidth, onClose, children }: ModalProps) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={label} style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
