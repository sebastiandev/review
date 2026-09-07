import { useEffect, useRef } from 'react'
import { ChatCentered, DotsThree } from '@phosphor-icons/react'
import { LineMenu } from './LineMenu'

/** One rendered diff line: its side, number on that side and text. */
export type LineRef = { path: string; line: number; side: 'old' | 'new'; text: string }

type LineActionButtonProps = {
  lineRef: LineRef
  menuOpen: boolean
  onToggleMenu: () => void
  /** Fired on a pointer-down outside the button and its menu. */
  onCloseMenu: () => void
  onAsk: (ref: LineRef) => void
  onCopyRef: (ref: LineRef) => void
}

/** 18px `⋯` button on a diff line; opens the line menu, which closes on an outside pointer-down. */
export function LineActionButton({ lineRef, menuOpen, onToggleMenu, onCloseMenu, onAsk, onCopyRef }: LineActionButtonProps) {
  const slot = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && slot.current?.contains(e.target)) return
      onCloseMenu()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen, onCloseMenu])

  return (
    <span ref={slot} className="line-action-slot">
      <button
        type="button"
        className="line-action"
        aria-label="Line actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
      >
        <DotsThree size={11} weight="bold" />
      </button>
      {menuOpen && <LineMenu lineRef={lineRef} onAsk={onAsk} onCopyRef={onCopyRef} />}
    </span>
  )
}

type ChatMarkerProps = {
  /** True while this line's chat card is showing. */
  open: boolean
  onClick: () => void
}

/** 18px gutter marker on a line that has a chat thread; click reopens or minimizes its card. */
export function ChatMarker({ open, onClick }: ChatMarkerProps) {
  return (
    <button
      type="button"
      className={`chat-marker${open ? ' chat-marker-open' : ''}`}
      title={open ? 'Minimize this chat' : 'Reopen this chat'}
      aria-pressed={open}
      onClick={onClick}
    >
      <ChatCentered size={11} weight="fill" />
    </button>
  )
}
