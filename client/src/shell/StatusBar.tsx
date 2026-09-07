type StatusBarProps = {
  /** Scope path, or null while the diff is still loading. */
  scope: string | null
}

/** 26px status bar: `diff mode · {scope}` on the left, `press ? for shortcuts` pushed right. */
export function StatusBar({ scope }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span>diff mode{scope ? ` · ${scope}` : ''}</span>
      <span className="statusbar-hint">press ? for shortcuts</span>
    </footer>
  )
}
