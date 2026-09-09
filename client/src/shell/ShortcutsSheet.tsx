const SHORTCUTS: [key: string, label: string][] = [
  ['⌘K', 'open a pull request (palette)'],
  ['f', 'focus mode'],
  ['j / k', 'next / previous file'],
  ['⏎', 'open selected PR'],
  ['esc', 'back / close'],
  ['u', 'merged diff'],
  ['s', 'side by side'],
  ['m', 'rich ↔ raw markdown'],
  ['c', 'comment on the focused line'],
  ['a', 'ask the agent in place'],
  ['y', 'copy line reference'],
  ['d', 'toggle the chat dock'],
  ['v', 'mark file viewed'],
  ['⌘⏎', 'submit review'],
  ['⌘R', 'run the automatic review'],
  ['?', 'this sheet'],
]

/** The shortcut table alone; the `?` sheet and Settings → Shortcuts both render it. */
export function ShortcutTable() {
  return (
    <div className="shortcut-grid">
      {SHORTCUTS.map(([key, label]) => (
        <div key={key} className="shortcut">
          <span className="shortcut-key">{key}</span>
          <span className="shortcut-label">{label}</span>
        </div>
      ))}
    </div>
  )
}

type ShortcutsSheetProps = { onClose: () => void }

/** The `?` modal: the full shortcut table in two columns. Clicking the backdrop closes it. */
export function ShortcutsSheet({ onClose }: ShortcutsSheetProps) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h4>Keyboard</h4>
          <span className="sheet-hint">? to close</span>
        </div>
        <ShortcutTable />
      </div>
    </div>
  )
}
