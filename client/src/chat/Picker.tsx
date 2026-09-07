import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type RefObject } from 'react'

export type PickerItem = { id: string; label: string; hint?: string }

type PickerProps = {
  items: PickerItem[]
  currentId?: string
  onPick: (item: PickerItem) => void
  onClose: () => void
  /**
   * Controlled filter. When set the picker renders no input of its own and reads
   * ↑/↓/Enter/Esc from `keySource` instead (the composer's textarea).
   */
  filter?: string
  keySource?: RefObject<HTMLElement | null>
}

function matches(items: PickerItem[], filter: string): PickerItem[] {
  const needle = filter.trim().toLowerCase()
  if (!needle) return items
  return items.filter((item) => item.label.toLowerCase().includes(needle))
}

/** Popover list with a filter; ↑/↓ move, Enter picks, Esc closes, click picks. */
export function Picker({ items, currentId, onPick, onClose, filter, keySource }: PickerProps) {
  const controlled = filter !== undefined
  const [ownFilter, setOwnFilter] = useState('')
  const [index, setIndex] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const visible = matches(items, controlled ? filter : ownFilter)
  const clamped = Math.min(index, Math.max(0, visible.length - 1))

  useEffect(() => {
    const row = root.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    row?.scrollIntoView({ block: 'nearest' })
  }, [clamped, visible.length])

  const steer = (key: string): boolean => {
    if (key === 'ArrowDown') setIndex(Math.min(clamped + 1, visible.length - 1))
    else if (key === 'ArrowUp') setIndex(Math.max(clamped - 1, 0))
    else if (key === 'Enter') {
      const item = visible[clamped]
      if (item) onPick(item)
    } else if (key === 'Escape') onClose()
    else return false
    return true
  }

  useEffect(() => {
    const element = keySource?.current
    if (!controlled || !element) return
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (steer(e.key)) {
        e.preventDefault()
        // Native stopPropagation keeps React's textarea handler from also seeing this key.
        e.stopPropagation()
      }
    }
    element.addEventListener('keydown', onKeyDown)
    return () => element.removeEventListener('keydown', onKeyDown)
  })

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (steer(e.key)) e.preventDefault()
  }

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!controlled && !root.current?.contains(e.relatedTarget)) onClose()
  }

  return (
    <div ref={root} className="picker" role="listbox" onBlur={onBlur}>
      {!controlled && (
        <input
          className="picker-filter"
          autoFocus
          value={ownFilter}
          placeholder="Filter…"
          onChange={(e) => {
            setOwnFilter(e.target.value)
            setIndex(0)
          }}
          onKeyDown={onInputKeyDown}
        />
      )}
      <div className="picker-list">
        {visible.map((item, i) => (
          <button
            type="button"
            key={item.id}
            role="option"
            aria-selected={i === clamped}
            className={`picker-item${i === clamped ? ' picker-item-active' : ''}`}
            onMouseEnter={() => setIndex(i)}
            // Keep focus where it is (filter input or textarea) so blur does not close us before the click lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(item)}
          >
            <span className="picker-mark" aria-hidden>
              {item.id === currentId ? '•' : ''}
            </span>
            <span className="picker-label">{item.label}</span>
            {item.hint && <span className="picker-hint">{item.hint}</span>}
          </button>
        ))}
        {visible.length === 0 && <span className="picker-empty">No matches</span>}
      </div>
    </div>
  )
}
